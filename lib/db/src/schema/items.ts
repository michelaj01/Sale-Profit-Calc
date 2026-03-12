import { pgTable, serial, text, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface RawInputs {
  name: string;
  propertyPrice: string;
  mouPrice: string;
  bankValuation: string;
  showAdvanced: boolean;
  gapPaymentOvr: string | null;
  agencyFeeOvr: string | null;
  dldFeeOvr: string | null;
  trusteeFeeOvr: string | null;
  mortgageRegOvr: string | null;
  bankProcFee: string;
  valuationFee: string;
  nocFee: string;
  serviceFee: string;
  downPaymentPct: string;
  renoItems: Array<{ id: string; label: string; amount: string; note: string }>;
  salePrice: string;
}

export const itemsTable = pgTable("items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  acquisitionCost: numeric("acquisition_cost", { precision: 12, scale: 2 }).notNull(),
  renovationCost: numeric("renovation_cost", { precision: 12, scale: 2 }).default("0").notNull(),
  costItems: jsonb("cost_items").$type<Array<{ label: string; amount: number }>>().default([]),
  salePrice: numeric("sale_price", { precision: 12, scale: 2 }).notNull(),
  rawInputs: jsonb("raw_inputs").$type<RawInputs>().default(null as unknown as RawInputs),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertItemSchema = createInsertSchema(itemsTable).omit({ id: true, createdAt: true });
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof itemsTable.$inferSelect;
