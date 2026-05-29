import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, pool } from "./storage";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import { openai } from "./replit_integrations/image/client";
import tesseract from "node-tesseract-ocr";
import os from "os";
import path from "path";
import fs from "fs";

function makeRateLimiter(
  windowMs: number,
  maxRequests: number,
  keyFn?: (req: Request) => string,
) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const key = keyFn ? keyFn(req) : (req.ip ?? "unknown");
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > maxRequests) {
      res.status(429).json({ error: "Too many requests, please try again later" });
      return;
    }
    next();
  };
}

const calculateLimiter = makeRateLimiter(60_000, 30);
const tariffTableLimiter = makeRateLimiter(60_000, 60);
const validateHsLimiter = makeRateLimiter(60_000, 30);
const manifestExtractLimiter = makeRateLimiter(60_000, 10, (req: Request) => {
  const userId = req.session?.userId ?? req.ip ?? "unknown";
  return String(userId);
});

const authRegisterLimiter = makeRateLimiter(15 * 60_000, 20);
const authLoginLimiter = makeRateLimiter(15 * 60_000, 20, (req: Request) => {
  const username =
    typeof req.body?.username === "string"
      ? req.body.username.toLowerCase().trim()
      : "";
  const ip = req.ip ?? "unknown";
  return username ? `${username}:${ip}` : ip;
});

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

function normHs(v: string): string {
  return (v || "").replace(/[^\d]/g, "").trim();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/checkpoints", async (_req, res) => {
    try {
      const cps = await storage.getCheckpoints();
      const out = cps.map((cp) => ({
        id: cp.id,
        name: cp.name,
        fees: cp.fees.map((f) => ({
          code: f.code,
          label: f.label,
          amount_iqd: f.amountIqd,
        })),
      }));
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/products", async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
      const offset = (page - 1) * limit;
      const rows = await storage.getProducts(offset, limit);
      const totalCount = await storage.getProductCount();
      const totalPages = Math.ceil(totalCount / limit);
      res.json({
        products: rows.map((r) => ({
          id: r.id,
          hs_code: r.hsCode,
          cst_code: r.cstCode,
          description: r.description,
          unit: r.unit,
          weight: r.weight,
          unit_price: r.unitPrice,
          is_protected: r.isProtected,
          protection_level: r.protectionLevel,
          protection_percentage: r.protectionPercentage,
          decision_action: r.decisionAction,
          decision_risk: r.decisionRisk,
          decision_reason: r.decisionReason,
          min_value: r.minValue,
          avg_value: r.avgValue,
          max_value: r.maxValue,
          duty_rate: r.dutyRate,
          currency: r.currency,
        })),
        page,
        total_pages: totalPages,
        total_count: totalCount,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/search", async (req, res) => {
    try {
      const q = (req.query.q as string || "").trim();
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 30, 1), 100);
      if (q.length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters" });
      }
      const rows = await storage.searchProducts(q, limit);
      const out = rows.map((r) => ({
        id: r.id,
        hs_code: r.hsCode,
        cst_code: r.cstCode,
        description: r.description,
        unit: r.unit,
        weight: r.weight,
        unit_price: r.unitPrice,
        is_protected: r.isProtected,
        protection_level: r.protectionLevel,
        protection_percentage: r.protectionPercentage,
        decision_action: r.decisionAction,
        decision_risk: r.decisionRisk,
        decision_reason: r.decisionReason,
        min_value: r.minValue,
        avg_value: r.avgValue,
        max_value: r.maxValue,
        duty_rate: r.dutyRate,
        currency: r.currency,
      }));
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/hs/:hs_code", async (req, res) => {
    try {
      const hsCode = normHs(req.params.hs_code);
      if (!hsCode) {
        return res.status(400).json({ error: "Invalid HS code" });
      }
      const unit = req.query.unit as string | undefined;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
      const rows = await storage.getProductsByHsCode(hsCode, unit, limit);
      const out = rows.map((r) => ({
        id: r.id,
        hs_code: r.hsCode,
        cst_code: r.cstCode,
        description: r.description,
        unit: r.unit,
        weight: r.weight,
        unit_price: r.unitPrice,
        is_protected: r.isProtected,
        protection_level: r.protectionLevel,
        protection_percentage: r.protectionPercentage,
        decision_action: r.decisionAction,
        decision_risk: r.decisionRisk,
        decision_reason: r.decisionReason,
        min_value: r.minValue,
        avg_value: r.avgValue,
        max_value: r.maxValue,
        duty_rate: r.dutyRate,
        currency: r.currency,
      }));
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/calculate", calculateLimiter, async (req, res) => {
    try {
      const parsed = calcRequestSchema.parse(req.body);
      const fxRate = parsed.fx_rate;

      const itemsOut: any[] = [];
      let totalDutyUsd = 0;
      let totalPaidUsd = 0;

      for (const it of parsed.items) {
        const hs = normHs(it.hs_code);
        const rows = await storage.getProductsByHsCode(hs, it.unit || undefined, 1);
        const row = rows[0] || null;
        const desc = row?.description || "";
        const unit = row?.unit || it.unit || "";

        const dutyUsd = it.quantity * it.avg_value * it.duty_rate;
        const paidUsd = it.paid_duty || 0;
        const diffUsd = paidUsd - dutyUsd;
        const diffIqd = Math.round(diffUsd * fxRate);

        totalDutyUsd += dutyUsd;
        totalPaidUsd += paidUsd;

        itemsOut.push({
          hs_code: hs,
          description: desc,
          quantity: it.quantity,
          unit,
          avg_value: it.avg_value,
          duty_rate: it.duty_rate,
          goods_category: it.goods_category,
          duty_usd: dutyUsd,
          paid_duty_usd: paidUsd,
          difference_usd: diffUsd,
          difference_iqd: diffIqd,
        });
      }

      const totalDiffUsd = totalPaidUsd - totalDutyUsd;

      res.json({
        fx_rate: fxRate,
        items: itemsOut,
        summary: {
          total_duty_usd: totalDutyUsd,
          total_paid_usd: totalPaidUsd,
          total_difference_usd: totalDiffUsd,
          total_difference_iqd: Math.round(totalDiffUsd * fxRate),
        },
      });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: e.errors });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json({
        rows_total: stats.rowsTotal,
        hs_unique: stats.hsUnique,
        units_unique: stats.unitsUnique,
        top_units: stats.topUnits.map((u) => ({ unit: u.unit, c: u.count })),
        top_hs: stats.topHs.map((h) => ({ hs_code: h.hsCode, c: h.count })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const authSchema = z.object({
    username: z.string().min(2),
    password: z.string().min(8),
  });

  app.post("/api/auth/register", authRegisterLimiter, async (req, res) => {
    try {
      const parsed = authSchema.parse(req.body);
      const existing = await storage.getUserByUsername(parsed.username);
      if (existing) {
        return res.status(409).json({ error: "اسم المستخدم موجود مسبقاً" });
      }
      const hashed = await bcrypt.hash(parsed.password, 10);
      const user = await storage.createUser({ username: parsed.username, password: hashed });
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });
      req.session.userId = user.id;
      req.session.username = user.username;
      res.json({ id: user.id, username: user.username });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبة" });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", authLoginLimiter, async (req, res) => {
    try {
      const parsed = authSchema.parse(req.body);
      const user = await storage.getUserByUsername(parsed.username);
      if (!user) {
        return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }
      const valid = await bcrypt.compare(parsed.password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });
      req.session.userId = user.id;
      req.session.username = user.username;
      res.json({ id: user.id, username: user.username });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبة" });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "فشل تسجيل الخروج" });
      }
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session.userId) {
      res.json({ id: req.session.userId, username: req.session.username });
    } else {
      res.status(401).json({ error: "غير مسجل" });
    }
  });

  const goodsCategories = [
    "food_basic", "food_processed", "medical", "agriculture", "education",
    "solar", "raw_materials", "computers", "industrial", "construction",
    "electrical", "vehicles", "electronics", "smartphones", "clothing",
    "household", "consumer", "luxury_goods", "jewelry", "machinery",
    "cleaning", "tobacco", "alcohol"
  ];

  const systemPrompt = `You are a senior Iraqi customs document analyst (محلل وثائق كمركية عراقي) with deep expertise in reading and extracting data from all types of Iraqi customs and trade documents. You have extensive knowledge of:

## Document Types You May Encounter
- بيان الإدخال / التصريحة الكمركية (Customs Entry Declaration / Import Manifest)
- فاتورة تجارية (Commercial Invoice)
- أمر تسليم (Delivery Order)
- إجازة استيراد (Import License)
- شهادة المنشأ (Certificate of Origin)
- بيان كمركي موحد (Unified Customs Declaration)

## Iraqi Customs Document Structure
Iraqi customs declarations typically contain the following sections. Look for these Arabic labels carefully:

### Header Section (أعلى المستند)
- رقم البيان / رقم التصريحة (Declaration Number) - usually a numeric ID at the top
- تاريخ البيان (Declaration Date) - date in DD/MM/YYYY or YYYY/MM/DD format
- اسم المنفذ / المنفذ الكمركي / كود المنفذ / دائرة الكمارك (Customs Checkpoint/Border Crossing)
- اسم المستورد / صاحب البضاعة / المخلص الكمركي (Importer Name)
- بلد المنشأ / بلد التصدير (Country of Origin/Export)
- نوع العملة / العملة (Currency Type - USD, EUR, GBP, TRY, CNY, AED, etc.)
- سعر الصرف (Exchange Rate to IQD)
- عدد الطرود / عدد القطع (Number of Packages/Pieces)
- طريقة النقل (Transport Method): بري (Land), بحري (Sea), جوي (Air)
- رقم الحاوية / رقم الشاحنة (Container/Truck Number)

### Items Table (جدول البضائع)
The main table contains line items. Each row typically has these columns:
- ت / التسلسل / رقم (Sequence/Item Number)
- رمز HS / الرمز المنسق / التعرفة (HS Code / Harmonized System Code)
- وصف البضاعة / اسم المادة (Goods Description)
- الكمية / العدد (Quantity)
- الوحدة (Unit - KG, PCS, MT, LTR, SET, etc.)
- سعر الوحدة / قيمة الوحدة (Unit Price/Value)
- القيمة الكلية / المجموع / التعمئة / م. الكمية (Total Value)
- نسبة الرسم / نسبة التعرفة / % (Duty Rate Percentage)
- مبلغ الرسم / الرسم (Duty Amount)
- بلد المنشأ (Country of Origin per item, if specified per line)

### Summary/Totals Section (قسم المجاميع - usually at bottom)
- مجموع القيمة / إجمالي القيمة (Total Value)
- مجموع الرسوم / إجمالي الرسم الكمركي (Total Customs Duty)
- ضريبة المبيعات (Sales Tax)
- الرسم البلدي (Municipal Tax)
- الأمانة الضريبية (Tax Deposit)
- المجموع الكلي / الإجمالي (Grand Total Payable)
- المبلغ المدفوع (Amount Paid)

## CRITICAL Reading Instructions

1. **Read EVERY row in the items table.** Do NOT skip any line. Even if rows look similar, each one must be extracted separately. Count the rows carefully.

2. **Number Format Handling:** Iraqi documents may use Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) alongside or instead of Latin numerals (0123456789). Convert all Arabic-Indic numerals to their Latin equivalents:
   ٠=0, ١=1, ٢=2, ٣=3, ٤=4, ٥=5, ٦=6, ٧=7, ٨=8, ٩=9

3. **Handwritten vs Printed Text:** Some fields may be handwritten (especially quantities, values, stamps, signatures). Read handwritten numbers and text carefully. If a handwritten value conflicts with a printed value, prefer the handwritten value as it is usually the correction.

4. **HS Code Format:** Iraqi HS codes are typically 8-10 digits long (e.g., 84713000, 8471300000). Sometimes they appear with dots (8471.30.00) or spaces. Extract the full code without separators. If a shorter code is shown (4 or 6 digits), still extract it as-is.

5. **Duty Rate:** Look for percentage columns (% or نسبة). Convert percentages to decimals: 5% → 0.05, 15% → 0.15, 30% → 0.30. If the rate is shown as a whole number in a percentage column, divide by 100.

6. **Summary Totals:** Always check the bottom of the document for summary/total rows. These contain the aggregate duty, taxes, and total payable amounts.

7. **Goods Category Classification:** For each item, based on its Arabic description, classify it into ONE of these categories: ${goodsCategories.join(", ")}. Use your best judgment:
   - Food items (rice, sugar, flour, oil, tea) → food_basic
   - Processed food (canned goods, snacks, beverages) → food_processed
   - Medicine, medical devices → medical
   - Seeds, fertilizer, livestock → agriculture
   - Books, stationery, school supplies → education
   - Solar panels, batteries → solar
   - Raw metals, chemicals, plastics → raw_materials
   - Computers, laptops, printers → computers
   - Factory equipment, tools → industrial
   - Cement, steel, building materials → construction
   - Wiring, switches, electrical components → electrical
   - Cars, trucks, spare parts → vehicles
   - TVs, radios, audio equipment → electronics
   - Mobile phones, tablets → smartphones
   - Textiles, garments, shoes → clothing
   - Furniture, kitchenware → household
   - General consumer goods → consumer
   - Perfumes, cosmetics, watches → luxury_goods
   - Gold, silver, precious stones → jewelry
   - Heavy machinery, generators → machinery
   - Detergents, soaps → cleaning
   - Cigarettes, tobacco products → tobacco
   - Alcoholic beverages → alcohol

## Required JSON Output Format

Return ONLY a valid JSON object (no markdown, no code fences, no explanation) with this exact structure:

{
  "declaration_number": "string or empty string if not found",
  "declaration_date": "string in YYYY-MM-DD format or empty string",
  "checkpoint": "string - customs checkpoint name in Arabic",
  "importer_name": "string or empty string",
  "origin_country": "string - country name or empty string",
  "currency": "string - ISO currency code like USD, EUR, TRY, etc.",
  "fx_rate": 0,
  "total_packages": 0,
  "transport_method": "string - بري or بحري or جوي or empty string",
  "container_number": "string or empty string",
  "duty_paid_usd": 0,
  "tax_paid_usd": 0,
  "total_value_usd": 0,
  "items": [
    {
      "item_number": 1,
      "hs_code": "string",
      "description": "string in Arabic",
      "quantity": 0,
      "unit": "string",
      "unit_value": 0,
      "total_value": 0,
      "duty_rate": 0.0,
      "duty_amount": 0,
      "origin": "string - country of origin for this item or empty string",
      "goods_category": "string - one of the allowed categories"
    }
  ]
}

## Example of a Good Extraction

Given a typical Iraqi customs declaration, a correct extraction would look like:
{
  "declaration_number": "2024/15234",
  "declaration_date": "2024-11-15",
  "checkpoint": "منفذ إبراهيم الخليل",
  "importer_name": "شركة النور للتجارة العامة",
  "origin_country": "تركيا",
  "currency": "USD",
  "fx_rate": 1320,
  "total_packages": 450,
  "transport_method": "بري",
  "container_number": "MSKU7234567",
  "duty_paid_usd": 3500,
  "tax_paid_usd": 1200,
  "total_value_usd": 45000,
  "items": [
    {
      "item_number": 1,
      "hs_code": "84713000",
      "description": "حاسبات محمولة ماركة لينوفو",
      "quantity": 200,
      "unit": "PCS",
      "unit_value": 150,
      "total_value": 30000,
      "duty_rate": 0.05,
      "duty_amount": 1500,
      "origin": "الصين",
      "goods_category": "computers"
    },
    {
      "item_number": 2,
      "hs_code": "85171200",
      "description": "هواتف نقالة سامسونج",
      "quantity": 500,
      "unit": "PCS",
      "unit_value": 30,
      "total_value": 15000,
      "duty_rate": 0.05,
      "duty_amount": 750,
      "origin": "كوريا الجنوبية",
      "goods_category": "smartphones"
    }
  ]
}

If a field is not visible or unclear, use reasonable defaults (empty string for text, 0 for numbers). Extract ALL items/lines visible in the document - do not skip any row.`;

  function normalizeManifestResponse(parsed: any) {
    let items: any[] = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed.items && Array.isArray(parsed.items)) {
      items = parsed.items;
    } else {
      items = [parsed];
    }

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
      goods_category: goodsCategories.includes(String(item.goods_category || ""))
        ? String(item.goods_category)
        : "consumer",
    }));

    const checkpointName = String(parsed.checkpoint || "").trim();
    const declarationNumber = String(parsed.declaration_number || "").trim();
    const declarationDate = String(parsed.declaration_date || "").trim();
    const importerName = String(parsed.importer_name || "").trim();
    const originCountry = String(parsed.origin_country || "").trim();
    const currency = String(parsed.currency || "USD").trim().toUpperCase();
    const fxRate = Number(parsed.fx_rate) || 0;
    const totalPackages = Number(parsed.total_packages) || 0;
    const transportMethod = String(parsed.transport_method || "").trim();
    const containerNumber = String(parsed.container_number || "").trim();
    const dutyPaidUsd = Number(parsed.duty_paid_usd) || 0;
    const taxPaidUsd = Number(parsed.tax_paid_usd) || 0;
    const totalValueUsd = Number(parsed.total_value_usd) || 0;
    const totalPaidUsd = dutyPaidUsd + taxPaidUsd;

    return {
      declaration_number: declarationNumber,
      declaration_date: declarationDate,
      checkpoint: checkpointName,
      importer_name: importerName,
      origin_country: originCountry,
      currency: currency,
      fx_rate: fxRate,
      total_packages: totalPackages,
      transport_method: transportMethod,
      container_number: containerNumber,
      paid_amount_usd: totalPaidUsd,
      duty_paid_usd: dutyPaidUsd,
      tax_paid_usd: taxPaidUsd,
      total_value_usd: totalValueUsd,
      items: normalized,
    };
  }

  function parseManifestContent(content: string) {
    const cleaned = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    return JSON.parse(cleaned);
  }

  app.post("/api/manifest/extract-multi", manifestExtractLimiter, upload.array("images", 5), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No images uploaded" });
      }

      const imageContentParts = files.map((file) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
          detail: "high" as const,
        },
      }));

      const response = await openai.chat.completions.create({
        model: "gpt-5.4",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "This customs document has multiple pages. Extract ALL data from ALL pages as a single unified document. Read every page and combine all items into one items array. Return ONLY a JSON object.",
              },
              ...imageContentParts,
            ],
          },
        ],
        max_completion_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content || "{}";

      let parsed: any = {};
      try {
        parsed = parseManifestContent(content);
      } catch {
        return res
          .status(422)
          .json({ error: "Could not parse extracted data", raw: content });
      }

      res.json(normalizeManifestResponse(parsed));
    } catch (e: any) {
      console.error("Multi-image manifest extraction error:", e?.status, e?.message, e?.error);
      const msg = e?.message || e?.error?.message || "Failed to extract manifest data";
      res
        .status(500)
        .json({ error: msg });
    }
  });

  app.post("/api/manifest/extract", manifestExtractLimiter, upload.single("image"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      const base64 = file.buffer.toString("base64");
      const mimeType = file.mimetype;

      const response = await openai.chat.completions.create({
        model: "gpt-5.4",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract ALL data from this Iraqi customs document image. Read every single row in the items table carefully. Convert any Arabic-Indic numerals to Latin. Return ONLY a JSON object matching the specified schema.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_completion_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content || "{}";

      let parsed: any = {};
      try {
        parsed = parseManifestContent(content);
      } catch {
        return res
          .status(422)
          .json({ error: "Could not parse extracted data", raw: content });
      }

      res.json(normalizeManifestResponse(parsed));
    } catch (e: any) {
      console.error("Manifest extraction error:", e?.status, e?.message, e?.error);
      const msg = e?.message || e?.error?.message || "Failed to extract manifest data";
      res
        .status(500)
        .json({ error: msg });
    }
  });

  // Full auto: OCR → DB lookup → calculate duties — single button, zero input
  app.post("/api/manifest/auto-calculate", manifestExtractLimiter, upload.single("image"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "لم يتم رفع صورة" });

      const FX_RATE = 1320; // IQD per USD default

      // ── 1. OCR ──────────────────────────────────────────────────────────
      const tmpFile = path.join(os.tmpdir(), `autocalc-${Date.now()}.${file.mimetype.split("/")[1] || "png"}`);
      fs.writeFileSync(tmpFile, file.buffer);
      let ocrText = "";
      try {
        ocrText = await tesseract.recognize(tmpFile, { lang: "ara+eng", oem: 1, psm: 6 });
      } catch {
        // tesseract not available — continue with empty text, OpenAI will handle visually
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
      }

      // Normalise Arabic-Indic digits
      const normalize = (s: string) =>
        s.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
      const text = normalize(ocrText);

      // ── 2. Extract HS codes ──────────────────────────────────────────────
      const hsPattern = /\b(\d{8})\b/g;
      const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

      const seen = new Set<string>();
      const rawItems: { hs_code: string; quantity: number; unit_value: number; total_value: number; description: string }[] = [];

      for (let i = 0; i < lines.length; i++) {
        const matches = [...lines[i].matchAll(hsPattern)];
        for (const m of matches) {
          const hs = m[1];
          if (seen.has(hs)) continue;
          seen.add(hs);

          const ctx = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join(" ");
          const nums = [...ctx.matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)]
            .map((n) => parseFloat(n[1].replace(",", "")))
            .filter((n) => !isNaN(n) && n !== parseFloat(hs) && n > 0 && n < 1_000_000)
            .sort((a, b) => a - b);

          const arabicDesc = lines[i]
            .replace(new RegExp(hs, "g"), "")
            .replace(/\b\d+(?:[.,]\d+)?\b/g, "")
            .replace(/[A-Za-z]{1,5}/g, "")
            .replace(/\s+/g, " ").trim();

          rawItems.push({
            hs_code: hs,
            quantity: nums[0] || 1,
            unit_value: nums.length > 1 ? nums[Math.floor(nums.length / 2)] : nums[0] || 0,
            total_value: nums[nums.length - 1] || 0,
            description: arabicDesc || `صنف`,
          });
        }
      }

      if (rawItems.length === 0) {
        return res.status(422).json({ error: "لم يتم العثور على أكواد HS في الصورة. تأكد أن الصورة واضحة." });
      }

      // ── 3. DB lookup + calculate ─────────────────────────────────────────
      let totalDutyUsd = 0;
      const resultItems: any[] = [];

      for (const item of rawItems) {
        const hs = normHs(item.hs_code);
        const rows = await storage.getProductsByHsCode(hs, undefined, 1);
        const row = rows[0] || null;

        const dutyRate = row?.dutyRate ?? 0.30; // default 30% if unknown
        const avgValue = row?.avgValue ?? item.unit_value ?? 0;
        const description = row?.description || item.description;
        const unit = row?.unit || "PCS";

        const dutyUsd = item.quantity * avgValue * dutyRate;
        const totalUsd = item.total_value || (item.quantity * avgValue);
        totalDutyUsd += dutyUsd;

        resultItems.push({
          item_number: resultItems.length + 1,
          hs_code: hs,
          description,
          quantity: item.quantity,
          unit,
          avg_value: avgValue,
          total_value_usd: totalUsd,
          duty_rate: dutyRate,
          duty_usd: dutyUsd,
          duty_iqd: Math.round(dutyUsd * FX_RATE),
          in_db: !!row,
          is_protected: row?.isProtected ?? false,
        });
      }

      const totalValueUsd = resultItems.reduce((s, it) => s + it.total_value_usd, 0);
      const totalDutyIqd = Math.round(totalDutyUsd * FX_RATE);

      res.json({
        fx_rate: FX_RATE,
        items: resultItems,
        summary: {
          total_items: resultItems.length,
          total_value_usd: totalValueUsd,
          total_duty_usd: totalDutyUsd,
          total_duty_iqd: totalDutyIqd,
        },
      });
    } catch (e: any) {
      console.error("Auto-calculate error:", e?.message);
      res.status(500).json({ error: e?.message || "فشل في الحساب التلقائي" });
    }
  });

  // OCR-based extraction (no AI)
  app.post("/api/manifest/extract-ocr", manifestExtractLimiter, upload.single("image"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No image uploaded" });

      // Write buffer to temp file
      const tmpFile = path.join(os.tmpdir(), `manifest-ocr-${Date.now()}.${file.mimetype.split("/")[1] || "png"}`);
      fs.writeFileSync(tmpFile, file.buffer);

      let ocrText = "";
      try {
        ocrText = await tesseract.recognize(tmpFile, {
          lang: "ara+eng",
          oem: 1,
          psm: 6,
        });
      } catch {
        // tesseract not available — OpenAI will process the image visually
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
      }

      // Convert Arabic-Indic digits to Latin
      const normalizeDigits = (s: string) =>
        s.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

      const text = normalizeDigits(ocrText);
      const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);

      // Extract HS codes (8-digit sequences)
      const hsPattern = /\b(\d{8})\b/g;

      // Try to extract declaration header fields
      const declarationNumberMatch = text.match(/(?:بيان|رقم)[^\d]*(\d{4,}\/\d+|\d{6,})/i);
      const dateMatch = text.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/);
      const checkpointMatch = text.match(/(?:منفذ|صيطرة)\s+[\u0600-\u06FF\s]{2,30}/);
      const importerMatch = text.match(/(?:المستورد|شركة|مؤسسة)[^\n]{0,50}/);
      const currencyMatch = text.match(/\b(USD|EUR|IQD|TRY|CNY|AED)\b/i);
      const fxMatch = text.match(/(?:سعر\s*الصرف|صرف)[^\d]*(\d{3,5})/i);

      // Parse items: find lines containing HS codes
      const items: any[] = [];
      let itemNumber = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hsMatches = [...line.matchAll(hsPattern)];
        if (hsMatches.length === 0) continue;

        for (const hsMatch of hsMatches) {
          const hsCode = hsMatch[1];
          itemNumber++;

          // Get numbers from this line and nearby lines
          const contextLines = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join(" ");
          const numbers = [...contextLines.matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)]
            .map((m) => parseFloat(m[1].replace(",", "")))
            .filter((n) => !isNaN(n) && n !== parseFloat(hsCode));

          // Arabic text in line (excluding numbers and HS code)
          const arabicText = line.replace(new RegExp(hsCode, "g"), "")
            .replace(/\b\d+(?:[.,]\d+)?\b/g, "")
            .replace(/[A-Za-z]{1,4}/g, "")
            .replace(/\s+/g, " ")
            .trim();

          // Heuristic: quantity is smaller number, total_value is larger
          const sortedNums = numbers.filter((n) => n > 0 && n < 1_000_000).sort((a, b) => a - b);
          const quantity = sortedNums[0] || 1;
          const totalValue = sortedNums[sortedNums.length - 1] || 0;
          const unitValue = quantity > 1 && totalValue > 0 ? totalValue / quantity : totalValue;

          // Duty rate: look for percentage
          const pctMatch = contextLines.match(/(\d+(?:\.\d+)?)\s*%/);
          const dutyRate = pctMatch ? parseFloat(pctMatch[1]) / 100 : 0;

          items.push({
            item_number: itemNumber,
            hs_code: hsCode,
            description: arabicText || `صنف ${itemNumber}`,
            quantity,
            unit: "PCS",
            unit_value: unitValue,
            total_value: totalValue,
            duty_rate: dutyRate,
            duty_amount: dutyRate > 0 ? totalValue * dutyRate : 0,
            origin: "",
            goods_category: "consumer",
          });
        }
      }

      if (items.length === 0) {
        return res.status(422).json({
          error: "لم يتم العثور على أكواد HS في الصورة. تأكد أن الصورة واضحة وتحتوي على بيانات المنفست.",
          ocr_text: ocrText.slice(0, 500),
        });
      }

      const result = normalizeManifestResponse({
        declaration_number: declarationNumberMatch?.[1] || "",
        declaration_date: dateMatch?.[1] || "",
        checkpoint: checkpointMatch?.[0]?.trim() || "",
        importer_name: importerMatch?.[0]?.trim() || "",
        origin_country: "",
        currency: currencyMatch?.[1]?.toUpperCase() || "USD",
        fx_rate: fxMatch ? parseFloat(fxMatch[1]) : 0,
        total_packages: 0,
        transport_method: "",
        container_number: "",
        duty_paid_usd: 0,
        tax_paid_usd: 0,
        total_value_usd: items.reduce((s, it) => s + (it.total_value || 0), 0),
        items,
      });

      res.json(result);
    } catch (e: any) {
      console.error("OCR extraction error:", e?.message);
      res.status(500).json({ error: e?.message || "فشل في قراءة الصورة بـ OCR" });
    }
  });

  app.post("/api/manifest/validate-hs", validateHsLimiter, async (req, res) => {
    try {
      const { hs_codes } = req.body;
      if (!Array.isArray(hs_codes) || hs_codes.length === 0) {
        return res.status(400).json({ error: "hs_codes must be a non-empty array of strings" });
      }
      if (hs_codes.length > 200) {
        return res.status(400).json({ error: "hs_codes must not exceed 200 entries" });
      }

      const results: Record<string, { found: boolean; description?: string; unit?: string; min_value?: number; avg_value?: number; max_value?: number }> = {};

      const uniqueCodes = [...new Set(hs_codes.map((c: unknown) => String(c)))];

      for (const code of uniqueCodes) {
        const hs = normHs(String(code));
        if (!hs) {
          results[String(code)] = { found: false };
          continue;
        }
        const rows = await storage.getProductsByHsCode(hs, undefined, 1);
        if (rows.length > 0) {
          const row = rows[0];
          results[hs] = {
            found: true,
            description: row.description || undefined,
            unit: row.unit || undefined,
            min_value: row.minValue ?? undefined,
            avg_value: row.avgValue ?? undefined,
            max_value: row.maxValue ?? undefined,
          };
        } else {
          results[hs] = { found: false };
        }
      }

      res.json({ results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const tariffTableSchema = z.object({
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(250).default(10),
    hsSearchTerm: z.string().max(20).optional().default(""),
    descriptionSearchTerm: z.string().max(200).optional().default(""),
    sortColumn: z.string().nullable().optional().default(null),
    sortDirection: z.enum(["asc", "desc"]).optional().default("asc"),
    columnFilters: z.record(z.string(), z.array(z.string().max(200)).max(200)).optional().default({}),
  }).refine(
    (v) => Object.keys(v.columnFilters ?? {}).length <= 10,
    { message: "Too many column filters", path: ["columnFilters"] }
  );

  const TARIFF_COLUMNS = ["hsCode", "description", "unit", "dutyRate", "avgValue"] as const;
  type TariffCol = typeof TARIFF_COLUMNS[number];

  function getTariffColumnField(col: string): TariffCol | null {
    const idx = parseInt(col);
    if (!isNaN(idx) && idx >= 0 && idx < TARIFF_COLUMNS.length) return TARIFF_COLUMNS[idx];
    if (TARIFF_COLUMNS.includes(col as TariffCol)) return col as TariffCol;
    return null;
  }

  app.post("/api/tariff/table", tariffTableLimiter, async (req, res) => {
    try {
      const params = tariffTableSchema.parse(req.body);
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      if (params.hsSearchTerm) {
        conditions.push(`hs_code LIKE $${paramIdx}`);
        values.push(params.hsSearchTerm.replace(/[^\d]/g, "") + "%");
        paramIdx++;
      }

      if (params.descriptionSearchTerm) {
        conditions.push(`description ILIKE $${paramIdx}`);
        values.push("%" + params.descriptionSearchTerm + "%");
        paramIdx++;
      }

      if (params.columnFilters) {
        for (const [colIdx, filterValues] of Object.entries(params.columnFilters)) {
          if (!filterValues || filterValues.length === 0) continue;
          const field = getTariffColumnField(colIdx);
          if (!field) continue;
          const dbCol = field === "hsCode" ? "hs_code" : field === "dutyRate" ? "duty_rate" : field === "avgValue" ? "avg_value" : field;

          if (field === "dutyRate") {
            const numericVals = filterValues.map(v => {
              const n = parseFloat(v.replace("%", ""));
              return isNaN(n) ? null : n / 100;
            }).filter(v => v !== null);
            if (numericVals.length > 0) {
              const placeholders = numericVals.map(() => `$${paramIdx++}`);
              conditions.push(`${dbCol} IN (${placeholders.join(",")})`);
              values.push(...numericVals);
            }
          } else {
            const placeholders = filterValues.map(() => `$${paramIdx++}`);
            conditions.push(`COALESCE(CAST(${dbCol} AS TEXT), '') IN (${placeholders.join(",")})`);
            values.push(...filterValues);
          }
        }
      }

      const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

      const countQuery = `SELECT COUNT(*) as total FROM products ${whereClause}`;
      const countResult = await pool.query(countQuery, values);
      const totalFiltered = parseInt(countResult.rows[0].total);

      const totalCountResult = await pool.query("SELECT COUNT(*) as total FROM products");
      const totalRecords = parseInt(totalCountResult.rows[0].total);

      let orderClause = "ORDER BY hs_code ASC";
      if (params.sortColumn !== null && params.sortColumn !== undefined) {
        const field = getTariffColumnField(params.sortColumn);
        if (field) {
          const dbCol = field === "hsCode" ? "hs_code" : field === "dutyRate" ? "duty_rate" : field === "avgValue" ? "avg_value" : field;
          orderClause = `ORDER BY ${dbCol} ${params.sortDirection === "desc" ? "DESC" : "ASC"} NULLS LAST`;
        }
      }

      const totalPages = Math.ceil(totalFiltered / params.pageSize);
      const offset = (params.page - 1) * params.pageSize;

      const dataQuery = `SELECT hs_code, description, unit, duty_rate, avg_value FROM products ${whereClause} ${orderClause} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      values.push(params.pageSize, offset);

      const dataResult = await pool.query(dataQuery, values);

      const data = dataResult.rows.map((row: any) => [
        row.hs_code || "",
        row.description || "",
        row.unit || "",
        row.duty_rate != null ? `${(row.duty_rate * 100).toFixed(0)}%` : "",
        row.avg_value != null ? Number(row.avg_value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
      ]);

      res.json({
        success: true,
        data,
        filteredRecords: totalFiltered,
        totalRecords,
        totalPages,
        page: params.page,
        pageSize: params.pageSize,
      });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: "Invalid request", details: e.errors });
      }
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get("/api/tariff/column-values/:columnIndex", async (_req, res) => {
    try {
      const colIdx = _req.params.columnIndex;
      const field = getTariffColumnField(colIdx);
      if (!field) {
        return res.status(400).json({ error: "Invalid column index" });
      }
      const dbCol = field === "hsCode" ? "hs_code" : field === "dutyRate" ? "duty_rate" : field === "avgValue" ? "avg_value" : field;

      let query: string;
      if (field === "dutyRate") {
        query = `SELECT DISTINCT COALESCE(CAST(ROUND(${dbCol}::numeric * 100) AS TEXT) || '%', '') as val FROM products WHERE ${dbCol} IS NOT NULL ORDER BY val LIMIT 500`;
      } else if (field === "avgValue") {
        query = `SELECT DISTINCT COALESCE(CAST(${dbCol} AS TEXT), '') as val FROM products WHERE ${dbCol} IS NOT NULL ORDER BY val LIMIT 500`;
      } else {
        query = `SELECT DISTINCT COALESCE(${dbCol}, '') as val FROM products ORDER BY val LIMIT 500`;
      }

      const result = await pool.query(query);
      res.json({ values: result.rows.map((r: any) => r.val) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
