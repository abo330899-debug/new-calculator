import { Pool } from "pg";
import bcrypt from "bcryptjs";
import OpenAI from "openai";
import { z } from "zod";

interface Env {
  DATABASE_URL: string;
  SESSION_SECRET: string;
  OPENAI_API_KEY: string;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

const enc = new TextEncoder();

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function makeSessionCookie(payload: object, secret: string): Promise<string> {
  const data = btoa(JSON.stringify(payload));
  const sig = await hmacSign(data, secret);
  return `${data}.${sig}`;
}

async function parseSessionCookie(cookie: string, secret: string): Promise<any | null> {
  try {
    const [data, sig] = cookie.split(".");
    if (!data || !sig) return null;
    const expected = await hmacSign(data, secret);
    if (expected !== sig) return null;
    return JSON.parse(atob(data));
  } catch { return null; }
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k.trim() === name) return v.join("=");
  }
  return null;
}

// ── Response helpers ──────────────────────────────────────────────────────────

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function err(msg: string, status = 500): Response {
  return json({ error: msg }, status);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function getPool(env: Env): Pool {
  return new Pool({ connectionString: env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000 });
}

function mapProduct(r: any) {
  return {
    id: r.id,
    hs_code: r.hs_code,
    cst_code: r.cst_code,
    description: r.description,
    unit: r.unit,
    weight: r.weight,
    unit_price: r.unit_price,
    is_protected: r.is_protected,
    protection_level: r.protection_level,
    protection_percentage: r.protection_percentage,
    decision_action: r.decision_action,
    decision_risk: r.decision_risk,
    decision_reason: r.decision_reason,
    min_value: r.min_value,
    avg_value: r.avg_value,
    max_value: r.max_value,
    duty_rate: r.duty_rate,
    currency: r.currency,
  };
}

async function searchProducts(pool: Pool, query: string, limit = 30): Promise<any[]> {
  const trimmed = query.trim();
  const hsDigits = trimmed.replace(/[^\d]/g, "");

  if (hsDigits.length >= 4) {
    const r = await pool.query(
      "SELECT * FROM products WHERE hs_code LIKE $1 ORDER BY hs_code LIMIT $2",
      [hsDigits + "%", limit]
    );
    if (r.rows.length > 0) return r.rows;
  }

  const r = await pool.query(
    "SELECT * FROM products WHERE description ILIKE $1 LIMIT $2",
    [`%${trimmed}%`, limit]
  );
  return r.rows;
}

async function getProductsByHs(pool: Pool, hs: string, unit?: string, limit = 50): Promise<any[]> {
  const clean = hs.replace(/[^\d]/g, "");
  if (unit) {
    const r = await pool.query(
      "SELECT * FROM products WHERE hs_code=$1 AND unit=$2 LIMIT $3",
      [clean, unit, limit]
    );
    if (r.rows.length > 0) return r.rows;
  }
  const exact = await pool.query("SELECT * FROM products WHERE hs_code=$1 LIMIT $2", [clean, limit]);
  if (exact.rows.length > 0) return exact.rows;
  if (clean.length >= 4 && clean.length < 8) {
    const like = await pool.query(
      "SELECT * FROM products WHERE hs_code LIKE $1 LIMIT $2",
      [clean + "%", limit]
    );
    return like.rows;
  }
  return [];
}

// ── Manifest helpers ──────────────────────────────────────────────────────────

const GOODS_CATEGORIES = [
  "food_basic","food_processed","medical","agriculture","education",
  "solar","raw_materials","computers","industrial","construction",
  "electrical","vehicles","electronics","smartphones","clothing",
  "household","consumer","luxury_goods","jewelry","machinery",
  "cleaning","tobacco","alcohol"
];

const SYSTEM_PROMPT = `You are a senior Iraqi customs document analyst with deep expertise in reading Iraqi customs documents.
Extract ALL data from the document image.

Return ONLY a valid JSON object with this exact structure:
{
  "declaration_number": "string or empty",
  "declaration_date": "YYYY-MM-DD or empty",
  "checkpoint": "Arabic checkpoint name or empty",
  "importer_name": "string or empty",
  "origin_country": "country name or empty",
  "currency": "ISO code like USD, EUR, TRY",
  "fx_rate": 0,
  "total_packages": 0,
  "transport_method": "بري or بحري or جوي or empty",
  "container_number": "string or empty",
  "duty_paid_usd": 0,
  "tax_paid_usd": 0,
  "total_value_usd": 0,
  "items": [
    {
      "item_number": 1,
      "hs_code": "string",
      "description": "Arabic description",
      "quantity": 0,
      "unit": "string",
      "unit_value": 0,
      "total_value": 0,
      "duty_rate": 0.0,
      "duty_amount": 0,
      "origin": "country or empty",
      "goods_category": "one of: ${GOODS_CATEGORIES.join(", ")}"
    }
  ]
}

IMPORTANT:
- Read EVERY row in the items table — do NOT skip any line
- Convert Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) to Latin digits
- Duty rates as decimals: 5% → 0.05, 30% → 0.30
- Return ONLY JSON, no markdown`;

function normalizeManifest(parsed: any) {
  let items: any[] = Array.isArray(parsed) ? parsed : (parsed.items || [parsed]);
  const normalized = items.map((item: any, idx: number) => ({
    item_number: Number(item.item_number) || idx + 1,
    hs_code: String(item.hs_code || "").replace(/[^\d]/g, "").trim(),
    description: String(item.description || "").trim(),
    quantity: Number(item.quantity) || 1,
    unit_value: Number(item.unit_value) || 0,
    total_value: Number(item.total_value) || 0,
    unit: String(item.unit || "").trim().toUpperCase(),
    duty_amount: Number(item.duty_amount) || 0,
    duty_rate: Number(item.duty_rate) || 0,
    origin: String(item.origin || "").trim(),
    goods_category: GOODS_CATEGORIES.includes(String(item.goods_category || ""))
      ? String(item.goods_category) : "consumer",
  }));

  const dutyPaid = Number(parsed.duty_paid_usd) || 0;
  const taxPaid = Number(parsed.tax_paid_usd) || 0;

  return {
    declaration_number: String(parsed.declaration_number || "").trim(),
    declaration_date: String(parsed.declaration_date || "").trim(),
    checkpoint: String(parsed.checkpoint || "").trim(),
    importer_name: String(parsed.importer_name || "").trim(),
    origin_country: String(parsed.origin_country || "").trim(),
    currency: String(parsed.currency || "USD").trim().toUpperCase(),
    fx_rate: Number(parsed.fx_rate) || 0,
    total_packages: Number(parsed.total_packages) || 0,
    transport_method: String(parsed.transport_method || "").trim(),
    container_number: String(parsed.container_number || "").trim(),
    paid_amount_usd: dutyPaid + taxPaid,
    duty_paid_usd: dutyPaid,
    tax_paid_usd: taxPaid,
    total_value_usd: Number(parsed.total_value_usd) || 0,
    items: normalized,
  };
}

// ── Rate limiter (in-memory per isolate) ──────────────────────────────────────

const limiters = new Map<string, Map<string, { count: number; resetAt: number }>>();

function checkLimit(limiterKey: string, id: string, maxReq: number, windowMs: number): boolean {
  if (!limiters.has(limiterKey)) limiters.set(limiterKey, new Map());
  const m = limiters.get(limiterKey)!;
  const now = Date.now();
  let e = m.get(id);
  if (!e || now >= e.resetAt) { e = { count: 0, resetAt: now + windowMs }; m.set(id, e); }
  e.count++;
  return e.count <= maxReq;
}

// ── Validation schemas ────────────────────────────────────────────────────────

const calcItemSchema = z.object({
  hs_code: z.string(),
  quantity: z.number().positive(),
  unit: z.string().optional().nullable(),
  avg_value: z.number().min(0),
  duty_rate: z.number().min(0),
  goods_category: z.string().optional().default("consumer"),
  paid_duty: z.number().min(0).default(0),
});

const calcRequestSchema = z.object({
  fx_rate: z.number().positive().default(1320),
  items: z.array(calcItemSchema).min(1).max(100),
});

const authSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(8),
});

const tariffTableSchema = z.object({
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(250).default(10),
  hsSearchTerm: z.string().max(20).optional().default(""),
  descriptionSearchTerm: z.string().max(200).optional().default(""),
  sortColumn: z.string().nullable().optional().default(null),
  sortDirection: z.enum(["asc", "desc"]).optional().default("asc"),
  columnFilters: z.record(z.string(), z.array(z.string().max(200)).max(200)).optional().default({}),
});

const TARIFF_COLUMNS = ["hsCode","description","unit","dutyRate","avgValue"] as const;
type TariffCol = typeof TARIFF_COLUMNS[number];

function getTariffCol(col: string): TariffCol | null {
  const idx = parseInt(col);
  if (!isNaN(idx) && idx >= 0 && idx < TARIFF_COLUMNS.length) return TARIFF_COLUMNS[idx];
  if (TARIFF_COLUMNS.includes(col as TariffCol)) return col as TariffCol;
  return null;
}

function tariffDbCol(field: TariffCol): string {
  if (field === "hsCode") return "hs_code";
  if (field === "dutyRate") return "duty_rate";
  if (field === "avgValue") return "avg_value";
  return field;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // Strip /api prefix for routing
  const rawPath = url.pathname.replace(/^\/api/, "") || "/";
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  // CORS
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Session helper
  const sessionCookie = getCookie(request, "session");
  let session: { userId?: string; username?: string } = {};
  if (sessionCookie && env.SESSION_SECRET) {
    session = (await parseSessionCookie(sessionCookie, env.SESSION_SECRET)) || {};
  }

  async function withSession(data: object, response: Response): Promise<Response> {
    const cookieVal = await makeSessionCookie(data, env.SESSION_SECRET || "fallback");
    const headers = new Headers(response.headers);
    headers.set("Set-Cookie", `session=${cookieVal}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
    return new Response(response.body, { status: response.status, headers });
  }

  function jsonCors(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  function errCors(msg: string, status = 500): Response {
    return jsonCors({ error: msg }, status);
  }

  const pool = getPool(env);

  try {
    // ── GET /health ──────────────────────────────────────────────────────────
    if (rawPath === "/health" && method === "GET") {
      return jsonCors({ ok: true });
    }

    // ── GET /checkpoints ────────────────────────────────────────────────────
    if (rawPath === "/checkpoints" && method === "GET") {
      const cps = await pool.query("SELECT * FROM checkpoints ORDER BY id");
      const fees = await pool.query("SELECT * FROM checkpoint_fees");
      const out = cps.rows.map((cp: any) => ({
        id: cp.id,
        name: cp.name,
        fees: fees.rows
          .filter((f: any) => f.checkpoint_id === cp.id)
          .map((f: any) => ({ code: f.code, label: f.label, amount_iqd: f.amount_iqd })),
      }));
      return jsonCors(out);
    }

    // ── GET /products ────────────────────────────────────────────────────────
    if (rawPath === "/products" && method === "GET") {
      const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50"), 1), 200);
      const offset = (page - 1) * limit;
      const rows = await pool.query("SELECT * FROM products ORDER BY hs_code LIMIT $1 OFFSET $2", [limit, offset]);
      const total = await pool.query("SELECT COUNT(*) as c FROM products");
      const totalCount = parseInt(total.rows[0].c);
      return jsonCors({
        products: rows.rows.map(mapProduct),
        page,
        total_pages: Math.ceil(totalCount / limit),
        total_count: totalCount,
      });
    }

    // ── GET /search ──────────────────────────────────────────────────────────
    if (rawPath === "/search" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30"), 1), 100);
      if (q.length < 2) return errCors("Query must be at least 2 characters", 400);
      const rows = await searchProducts(pool, q, limit);
      return jsonCors(rows.map(mapProduct));
    }

    // ── GET /hs/:code ────────────────────────────────────────────────────────
    const hsMatch = rawPath.match(/^\/hs\/([^/]+)$/);
    if (hsMatch && method === "GET") {
      const hs = hsMatch[1].replace(/[^\d]/g, "").trim();
      if (!hs) return errCors("Invalid HS code", 400);
      const unit = url.searchParams.get("unit") || undefined;
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50"), 1), 200);
      const rows = await getProductsByHs(pool, hs, unit, limit);
      return jsonCors(rows.map(mapProduct));
    }

    // ── POST /calculate ──────────────────────────────────────────────────────
    if (rawPath === "/calculate" && method === "POST") {
      if (!checkLimit("calc", ip, 30, 60000)) return errCors("Too many requests", 429);
      const body = await request.json() as any;
      const parsed = calcRequestSchema.parse(body);
      const fxRate = parsed.fx_rate;
      const itemsOut: any[] = [];
      let totalDutyUsd = 0, totalPaidUsd = 0;
      for (const it of parsed.items) {
        const hs = it.hs_code.replace(/[^\d]/g, "").trim();
        const rows = await getProductsByHs(pool, hs, it.unit || undefined, 1);
        const row = rows[0] || null;
        const dutyUsd = it.quantity * it.avg_value * it.duty_rate;
        const paidUsd = it.paid_duty || 0;
        totalDutyUsd += dutyUsd;
        totalPaidUsd += paidUsd;
        itemsOut.push({
          hs_code: hs,
          description: row?.description || "",
          quantity: it.quantity,
          unit: row?.unit || it.unit || "",
          avg_value: it.avg_value,
          duty_rate: it.duty_rate,
          goods_category: it.goods_category,
          duty_usd: dutyUsd,
          paid_duty_usd: paidUsd,
          difference_usd: paidUsd - dutyUsd,
          difference_iqd: Math.round((paidUsd - dutyUsd) * fxRate),
        });
      }
      return jsonCors({
        fx_rate: fxRate,
        items: itemsOut,
        summary: {
          total_duty_usd: totalDutyUsd,
          total_paid_usd: totalPaidUsd,
          total_difference_usd: totalPaidUsd - totalDutyUsd,
          total_difference_iqd: Math.round((totalPaidUsd - totalDutyUsd) * fxRate),
        },
      });
    }

    // ── GET /stats ───────────────────────────────────────────────────────────
    if (rawPath === "/stats" && method === "GET") {
      const [total, hsUniq, unitUniq, topUnits, topHs] = await Promise.all([
        pool.query("SELECT COUNT(*) as c FROM products"),
        pool.query("SELECT COUNT(DISTINCT hs_code) as c FROM products WHERE hs_code <> ''"),
        pool.query("SELECT COUNT(DISTINCT unit) as c FROM products WHERE unit <> '' AND unit IS NOT NULL"),
        pool.query("SELECT unit, COUNT(*) as c FROM products WHERE unit <> '' AND unit IS NOT NULL GROUP BY unit ORDER BY c DESC LIMIT 15"),
        pool.query("SELECT hs_code, COUNT(*) as c FROM products WHERE hs_code <> '' GROUP BY hs_code ORDER BY c DESC LIMIT 15"),
      ]);
      return jsonCors({
        rows_total: parseInt(total.rows[0].c),
        hs_unique: parseInt(hsUniq.rows[0].c),
        units_unique: parseInt(unitUniq.rows[0].c),
        top_units: topUnits.rows.map((r: any) => ({ unit: r.unit, c: parseInt(r.c) })),
        top_hs: topHs.rows.map((r: any) => ({ hs_code: r.hs_code, c: parseInt(r.c) })),
      });
    }

    // ── Auth: POST /auth/register ────────────────────────────────────────────
    if (rawPath === "/auth/register" && method === "POST") {
      if (!checkLimit("register", ip, 20, 900000)) return errCors("Too many requests", 429);
      const body = await request.json() as any;
      const parsed = authSchema.parse(body);
      const existing = await pool.query("SELECT id FROM users WHERE username=$1", [parsed.username]);
      if (existing.rows.length > 0) return errCors("اسم المستخدم موجود مسبقاً", 409);
      const hashed = await bcrypt.hash(parsed.password, 10);
      const result = await pool.query(
        "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
        [parsed.username, hashed]
      );
      const user = result.rows[0];
      const sessionData = { userId: String(user.id), username: user.username };
      const resp = jsonCors({ id: user.id, username: user.username });
      return withSession(sessionData, resp);
    }

    // ── Auth: POST /auth/login ───────────────────────────────────────────────
    if (rawPath === "/auth/login" && method === "POST") {
      if (!checkLimit("login", ip, 20, 900000)) return errCors("Too many requests", 429);
      const body = await request.json() as any;
      const parsed = authSchema.parse(body);
      const result = await pool.query("SELECT * FROM users WHERE username=$1", [parsed.username]);
      const user = result.rows[0];
      if (!user) return errCors("اسم المستخدم أو كلمة المرور غير صحيحة", 401);
      const valid = await bcrypt.compare(parsed.password, user.password);
      if (!valid) return errCors("اسم المستخدم أو كلمة المرور غير صحيحة", 401);
      const sessionData = { userId: String(user.id), username: user.username };
      const resp = jsonCors({ id: user.id, username: user.username });
      return withSession(sessionData, resp);
    }

    // ── Auth: POST /auth/logout ──────────────────────────────────────────────
    if (rawPath === "/auth/logout" && method === "POST") {
      const headers = new Headers({ "Content-Type": "application/json", ...corsHeaders });
      headers.set("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    // ── Auth: GET /auth/me ───────────────────────────────────────────────────
    if (rawPath === "/auth/me" && method === "GET") {
      if (!session.userId) return errCors("غير مسجل", 401);
      return jsonCors({ id: session.userId, username: session.username });
    }

    // ── POST /manifest/extract ───────────────────────────────────────────────
    if (rawPath === "/manifest/extract" && method === "POST") {
      if (!checkLimit("manifest", session.userId || ip, 10, 60000)) return errCors("Too many requests", 429);
      const formData = await request.formData();
      const file = formData.get("image") as File | null;
      if (!file) return errCors("No image uploaded", 400);
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user", content: [
              { type: "text", text: "Extract ALL data from this Iraqi customs document. Read every row carefully. Return ONLY a JSON object." },
              { type: "image_url", image_url: { url: `data:${file.type};base64,${base64}`, detail: "high" } },
            ],
          },
        ],
        max_tokens: 8192,
      });
      const content = response.choices[0]?.message?.content || "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
      } catch {
        return errCors("Could not parse extracted data", 422);
      }
      return jsonCors(normalizeManifest(parsed));
    }

    // ── POST /manifest/extract-multi ────────────────────────────────────────
    if (rawPath === "/manifest/extract-multi" && method === "POST") {
      if (!checkLimit("manifest", session.userId || ip, 10, 60000)) return errCors("Too many requests", 429);
      const formData = await request.formData();
      const files = formData.getAll("images") as File[];
      if (files.length === 0) return errCors("No images uploaded", 400);
      const imageParts = await Promise.all(files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return { type: "image_url" as const, image_url: { url: `data:${file.type};base64,${base64}`, detail: "high" as const } };
      }));
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "text", text: "Multiple pages of one customs document. Combine ALL items into one JSON object. Return ONLY JSON." },
            ...imageParts,
          ]},
        ],
        max_tokens: 8192,
      });
      const content = response.choices[0]?.message?.content || "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
      } catch {
        return errCors("Could not parse extracted data", 422);
      }
      return jsonCors(normalizeManifest(parsed));
    }

    // ── POST /manifest/auto-calculate ───────────────────────────────────────
    if (rawPath === "/manifest/auto-calculate" && method === "POST") {
      if (!checkLimit("manifest", session.userId || ip, 10, 60000)) return errCors("Too many requests", 429);
      const formData = await request.formData();
      const file = formData.get("image") as File | null;
      if (!file) return errCors("لم يتم رفع صورة", 400);
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "text", text: "Extract all HS codes and quantities from this customs document. Return ONLY JSON." },
            { type: "image_url", image_url: { url: `data:${file.type};base64,${base64}`, detail: "high" } },
          ]},
        ],
        max_tokens: 4096,
      });
      const content = response.choices[0]?.message?.content || "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
      } catch {
        return errCors("لم يتم العثور على بيانات في الصورة", 422);
      }
      const manifest = normalizeManifest(parsed);
      if (!manifest.items || manifest.items.length === 0) {
        return errCors("لم يتم العثور على أكواد HS في الصورة", 422);
      }
      const FX_RATE = manifest.fx_rate || 1320;
      let totalDutyUsd = 0;
      const resultItems: any[] = [];
      for (const item of manifest.items) {
        const rows = await getProductsByHs(pool, item.hs_code, undefined, 1);
        const row = rows[0] || null;
        const dutyRate = row?.duty_rate ?? item.duty_rate ?? 0.30;
        const avgValue = row?.avg_value ?? item.unit_value ?? 0;
        const dutyUsd = item.quantity * avgValue * dutyRate;
        const totalUsd = item.total_value || (item.quantity * avgValue);
        totalDutyUsd += dutyUsd;
        resultItems.push({
          item_number: resultItems.length + 1,
          hs_code: item.hs_code,
          description: row?.description || item.description,
          quantity: item.quantity,
          unit: row?.unit || item.unit || "PCS",
          avg_value: avgValue,
          total_value_usd: totalUsd,
          duty_rate: dutyRate,
          duty_usd: dutyUsd,
          duty_iqd: Math.round(dutyUsd * FX_RATE),
          in_db: !!row,
          is_protected: row?.is_protected ?? false,
        });
      }
      return jsonCors({
        fx_rate: FX_RATE,
        items: resultItems,
        summary: {
          total_items: resultItems.length,
          total_value_usd: resultItems.reduce((s, it) => s + it.total_value_usd, 0),
          total_duty_usd: totalDutyUsd,
          total_duty_iqd: Math.round(totalDutyUsd * FX_RATE),
        },
      });
    }

    // ── POST /manifest/validate-hs ───────────────────────────────────────────
    if (rawPath === "/manifest/validate-hs" && method === "POST") {
      if (!checkLimit("validateHs", ip, 30, 60000)) return errCors("Too many requests", 429);
      const body = await request.json() as any;
      const { hs_codes } = body;
      if (!Array.isArray(hs_codes) || hs_codes.length === 0) return errCors("hs_codes must be a non-empty array", 400);
      if (hs_codes.length > 200) return errCors("hs_codes must not exceed 200 entries", 400);
      const results: Record<string, any> = {};
      const unique = [...new Set(hs_codes.map((c: unknown) => String(c)))];
      for (const code of unique) {
        const hs = code.replace(/[^\d]/g, "").trim();
        if (!hs) { results[String(code)] = { found: false }; continue; }
        const rows = await getProductsByHs(pool, hs, undefined, 1);
        if (rows.length > 0) {
          const r = rows[0];
          results[hs] = { found: true, description: r.description || undefined, unit: r.unit || undefined, min_value: r.min_value ?? undefined, avg_value: r.avg_value ?? undefined, max_value: r.max_value ?? undefined };
        } else {
          results[hs] = { found: false };
        }
      }
      return jsonCors({ results });
    }

    // ── POST /tariff/table ───────────────────────────────────────────────────
    if (rawPath === "/tariff/table" && method === "POST") {
      if (!checkLimit("tariff", ip, 60, 60000)) return errCors("Too many requests", 429);
      const body = await request.json() as any;
      const params = tariffTableSchema.parse(body);
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      if (params.hsSearchTerm) {
        conditions.push(`hs_code LIKE $${paramIdx++}`);
        values.push(params.hsSearchTerm.replace(/[^\d]/g, "") + "%");
      }
      if (params.descriptionSearchTerm) {
        conditions.push(`description ILIKE $${paramIdx++}`);
        values.push("%" + params.descriptionSearchTerm + "%");
      }
      if (params.columnFilters) {
        for (const [colIdx, filterValues] of Object.entries(params.columnFilters)) {
          if (!filterValues || filterValues.length === 0) continue;
          const field = getTariffCol(colIdx);
          if (!field) continue;
          const dbCol = tariffDbCol(field);
          if (field === "dutyRate") {
            const numVals = filterValues.map((v) => {
              const n = parseFloat(v.replace("%", ""));
              return isNaN(n) ? null : n / 100;
            }).filter((v) => v !== null);
            if (numVals.length > 0) {
              const phs = numVals.map(() => `$${paramIdx++}`);
              conditions.push(`${dbCol} IN (${phs.join(",")})`);
              values.push(...numVals);
            }
          } else {
            const phs = filterValues.map(() => `$${paramIdx++}`);
            conditions.push(`COALESCE(CAST(${dbCol} AS TEXT), '') IN (${phs.join(",")})`);
            values.push(...filterValues);
          }
        }
      }

      const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
      const countRes = await pool.query(`SELECT COUNT(*) as total FROM products ${where}`, values);
      const totalFiltered = parseInt(countRes.rows[0].total);
      const totalRes = await pool.query("SELECT COUNT(*) as total FROM products");
      const totalRecords = parseInt(totalRes.rows[0].total);

      let orderClause = "ORDER BY hs_code ASC";
      if (params.sortColumn) {
        const field = getTariffCol(params.sortColumn);
        if (field) {
          orderClause = `ORDER BY ${tariffDbCol(field)} ${params.sortDirection === "desc" ? "DESC" : "ASC"} NULLS LAST`;
        }
      }

      const totalPages = Math.ceil(totalFiltered / params.pageSize);
      const offset = (params.page - 1) * params.pageSize;
      const dataValues = [...values, params.pageSize, offset];
      const dataRes = await pool.query(
        `SELECT hs_code, description, unit, duty_rate, avg_value FROM products ${where} ${orderClause} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        dataValues
      );

      const data = dataRes.rows.map((row: any) => [
        row.hs_code || "",
        row.description || "",
        row.unit || "",
        row.duty_rate != null ? `${(row.duty_rate * 100).toFixed(0)}%` : "",
        row.avg_value != null ? Number(row.avg_value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
      ]);

      return jsonCors({ success: true, data, filteredRecords: totalFiltered, totalRecords, totalPages, page: params.page, pageSize: params.pageSize });
    }

    // ── GET /tariff/column-values/:index ─────────────────────────────────────
    const colValMatch = rawPath.match(/^\/tariff\/column-values\/([^/]+)$/);
    if (colValMatch && method === "GET") {
      const field = getTariffCol(colValMatch[1]);
      if (!field) return errCors("Invalid column index", 400);
      const dbCol = tariffDbCol(field);
      let query: string;
      if (field === "dutyRate") {
        query = `SELECT DISTINCT COALESCE(CAST(ROUND(${dbCol}::numeric * 100) AS TEXT) || '%', '') as val FROM products WHERE ${dbCol} IS NOT NULL ORDER BY val LIMIT 500`;
      } else if (field === "avgValue") {
        query = `SELECT DISTINCT COALESCE(CAST(${dbCol} AS TEXT), '') as val FROM products WHERE ${dbCol} IS NOT NULL ORDER BY val LIMIT 500`;
      } else {
        query = `SELECT DISTINCT COALESCE(${dbCol}, '') as val FROM products ORDER BY val LIMIT 500`;
      }
      const result = await pool.query(query);
      return jsonCors({ values: result.rows.map((r: any) => r.val) });
    }

    return errCors("Not found", 404);

  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: "Validation error", details: e.errors }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    console.error("CF Function error:", e?.message);
    return new Response(JSON.stringify({ error: e?.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } finally {
    await pool.end().catch(() => {});
  }
};
