import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { itemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateItemBody,
  UpdateItemBody,
  UpdateItemParams,
  DeleteItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function computeMetrics(acquisitionCost: number, renovationCost: number, salePrice: number) {
  const totalCost = acquisitionCost + renovationCost;
  const profit = salePrice - totalCost;
  const profitMargin = salePrice !== 0 ? (profit / salePrice) * 100 : 0;
  const roi = totalCost !== 0 ? (profit / totalCost) * 100 : 0;
  return { totalCost, profit, profitMargin, roi };
}

function mapItem(row: typeof itemsTable.$inferSelect) {
  const acquisitionCost = parseFloat(row.acquisitionCost as string);
  const renovationCost = parseFloat(row.renovationCost as string) || 0;
  const salePrice = parseFloat(row.salePrice as string);
  const { totalCost, profit, profitMargin, roi } = computeMetrics(acquisitionCost, renovationCost, salePrice);
  return {
    id: row.id,
    name: row.name,
    acquisitionCost,
    renovationCost,
    totalCost,
    salePrice,
    profit,
    profitMargin,
    roi,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/items", async (_req, res) => {
  const rows = await db.select().from(itemsTable).orderBy(itemsTable.createdAt);
  res.json(rows.map(mapItem));
});

router.post("/items", async (req, res) => {
  const parsed = CreateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, acquisitionCost, renovationCost, salePrice, notes } = parsed.data;
  const [row] = await db
    .insert(itemsTable)
    .values({
      name,
      acquisitionCost: acquisitionCost.toString(),
      renovationCost: (renovationCost ?? 0).toString(),
      salePrice: salePrice.toString(),
      notes: notes ?? null,
    })
    .returning();
  res.status(201).json(mapItem(row));
});

router.put("/items/:id", async (req, res) => {
  const params = UpdateItemParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, acquisitionCost, renovationCost, salePrice, notes } = parsed.data;
  const [row] = await db
    .update(itemsTable)
    .set({
      name,
      acquisitionCost: acquisitionCost.toString(),
      renovationCost: (renovationCost ?? 0).toString(),
      salePrice: salePrice.toString(),
      notes: notes ?? null,
    })
    .where(eq(itemsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json(mapItem(row));
});

router.delete("/items/:id", async (req, res) => {
  const params = DeleteItemParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .delete(itemsTable)
    .where(eq(itemsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
