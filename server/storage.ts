import {
  type User, type InsertUser,
  type Checkpoint, type CheckpointFee,
  type Product, type InsertProduct,
  users, checkpoints, checkpointFees, products,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, sql, ilike, count, countDistinct } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getCheckpoints(): Promise<Array<Checkpoint & { fees: CheckpointFee[] }>>;
  getProducts(offset: number, limit: number): Promise<Product[]>;
  searchProducts(query: string, limit?: number): Promise<Product[]>;
  getProductsByHsCode(hsCode: string, unit?: string, limit?: number): Promise<Product[]>;
  getStats(): Promise<{
    rowsTotal: number;
    hsUnique: number;
    unitsUnique: number;
    topUnits: Array<{ unit: string; count: number }>;
    topHs: Array<{ hsCode: string; count: number }>;
  }>;
  seedCheckpoints(): Promise<void>;
  seedProducts(rows: InsertProduct[]): Promise<number>;
  clearProducts(): Promise<void>;
  getProductCount(): Promise<number>;
  checkProductDecisionColumn(): Promise<boolean>;
  updateAllDutyRates(lookupFn: (hsCode: string) => number | null): Promise<number>;
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getCheckpoints(): Promise<Array<Checkpoint & { fees: CheckpointFee[] }>> {
    const allCheckpoints = await db.select().from(checkpoints);
    const allFees = await db.select().from(checkpointFees);
    return allCheckpoints.map((cp) => ({
      ...cp,
      fees: allFees.filter((f) => f.checkpointId === cp.id),
    }));
  }

  async getProducts(offset: number, limit: number): Promise<Product[]> {
    return db
      .select()
      .from(products)
      .orderBy(products.hsCode)
      .offset(offset)
      .limit(limit);
  }

  async searchProducts(query: string, limit = 30): Promise<Product[]> {
    const trimmed = query.trim();
    const hsDigits = trimmed.replace(/[^\d]/g, "");

    if (hsDigits.length >= 4) {
      const rows = await db
        .select()
        .from(products)
        .where(sql`${products.hsCode} LIKE ${hsDigits + "%"}`)
        .orderBy(products.hsCode)
        .limit(limit);
      if (rows.length > 0) return rows;
    }

    return db
      .select()
      .from(products)
      .where(ilike(products.description, `%${trimmed}%`))
      .limit(limit);
  }

  async getProductsByHsCode(hsCode: string, unit?: string, limit = 50): Promise<Product[]> {
    const hs = hsCode.replace(/[^\d]/g, "");
    if (unit) {
      const rows = await db
        .select()
        .from(products)
        .where(sql`${products.hsCode} = ${hs} AND ${products.unit} = ${unit}`)
        .limit(limit);
      if (rows.length > 0) return rows;
    }
    const exactRows = await db
      .select()
      .from(products)
      .where(eq(products.hsCode, hs))
      .limit(limit);
    if (exactRows.length > 0) return exactRows;

    if (hs.length >= 4 && hs.length < 8) {
      return db
        .select()
        .from(products)
        .where(sql`${products.hsCode} LIKE ${hs + '%'}`)
        .limit(limit);
    }
    return [];
  }

  async getStats() {
    const [totalRow] = await db.select({ c: count() }).from(products);
    const [hsRow] = await db
      .select({ c: countDistinct(products.hsCode) })
      .from(products)
      .where(sql`${products.hsCode} <> ''`);
    const [unitRow] = await db
      .select({ c: countDistinct(products.unit) })
      .from(products)
      .where(sql`${products.unit} <> '' AND ${products.unit} IS NOT NULL`);

    const topUnits = await db
      .select({ unit: products.unit, c: count() })
      .from(products)
      .where(sql`${products.unit} <> '' AND ${products.unit} IS NOT NULL`)
      .groupBy(products.unit)
      .orderBy(sql`count(*) DESC`)
      .limit(15);

    const topHs = await db
      .select({ hsCode: products.hsCode, c: count() })
      .from(products)
      .where(sql`${products.hsCode} <> ''`)
      .groupBy(products.hsCode)
      .orderBy(sql`count(*) DESC`)
      .limit(15);

    return {
      rowsTotal: totalRow.c,
      hsUnique: hsRow.c,
      unitsUnique: unitRow.c,
      topUnits: topUnits.map((r) => ({ unit: r.unit || "", count: r.c })),
      topHs: topHs.map((r) => ({ hsCode: r.hsCode, count: r.c })),
    };
  }

  async seedCheckpoints(): Promise<void> {
    await db.delete(checkpointFees);
    await db.delete(checkpoints);

    const data: Record<string, { name: string; fees: Array<{ code: string; label: string; amountIqd: number }> }> = {
      mosul_dam: {
        name: "صيطرة سد الموصل",
        fees: [
          { code: "SONAR", label: "فحص سونار", amountIqd: 25000 },
          { code: "XRAY", label: "فحص أشعة", amountIqd: 50000 },
          { code: "WEIGHING", label: "وزن وعد", amountIqd: 15000 },
          { code: "STAMP", label: "وسم البضاعة", amountIqd: 10000 },
          { code: "PERMIT", label: "رسم تصريح مرور", amountIqd: 20000 },
          { code: "DOCS", label: "رسم مستمسكات", amountIqd: 5000 },
        ],
      },
      darman: {
        name: "صيطرة دارمان",
        fees: [
          { code: "SONAR", label: "فحص سونار", amountIqd: 25000 },
          { code: "XRAY", label: "فحص أشعة", amountIqd: 50000 },
          { code: "WEIGHING", label: "وزن وعد", amountIqd: 15000 },
          { code: "STAMP", label: "وسم البضاعة", amountIqd: 10000 },
          { code: "PERMIT", label: "رسم تصريح مرور", amountIqd: 15000 },
          { code: "DOCS", label: "رسم مستمسكات", amountIqd: 5000 },
        ],
      },
      ibrahim_khalil: {
        name: "منفذ إبراهيم خليل",
        fees: [
          { code: "SONAR", label: "فحص سونار", amountIqd: 30000 },
          { code: "XRAY", label: "فحص أشعة", amountIqd: 55000 },
          { code: "WEIGHING", label: "وزن وعد", amountIqd: 20000 },
          { code: "STAMP", label: "وسم البضاعة", amountIqd: 10000 },
          { code: "PERMIT", label: "رسم تصريح مرور", amountIqd: 25000 },
          { code: "DOCS", label: "رسم مستمسكات", amountIqd: 10000 },
        ],
      },
      duhok: {
        name: "منفذ دهوك",
        fees: [
          { code: "SONAR", label: "رسم سونار", amountIqd: 15000 },
          { code: "XRAY", label: "رسم تفتيش", amountIqd: 25000 },
          { code: "WEIGHING", label: "رسم وزن", amountIqd: 15000 },
          { code: "STAMP", label: "طوابع", amountIqd: 10000 },
          { code: "PERMIT", label: "رسم إجازة", amountIqd: 30000 },
          { code: "DOCS", label: "رسم مستندات", amountIqd: 25000 },
        ],
      },
    };

    for (const [id, cp] of Object.entries(data)) {
      await db.insert(checkpoints).values({ id, name: cp.name });
      for (const fee of cp.fees) {
        await db.insert(checkpointFees).values({
          checkpointId: id,
          code: fee.code,
          label: fee.label,
          amountIqd: fee.amountIqd,
        });
      }
    }
  }

  async seedProducts(rows: InsertProduct[]): Promise<number> {
    if (rows.length === 0) return 0;
    const batchSize = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await db.insert(products).values(batch);
      inserted += batch.length;
    }
    return inserted;
  }

  async clearProducts(): Promise<void> {
    await db.delete(products);
  }

  async getProductCount(): Promise<number> {
    const [row] = await db.select({ c: count() }).from(products);
    return row.c;
  }

  async checkProductDecisionColumn(): Promise<boolean> {
    const [row] = await db.select({ action: products.decisionAction }).from(products).limit(1);
    return row?.action != null;
  }

  async updateAllDutyRates(lookupFn: (hsCode: string) => number | null): Promise<number> {
    let updated = 0;
    const allProducts = await db.select({ id: products.id, hsCode: products.hsCode, dutyRate: products.dutyRate }).from(products);
    for (const p of allProducts) {
      const newRate = lookupFn(p.hsCode);
      if (newRate !== null && newRate !== p.dutyRate) {
        await db.update(products).set({ dutyRate: newRate }).where(eq(products.id, p.id));
        updated++;
      }
    }
    return updated;
  }
}

export const storage = new DatabaseStorage();
