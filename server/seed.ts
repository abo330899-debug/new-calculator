import fs from "fs";
import path from "path";
import { storage } from "./storage";
import type { InsertProduct } from "@shared/schema";
import { log } from "./index";

function normHs(v: any): string {
  return String(v || "").replace(/[^\d]/g, "").trim();
}

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(/,/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

let tariffData: { hs_rates: Record<string, number>; chapter_defaults: Record<string, number> } | null = null;

function loadTariff(): typeof tariffData {
  if (tariffData) return tariffData;
  const tariffPath = path.resolve("attached_assets/tariff_law22_2010.json");
  if (fs.existsSync(tariffPath)) {
    tariffData = JSON.parse(fs.readFileSync(tariffPath, "utf-8"));
  } else {
    tariffData = { hs_rates: {}, chapter_defaults: {} };
  }
  return tariffData;
}

function lookupDutyRate(hsCode: string): number | null {
  const t = loadTariff();
  if (!t) return null;
  const hs = hsCode.replace(/[^\d]/g, "");
  if (t.hs_rates[hs] !== undefined) return t.hs_rates[hs] / 100;
  if (hs.length >= 6 && t.hs_rates[hs.slice(0, 6)] !== undefined) return t.hs_rates[hs.slice(0, 6)] / 100;
  const ch = hs.slice(0, 2);
  if (t.chapter_defaults[ch] !== undefined) return t.chapter_defaults[ch] / 100;
  return 0.20;
}

function loadReferenceProducts(): InsertProduct[] {
  const refPath = path.resolve("attached_assets/ALL_PRODUCTS_WITH_DECISION_CLEAN.json");
  if (!fs.existsSync(refPath)) {
    log("Reference products file not found!", "seed");
    return [];
  }

  const raw = fs.readFileSync(refPath, "utf-8");
  const parsed = JSON.parse(raw);
  const rows: InsertProduct[] = [];

  if (!Array.isArray(parsed)) return rows;

  for (const item of parsed) {
    const hs = normHs(item.IDE_HSC_NB1);
    if (!hs) continue;

    const mn = toNum(item.GDS_MIN);
    const mx = toNum(item.GDS_MAX);
    let av = toNum(item.GDS_YER);
    if ((av === null || av === 0) && mn !== null && mx !== null) av = (mn + mx) / 2.0;

    const desc = String(item.product || "").trim();
    if (mn === null && mx === null && av === null && !desc) continue;

    const isProtected = item.protection === true;
    const protLevel = String(item.protection_level || "").trim() || null;
    const protPct = toNum(item.protection_percentage);

    const decision = item.decision || {};
    const decAction = String(decision.action || "").trim() || null;
    const decRisk = String(decision.risk || "").trim() || null;
    const decReason = String(decision.reason || "").trim() || null;

    rows.push({
      hsCode: hs,
      cstCode: null,
      description: desc,
      unit: null,
      isProtected,
      protectionLevel: protLevel,
      protectionPercentage: protPct,
      decisionAction: decAction,
      decisionRisk: decRisk,
      decisionReason: decReason,
      minValue: mn,
      avgValue: av,
      maxValue: mx,
      dutyRate: lookupDutyRate(hs),
      currency: "USD",
      sourcePage: null,
      rawJson: JSON.stringify(item),
    });
  }

  return rows;
}

export async function runSeed(): Promise<void> {
  log("Seeding checkpoints...", "seed");
  await storage.seedCheckpoints();

  const refProducts = loadReferenceProducts();
  if (refProducts.length === 0) {
    log("No reference products found, skipping.", "seed");
    return;
  }

  const currentCount = await storage.getProductCount();

  const sampleHasDecision = await storage.checkProductDecisionColumn();
  if (currentCount === refProducts.length && sampleHasDecision) {
    log(`Database already has ${currentCount} products (matches reference file), skipping re-seed.`, "seed");
    return;
  }

  log(`Clearing old products (${currentCount}) and loading ${refProducts.length} from reference file...`, "seed");
  await storage.clearProducts();

  log(`Inserting ${refProducts.length} reference products...`, "seed");
  const inserted = await storage.seedProducts(refProducts);
  log(`Seeded ${inserted} products successfully.`, "seed");
}
