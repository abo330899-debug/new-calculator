import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, real, integer, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const checkpoints = pgTable("checkpoints", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const insertCheckpointSchema = createInsertSchema(checkpoints);
export type InsertCheckpoint = z.infer<typeof insertCheckpointSchema>;
export type Checkpoint = typeof checkpoints.$inferSelect;

export const checkpointFees = pgTable("checkpoint_fees", {
  id: serial("id").primaryKey(),
  checkpointId: text("checkpoint_id").notNull(),
  code: text("code").notNull(),
  label: text("label"),
  amountIqd: real("amount_iqd").notNull().default(0),
});

export const insertCheckpointFeeSchema = createInsertSchema(checkpointFees).omit({ id: true });
export type InsertCheckpointFee = z.infer<typeof insertCheckpointFeeSchema>;
export type CheckpointFee = typeof checkpointFees.$inferSelect;

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  hsCode: text("hs_code").notNull(),
  cstCode: text("cst_code"),
  description: text("description"),
  unit: text("unit"),
  weight: real("weight"),
  unitPrice: real("unit_price"),
  isProtected: boolean("is_protected").default(false),
  protectionLevel: text("protection_level"),
  protectionPercentage: real("protection_percentage"),
  decisionAction: text("decision_action"),
  decisionRisk: text("decision_risk"),
  decisionReason: text("decision_reason"),
  minValue: real("min_value"),
  avgValue: real("avg_value"),
  maxValue: real("max_value"),
  dutyRate: real("duty_rate"),
  currency: text("currency").default("IQD"),
  sourcePage: integer("source_page"),
  rawJson: text("raw_json"),
}, (table) => [
  index("idx_products_hs").on(table.hsCode),
  index("idx_products_desc").on(table.description),
]);

export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
