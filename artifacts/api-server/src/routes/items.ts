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
import OpenAI from "openai";

const router: IRouter = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy",
});

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
  const costItems = (row.costItems as Array<{ label: string; amount: number }>) ?? [];
  return {
    id: row.id,
    name: row.name,
    acquisitionCost,
    renovationCost,
    costItems,
    totalCost,
    salePrice,
    profit,
    profitMargin,
    roi,
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
  const { name, acquisitionCost, renovationCost, costItems, salePrice } = parsed.data;
  const [row] = await db
    .insert(itemsTable)
    .values({
      name,
      acquisitionCost: acquisitionCost.toString(),
      renovationCost: (renovationCost ?? 0).toString(),
      costItems: costItems ?? [],
      salePrice: salePrice.toString(),
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
  const { name, acquisitionCost, renovationCost, costItems, salePrice } = parsed.data;
  const [row] = await db
    .update(itemsTable)
    .set({
      name,
      acquisitionCost: acquisitionCost.toString(),
      renovationCost: (renovationCost ?? 0).toString(),
      costItems: costItems ?? [],
      salePrice: salePrice.toString(),
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

router.post("/extract-amount", async (req, res) => {
  const { imageBase64 } = req.body as { imageBase64?: string };
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a financial data extractor. Look at this invoice or quotation image and extract the TOTAL AMOUNT due (the grand total or final amount). 
              
Return ONLY a JSON object in this exact format, nothing else:
{"amount": <number>, "confidence": "<high|medium|low>"}

Rules:
- amount must be a plain number with no currency symbols or commas (e.g. 45000 not AED 45,000)
- If the currency is not AED but you can identify it, still return the number as-is
- confidence should reflect how certain you are about the extracted value
- If no amount can be found, return {"amount": 0, "confidence": "low"}`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      res.status(400).json({ error: "Could not parse amount from image" });
      return;
    }
    const parsed = JSON.parse(jsonMatch[0]) as { amount: number; confidence: string };
    res.json({ amount: parsed.amount ?? 0, confidence: parsed.confidence ?? "low" });
  } catch (err) {
    console.error("extract-amount error:", err);
    res.status(400).json({ error: "Failed to extract amount from image" });
  }
});

export default router;
