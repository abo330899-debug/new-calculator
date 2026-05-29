import { Pool } from "pg";
import bcrypt from "bcryptjs";
import OpenAI from "openai";
import { z } from "zod";

interface Env {
  DATABASE_URL: string;
  SESSION_SECRET: string;
  OPENAI_API_KEY: string;
}

// ── Singleton DB pool (persists across requests in same isolate) ──────────────
let _pool: Pool | null = null;

function getPool(env: Env): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return _pool;
}

// ── Auth helpers (Web Crypto — native in CF Workers) ─────────────────────────
const enc = new TextEncoder();

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function makeSessionToken(payload: object, secret: string): Promise<string> {
  const data = btoa(JSON.stringify(payload));
  const sig = await hmacSign(data, secret);
  return `${data}.${sig}`;
}

async function parseSessionToken(token: string, secret: string): Promise<any | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 0) return null;
    const data = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = await hmacSign(data, secret);
    if (expected !== sig) return null;
    return JSON.parse(atob(data));
  } catch { return null; }
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return part.slice(eq + 1).trim();
  }
  return null;
}

// ── Response helpers ──────────────────────────────────────────────────────────
function jsonRes(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

// ── DB row mapper ─────────────────────────────────────────────────────────────
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

async function searchProducts(pool: Pool, query: string, limit = 30) {
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

async function getProductsByHs(pool: Pool, hs: string, unit?: string, limit = 50) {
  const clean = hs.replace(/[^\d]/g, "");
  if (unit) {
    const r = await pool.query(
      "SELECT * FROM products WHERE hs_code=$1 AND unit=$2 LIMIT $3", [clean, unit, limit]
    );
    if (r.rows.length > 0) return r.rows;
  }
  const exact = await pool.query("SELECT * FROM products WHERE hs_code=$1 LIMIT $2", [clean, limit]);
  if (exact.rows.length > 0) return exact.rows;
  if (clean.length >= 4 && clean.length < 8) {
    const like = await pool.query(
      "SELECT * FROM products WHERE hs_code LIKE $1 LIMIT $2", [clean + "%", limit]
    );
    return like.rows;
  }
  return [];
}

// ── Manifest helpers ──────────────────────────────────────────────────────────
const GOODS_CATS = [
  "food_basic","food_processed","medical","agriculture","education",
  "solar","raw_materials","computers","industrial","construction",
  "electrical","vehicles","electronics","smartphones","clothing",
  "household","consumer","luxury_goods","jewelry","machinery",
  "cleaning","tobacco","alcohol",
];

const SYSTEM_PROMPT = `You are a senior Iraqi customs document analyst. Extract ALL data from the customs document image.

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "declaration_number": "string or empty",
  "declaration_date": "YYYY-MM-DD or empty",
  "checkpoint": "Arabic checkpoint name or empty",
  "importer_name": "string or empty",
  "origin_country": "country or empty",
  "currency": "USD/EUR/TRY/etc",
  "fx_rate": 0,
  "total_packages": 0,
  "transport_method": "بري or بحري or جوي or empty",
  "container_number": "string or empty",
  "duty_paid_usd": 0,
  "tax_paid_usd": 0,
  "total_value_usd": 0,
  "items": [{
    "item_number": 1,
    "hs_code": "string",
    "description": "Arabic",
    "quantity": 0,
    "unit": "string",
    "unit_value": 0,
    "total_value": 0,
    "duty_rate": 0.05,
    "duty_amount": 0,
    "origin": "country or empty",
    "goods_category": "consumer"
  }]
}

Rules:
- Read EVERY row — do NOT skip any line
- Convert Arabic-Indic digits ٠١٢٣٤٥٦٧٨٩ to 0123456789
- Duty rates as decimals: 5%→0.05, 30%→0.30
- goods_category must be one of: ${GOODS_CATS.join(", ")}`;

function normalizeManifest(parsed: any) {
  const items: any[] = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : [parsed]);
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
    goods_category: GOODS_CATS.includes(String(item.goods_category || ""))
      ? String(item.goods_category) : "consumer",
  }));
  const dutyPaid = Number(parsed?.duty_paid_usd) || 0;
  const taxPaid = Number(parsed?.tax_paid_usd) || 0;
  return {
    declaration_number: String(parsed?.declaration_number || "").trim(),
    declaration_date: String(parsed?.declaration_date || "").trim(),
    checkpoint: String(parsed?.checkpoint || "").trim(),
    importer_name: String(parsed?.importer_name || "").trim(),
    origin_country: String(parsed?.origin_country || "").trim(),
    currency: String(parsed?.currency || "USD").trim().toUpperCase(),
    fx_rate: Number(parsed?.fx_rate) || 0,
    total_packages: Number(parsed?.total_packages) || 0,
    transport_method: String(parsed?.transport_method || "").trim(),
    container_number: String(parsed?.container_number || "").trim(),
    paid_amount_usd: dutyPaid + taxPaid,
    duty_paid_usd: dutyPaid,
    tax_paid_usd: taxPaid,
    total_value_usd: Number(parsed?.total_value_usd) || 0,
    items: normalized,
  };
}

function parseManifestJson(raw: string) {
  return JSON.parse(raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
}

// ── Rate limiter (in-memory per isolate) ──────────────────────────────────────
const _limits = new Map<string, Map<string, { n: number; reset: number }>>();

function rateOk(limiter: string, key: string, max: number, ms: number): boolean {
  if (!_limits.has(limiter)) _limits.set(limiter, new Map());
  const m = _limits.get(limiter)!;
  const now = Date.now();
  let e = m.get(key);
  if (!e || now >= e.reset) { e = { n: 0, reset: now + ms }; m.set(key, e); }
  e.n++;
  return e.n <= max;
}

// ── Zod schemas ───────────────────────────────────────────────────────────────
const calcItemSchema = z.object({
  hs_code: z.string(),
  quantity: z.number().positive(),
  unit: z.string().optional().nullable(),
  avg_value: z.number().min(0),
  duty_rate: z.number().min(0),
  goods_category: z.string().optional().default("consumer"),
  paid_duty: z.number().min(0).default(0),
});
const calcSchema = z.object({
  fx_rate: z.number().positive().default(1320),
  items: z.array(calcItemSchema).min(1).max(100),
});
const authSchema = z.object({ username: z.string().min(2), password: z.string().min(8) });
const tariffTableSchema = z.object({
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(250).default(10),
  hsSearchTerm: z.string().max(20).optional().default(""),
  descriptionSearchTerm: z.string().max(200).optional().default(""),
  sortColumn: z.string().nullable().optional().default(null),
  sortDirection: z.enum(["asc", "desc"]).optional().default("asc"),
  columnFilters: z.record(z.string(), z.array(z.string().max(200)).max(200)).optional().default({}),
});

const TARIFF_COLS = ["hsCode","description","unit","dutyRate","avgValue"] as const;
type TC = typeof TARIFF_COLS[number];
function tariffField(col: string): TC | null {
  const idx = parseInt(col);
  if (!isNaN(idx) && idx >= 0 && idx < TARIFF_COLS.length) return TARIFF_COLS[idx];
  if ((TARIFF_COLS as readonly string[]).includes(col)) return col as TC;
  return null;
}
function tariffDbCol(f: TC): string {
  return f === "hsCode" ? "hs_code" : f === "dutyRate" ? "duty_rate" : f === "avgValue" ? "avg_value" : f;
}

// ── Main Cloudflare Pages Function ────────────────────────────────────────────
export const onRequest = async (context: any): Promise<Response> => {
  const { request, env } = context as { request: Request; env: Env };
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const rawPath = url.pathname.replace(/^\/api/, "") || "/";
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  const corsH: Record<string, string> = {
    "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });

  // Parse session cookie
  const sessionCookie = getCookie(request, "session");
  let session: { userId?: string; username?: string } = {};
  if (sessionCookie && env.SESSION_SECRET) {
    session = (await parseSessionToken(sessionCookie, env.SESSION_SECRET)) ?? {};
  }

  const ok = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...corsH },
    });

  const fail = (msg: string, status = 500) => ok({ error: msg }, status);

  async function okWithSession(data: unknown, sessionData: object) {
    const token = await makeSessionToken(sessionData, env.SESSION_SECRET || "fallback-secret");
    const cookieStr = `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieStr,
        ...corsH,
      },
    });
  }

  const pool = getPool(env);

  try {

    // ── GET /health ────────────────────────────────────────────────────────
    if (rawPath === "/health" && method === "GET")
      return ok({ ok: true, timestamp: new Date().toISOString() });

    // ── GET /checkpoints ──────────────────────────────────────────────────
    if (rawPath === "/checkpoints" && method === "GET") {
      const [cps, fees] = await Promise.all([
        pool.query("SELECT * FROM checkpoints ORDER BY id"),
        pool.query("SELECT * FROM checkpoint_fees"),
      ]);
      return ok(cps.rows.map((cp: any) => ({
        id: cp.id,
        name: cp.name,
        fees: fees.rows
          .filter((f: any) => f.checkpoint_id === cp.id)
          .map((f: any) => ({ code: f.code, label: f.label, amount_iqd: f.amount_iqd })),
      })));
    }

    // ── GET /products ──────────────────────────────────────────────────────
    if (rawPath === "/products" && method === "GET") {
      const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
      const lim = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50"), 1), 200);
      const [rows, cnt] = await Promise.all([
        pool.query("SELECT * FROM products ORDER BY hs_code LIMIT $1 OFFSET $2", [lim, (page-1)*lim]),
        pool.query("SELECT COUNT(*) as c FROM products"),
      ]);
      const totalCount = parseInt(cnt.rows[0].c);
      return ok({ products: rows.rows.map(mapProduct), page, total_pages: Math.ceil(totalCount/lim), total_count: totalCount });
    }

    // ── GET /search ────────────────────────────────────────────────────────
    if (rawPath === "/search" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      const lim = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30"), 1), 100);
      if (q.length < 2) return fail("Query must be at least 2 characters", 400);
      const rows = await searchProducts(pool, q, lim);
      return ok(rows.map(mapProduct));
    }

    // ── GET /hs/:code ──────────────────────────────────────────────────────
    const hsMatch = rawPath.match(/^\/hs\/([^/]+)$/);
    if (hsMatch && method === "GET") {
      const hs = hsMatch[1].replace(/[^\d]/g, "");
      if (!hs) return fail("Invalid HS code", 400);
      const unit = url.searchParams.get("unit") || undefined;
      const lim = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50"), 1), 200);
      const rows = await getProductsByHs(pool, hs, unit, lim);
      return ok(rows.map(mapProduct));
    }

    // ── POST /calculate ────────────────────────────────────────────────────
    if (rawPath === "/calculate" && method === "POST") {
      if (!rateOk("calc", ip, 30, 60000)) return fail("Too many requests", 429);
      const body = await request.json() as any;
      const parsed = calcSchema.parse(body);
      const fxRate = parsed.fx_rate;
      let totalDutyUsd = 0, totalPaidUsd = 0;
      const itemsOut: any[] = [];
      for (const it of parsed.items) {
        const hs = it.hs_code.replace(/[^\d]/g, "");
        const rows = await getProductsByHs(pool, hs, it.unit || undefined, 1);
        const row = rows[0] || null;
        const dutyUsd = it.quantity * it.avg_value * it.duty_rate;
        const paidUsd = it.paid_duty || 0;
        totalDutyUsd += dutyUsd;
        totalPaidUsd += paidUsd;
        itemsOut.push({
          hs_code: hs, description: row?.description || "", quantity: it.quantity,
          unit: row?.unit || it.unit || "", avg_value: it.avg_value, duty_rate: it.duty_rate,
          goods_category: it.goods_category, duty_usd: dutyUsd, paid_duty_usd: paidUsd,
          difference_usd: paidUsd - dutyUsd, difference_iqd: Math.round((paidUsd - dutyUsd) * fxRate),
        });
      }
      return ok({ fx_rate: fxRate, items: itemsOut, summary: {
        total_duty_usd: totalDutyUsd, total_paid_usd: totalPaidUsd,
        total_difference_usd: totalPaidUsd - totalDutyUsd,
        total_difference_iqd: Math.round((totalPaidUsd - totalDutyUsd) * fxRate),
      }});
    }

    // ── GET /stats ─────────────────────────────────────────────────────────
    if (rawPath === "/stats" && method === "GET") {
      const [t, hs, u, tu, th] = await Promise.all([
        pool.query("SELECT COUNT(*) as c FROM products"),
        pool.query("SELECT COUNT(DISTINCT hs_code) as c FROM products WHERE hs_code <> ''"),
        pool.query("SELECT COUNT(DISTINCT unit) as c FROM products WHERE unit <> '' AND unit IS NOT NULL"),
        pool.query("SELECT unit, COUNT(*) as c FROM products WHERE unit <> '' AND unit IS NOT NULL GROUP BY unit ORDER BY c DESC LIMIT 15"),
        pool.query("SELECT hs_code, COUNT(*) as c FROM products WHERE hs_code <> '' GROUP BY hs_code ORDER BY c DESC LIMIT 15"),
      ]);
      return ok({
        rows_total: parseInt(t.rows[0].c), hs_unique: parseInt(hs.rows[0].c), units_unique: parseInt(u.rows[0].c),
        top_units: tu.rows.map((r: any) => ({ unit: r.unit, c: parseInt(r.c) })),
        top_hs: th.rows.map((r: any) => ({ hs_code: r.hs_code, c: parseInt(r.c) })),
      });
    }

    // ── POST /auth/register ────────────────────────────────────────────────
    if (rawPath === "/auth/register" && method === "POST") {
      if (!rateOk("register", ip, 20, 900000)) return fail("Too many requests", 429);
      const body = await request.json() as any;
      const parsed = authSchema.parse(body);
      const existing = await pool.query("SELECT id FROM users WHERE username=$1", [parsed.username]);
      if (existing.rows.length > 0) return fail("اسم المستخدم موجود مسبقاً", 409);
      // cost 6 for edge CPU limits
      const hashed = await bcrypt.hash(parsed.password, 6);
      const result = await pool.query(
        "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
        [parsed.username, hashed]
      );
      const user = result.rows[0];
      return okWithSession({ id: user.id, username: user.username },
        { userId: String(user.id), username: user.username });
    }

    // ── POST /auth/login ───────────────────────────────────────────────────
    if (rawPath === "/auth/login" && method === "POST") {
      if (!rateOk("login", ip, 20, 900000)) return fail("Too many requests", 429);
      const body = await request.json() as any;
      const parsed = authSchema.parse(body);
      const result = await pool.query("SELECT * FROM users WHERE username=$1", [parsed.username]);
      const user = result.rows[0];
      if (!user) return fail("اسم المستخدم أو كلمة المرور غير صحيحة", 401);
      const valid = await bcrypt.compare(parsed.password, user.password);
      if (!valid) return fail("اسم المستخدم أو كلمة المرور غير صحيحة", 401);
      return okWithSession({ id: user.id, username: user.username },
        { userId: String(user.id), username: user.username });
    }

    // ── POST /auth/logout ──────────────────────────────────────────────────
    if (rawPath === "/auth/logout" && method === "POST") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
          ...corsH,
        },
      });
    }

    // ── GET /auth/me ───────────────────────────────────────────────────────
    if (rawPath === "/auth/me" && method === "GET") {
      if (!session.userId) return fail("غير مسجل", 401);
      return ok({ id: session.userId, username: session.username });
    }

    // ── POST /manifest/extract ─────────────────────────────────────────────
    if (rawPath === "/manifest/extract" && method === "POST") {
      if (!rateOk("manifest", session.userId || ip, 10, 60000)) return fail("Too many requests", 429);
      if (!env.OPENAI_API_KEY) return fail("OpenAI API key not configured", 503);
      const fd = await request.formData();
      const file = fd.get("image") as File | null;
      if (!file) return fail("No image uploaded", 400);
      if (file.size > 10 * 1024 * 1024) return fail("File too large (max 10MB)", 400);
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const resp = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "text", text: "Extract ALL data from this Iraqi customs document. Return ONLY JSON." },
            { type: "image_url", image_url: { url: `data:${file.type};base64,${b64}`, detail: "high" } },
          ]},
        ],
        max_tokens: 8192,
      });
      const content = resp.choices[0]?.message?.content || "{}";
      try { return ok(normalizeManifest(parseManifestJson(content))); }
      catch { return fail("Could not parse extracted data", 422); }
    }

    // ── POST /manifest/extract-multi ──────────────────────────────────────
    if (rawPath === "/manifest/extract-multi" && method === "POST") {
      if (!rateOk("manifest", session.userId || ip, 10, 60000)) return fail("Too many requests", 429);
      if (!env.OPENAI_API_KEY) return fail("OpenAI API key not configured", 503);
      const fd = await request.formData();
      const files = fd.getAll("images") as File[];
      if (files.length === 0) return fail("No images uploaded", 400);
      const imageParts = await Promise.all(files.slice(0, 5).map(async (f) => {
        const buf = await f.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        return { type: "image_url" as const, image_url: { url: `data:${f.type};base64,${b64}`, detail: "high" as const } };
      }));
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const resp = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "text", text: "Multiple pages of one customs document. Combine ALL items into ONE JSON object." },
            ...imageParts,
          ]},
        ],
        max_tokens: 8192,
      });
      const content = resp.choices[0]?.message?.content || "{}";
      try { return ok(normalizeManifest(parseManifestJson(content))); }
      catch { return fail("Could not parse extracted data", 422); }
    }

    // ── POST /manifest/auto-calculate ─────────────────────────────────────
    if (rawPath === "/manifest/auto-calculate" && method === "POST") {
      if (!rateOk("manifest", session.userId || ip, 10, 60000)) return fail("Too many requests", 429);
      if (!env.OPENAI_API_KEY) return fail("OpenAI API key not configured", 503);
      const fd = await request.formData();
      const file = fd.get("image") as File | null;
      if (!file) return fail("لم يتم رفع صورة", 400);
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const resp = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "text", text: "Extract all HS codes and items from this customs document. Return ONLY JSON." },
            { type: "image_url", image_url: { url: `data:${file.type};base64,${b64}`, detail: "high" } },
          ]},
        ],
        max_tokens: 4096,
      });
      const content = resp.choices[0]?.message?.content || "{}";
      let manifest: ReturnType<typeof normalizeManifest>;
      try { manifest = normalizeManifest(parseManifestJson(content)); }
      catch { return fail("لم يتم العثور على بيانات في الصورة", 422); }
      if (!manifest.items?.length) return fail("لم يتم العثور على أكواد HS في الصورة", 422);
      const FX = manifest.fx_rate || 1320;
      let totalDuty = 0;
      const resultItems: any[] = [];
      for (const item of manifest.items) {
        const rows = await getProductsByHs(pool, item.hs_code, undefined, 1);
        const row = rows[0] || null;
        const dr = row?.duty_rate ?? item.duty_rate ?? 0.30;
        const av = row?.avg_value ?? item.unit_value ?? 0;
        const du = item.quantity * av * dr;
        const tv = item.total_value || (item.quantity * av);
        totalDuty += du;
        resultItems.push({
          item_number: resultItems.length + 1, hs_code: item.hs_code,
          description: row?.description || item.description, quantity: item.quantity,
          unit: row?.unit || item.unit || "PCS", avg_value: av, total_value_usd: tv,
          duty_rate: dr, duty_usd: du, duty_iqd: Math.round(du * FX),
          in_db: !!row, is_protected: row?.is_protected ?? false,
        });
      }
      return ok({ fx_rate: FX, items: resultItems, summary: {
        total_items: resultItems.length,
        total_value_usd: resultItems.reduce((s, it) => s + it.total_value_usd, 0),
        total_duty_usd: totalDuty, total_duty_iqd: Math.round(totalDuty * FX),
      }});
    }

    // ── POST /manifest/validate-hs ─────────────────────────────────────────
    if (rawPath === "/manifest/validate-hs" && method === "POST") {
      if (!rateOk("validateHs", ip, 30, 60000)) return fail("Too many requests", 429);
      const body = await request.json() as any;
      const { hs_codes } = body;
      if (!Array.isArray(hs_codes) || hs_codes.length === 0) return fail("hs_codes must be a non-empty array", 400);
      if (hs_codes.length > 200) return fail("hs_codes must not exceed 200 entries", 400);
      const results: Record<string, any> = {};
      for (const code of [...new Set(hs_codes.map((c: any) => String(c)))]) {
        const hs = String(code).replace(/[^\d]/g, "");
        if (!hs) { results[code] = { found: false }; continue; }
        const rows = await getProductsByHs(pool, hs, undefined, 1);
        if (rows.length > 0) {
          const r = rows[0];
          results[hs] = { found: true, description: r.description, unit: r.unit, min_value: r.min_value, avg_value: r.avg_value, max_value: r.max_value };
        } else {
          results[hs] = { found: false };
        }
      }
      return ok({ results });
    }

    // ── POST /tariff/table ─────────────────────────────────────────────────
    if (rawPath === "/tariff/table" && method === "POST") {
      if (!rateOk("tariff", ip, 60, 60000)) return fail("Too many requests", 429);
      const body = await request.json() as any;
      const p = tariffTableSchema.parse(body);
      const conds: string[] = [];
      const vals: any[] = [];
      let pi = 1;
      if (p.hsSearchTerm) { conds.push(`hs_code LIKE $${pi++}`); vals.push(p.hsSearchTerm.replace(/[^\d]/g, "") + "%"); }
      if (p.descriptionSearchTerm) { conds.push(`description ILIKE $${pi++}`); vals.push("%" + p.descriptionSearchTerm + "%"); }
      if (p.columnFilters) {
        for (const [colIdx, fVals] of Object.entries(p.columnFilters)) {
          if (!fVals?.length) continue;
          const field = tariffField(colIdx);
          if (!field) continue;
          const dc = tariffDbCol(field);
          if (field === "dutyRate") {
            const nv = fVals.map((v) => { const n = parseFloat(v.replace("%","")); return isNaN(n) ? null : n/100; }).filter(Boolean);
            if (nv.length) { conds.push(`${dc} IN (${nv.map(()=>`$${pi++}`).join(",")})`); vals.push(...nv); }
          } else {
            conds.push(`COALESCE(CAST(${dc} AS TEXT), '') IN (${fVals.map(()=>`$${pi++}`).join(",")})`);
            vals.push(...fVals);
          }
        }
      }
      const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
      let order = "ORDER BY hs_code ASC";
      if (p.sortColumn) { const f = tariffField(p.sortColumn); if (f) order = `ORDER BY ${tariffDbCol(f)} ${p.sortDirection==="desc"?"DESC":"ASC"} NULLS LAST`; }
      const [cntFilt, cntAll] = await Promise.all([
        pool.query(`SELECT COUNT(*) as total FROM products ${where}`, vals),
        pool.query("SELECT COUNT(*) as total FROM products"),
      ]);
      const totalFiltered = parseInt(cntFilt.rows[0].total);
      const totalRecords = parseInt(cntAll.rows[0].total);
      const totalPages = Math.ceil(totalFiltered / p.pageSize);
      const offset = (p.page - 1) * p.pageSize;
      const data = await pool.query(
        `SELECT hs_code, description, unit, duty_rate, avg_value FROM products ${where} ${order} LIMIT $${pi} OFFSET $${pi+1}`,
        [...vals, p.pageSize, offset]
      );
      return ok({ success: true, page: p.page, pageSize: p.pageSize, totalRecords, filteredRecords: totalFiltered, totalPages,
        data: data.rows.map((r: any) => [
          r.hs_code || "", r.description || "", r.unit || "",
          r.duty_rate != null ? `${(r.duty_rate*100).toFixed(0)}%` : "",
          r.avg_value != null ? Number(r.avg_value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
        ]),
      });
    }

    // ── GET /tariff/column-values/:idx ─────────────────────────────────────
    const colMatch = rawPath.match(/^\/tariff\/column-values\/([^/]+)$/);
    if (colMatch && method === "GET") {
      const field = tariffField(colMatch[1]);
      if (!field) return fail("Invalid column index", 400);
      const dc = tariffDbCol(field);
      let q: string;
      if (field === "dutyRate")
        q = `SELECT DISTINCT COALESCE(CAST(ROUND(${dc}::numeric * 100) AS TEXT) || '%', '') as val FROM products WHERE ${dc} IS NOT NULL ORDER BY val LIMIT 500`;
      else if (field === "avgValue")
        q = `SELECT DISTINCT COALESCE(CAST(${dc} AS TEXT), '') as val FROM products WHERE ${dc} IS NOT NULL ORDER BY val LIMIT 500`;
      else
        q = `SELECT DISTINCT COALESCE(${dc}, '') as val FROM products ORDER BY val LIMIT 500`;
      const r = await pool.query(q);
      return ok({ values: r.rows.map((row: any) => row.val) });
    }

    // ── OCR fallback (no tesseract in edge — return empty) ─────────────────
    if (rawPath === "/manifest/extract-ocr" && method === "POST") {
      return fail("OCR غير متاح في هذا البيئة. استخدم قراءة AI بدلاً منه.", 501);
    }

    return fail("Not found", 404);

  } catch (e: any) {
    if (e instanceof z.ZodError)
      return new Response(JSON.stringify({ error: "Validation error", details: e.errors }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsH },
      });
    console.error("[CF Function]", e?.message);
    return new Response(JSON.stringify({ error: e?.message || "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsH },
    });
  }
};
