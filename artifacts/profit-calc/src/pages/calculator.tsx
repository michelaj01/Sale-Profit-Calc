import { useState, useRef, useCallback } from "react";
import { useCreateItem } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function fmt(val: number) {
  return val.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currency(val: number, showSign = false) {
  const sign = showSign && val > 0 ? "+" : showSign && val < 0 ? "−" : "";
  return `${sign}AED ${fmt(Math.abs(val))}`;
}

const TIERS = [
  { label: "Breakeven", profit: 0, color: "text-muted-foreground", bg: "bg-muted/60", desc: "Zero profit" },
  { label: "Conservative", profit: 300_000, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40", desc: "+AED 300K profit" },
  { label: "Moderate", profit: 500_000, color: "text-primary", bg: "bg-green-50 dark:bg-green-950/40", desc: "+AED 500K profit" },
  { label: "Ambitious", profit: 800_000, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", desc: "+AED 800K profit" },
];

interface CostItem {
  id: string;
  label: string;
  amount: string;
  scanning: boolean;
  fixed?: boolean;
}

function newCostItem(): CostItem {
  return { id: crypto.randomUUID(), label: "", amount: "", scanning: false };
}

const ACQUISITION_ITEMS: Omit<CostItem, "scanning">[] = [
  { id: "property-price", label: "Property Price", amount: "", fixed: true },
  { id: "agency-fee", label: "Agency Fee", amount: "", fixed: true },
  { id: "dld-fee", label: "DLD Fee", amount: "", fixed: true },
  { id: "mortgage-reg-fee", label: "Mortgage Reg.", amount: "", fixed: true },
];

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ScanButton({ scanning, onClick }: { scanning: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={scanning}
      className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border border-input bg-background text-muted-foreground active:bg-muted transition disabled:opacity-50"
      title="Scan invoice"
    >
      {scanning ? (
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  );
}

export default function Calculator() {
  const [name, setName] = useState("");
  const [acqItems, setAcqItems] = useState<CostItem[]>(
    ACQUISITION_ITEMS.map(i => ({ ...i, scanning: false }))
  );
  const [renoItems, setRenoItems] = useState<CostItem[]>([newCostItem()]);
  const [salePrice, setSalePrice] = useState("");
  const { toast } = useToast();
  const createItem = useCreateItem();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const acqTotal = acqItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const renoTotal = renoItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalCost = acqTotal + renoTotal;
  const sale = parseFloat(salePrice) || 0;
  const profit = sale - totalCost;
  const profitPct = totalCost !== 0 ? (profit / totalCost) * 100 : 0;
  const margin = sale !== 0 ? (profit / sale) * 100 : 0;
  const roi = totalCost !== 0 ? (profit / totalCost) * 100 : 0;
  const hasCosts = totalCost > 0;
  const hasBoth = hasCosts && sale > 0;
  const isProfitable = profit >= 0;

  const updateAcqItem = useCallback((id: string, patch: Partial<CostItem>) => {
    setAcqItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }, []);

  const updateRenoItem = useCallback((id: string, patch: Partial<CostItem>) => {
    setRenoItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }, []);

  const removeRenoItem = useCallback((id: string) => {
    setRenoItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);
  }, []);

  const handleScan = useCallback(async (
    id: string,
    file: File,
    update: (id: string, patch: Partial<CostItem>) => void
  ) => {
    update(id, { scanning: true });
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/extract-amount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!res.ok) throw new Error("Failed");
      const { amount } = await res.json() as { amount: number; confidence: string };
      if (amount > 0) {
        update(id, { amount: amount.toString(), scanning: false });
        toast({ title: `Scanned: AED ${fmt(amount)}` });
      } else {
        update(id, { scanning: false });
        toast({ title: "Could not read amount", description: "Enter it manually", variant: "destructive" });
      }
    } catch {
      update(id, { scanning: false });
      toast({ title: "Scan failed", description: "Enter amount manually", variant: "destructive" });
    }
  }, [toast]);

  async function handleSave() {
    if (!name.trim()) { toast({ title: "Enter a property name", variant: "destructive" }); return; }
    if (!acqTotal || !sale) { toast({ title: "Enter acquisition costs and sale price", variant: "destructive" }); return; }
    const validReno = renoItems.filter(i => i.label.trim() && parseFloat(i.amount) > 0);
    await createItem.mutateAsync({
      data: {
        name: name.trim(),
        acquisitionCost: acqTotal,
        renovationCost: renoTotal || undefined,
        costItems: validReno.length > 0 ? validReno.map(i => ({ label: i.label.trim(), amount: parseFloat(i.amount) })) : undefined,
        salePrice: sale,
      },
    });
    toast({ title: "Property saved!" });
    setName("");
    setAcqItems(ACQUISITION_ITEMS.map(i => ({ ...i, scanning: false })));
    setRenoItems([newCostItem()]);
    setSalePrice("");
  }

  function renderCostRow(
    item: CostItem,
    onAmountChange: (id: string, patch: Partial<CostItem>) => void,
    opts?: {
      labelEditable?: boolean;
      onLabelChange?: (id: string, label: string) => void;
      onRemove?: (id: string) => void;
      placeholder?: string;
    }
  ) {
    const { labelEditable = false, onLabelChange, onRemove, placeholder } = opts ?? {};
    return (
      <div key={item.id} className="flex gap-2 items-center">
        {labelEditable ? (
          <input
            type="text"
            value={item.label}
            onChange={e => onLabelChange?.(item.id, e.target.value)}
            placeholder={placeholder ?? "Item"}
            className="w-28 shrink-0 rounded-lg border border-input bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        ) : (
          <span className="w-28 shrink-0 text-sm text-foreground font-medium px-1 whitespace-nowrap">{item.label}</span>
        )}

        <div className="relative flex-1 min-w-0">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">AED</span>
          <input
            type="number"
            inputMode="decimal"
            value={item.amount}
            onChange={e => onAmountChange(item.id, { amount: e.target.value })}
            placeholder="0"
            className="w-full rounded-lg border border-input bg-background pl-12 pr-2 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>

        <ScanButton scanning={item.scanning} onClick={() => fileInputRefs.current[item.id]?.click()} />

        <input
          ref={el => { fileInputRefs.current[item.id] = el; }}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleScan(item.id, file, onAmountChange);
            e.target.value = "";
          }}
        />

        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive active:opacity-70 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 max-w-md mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profit Calculator</h1>
        <p className="text-sm text-muted-foreground">Calculate your profit potential</p>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-4 flex flex-col gap-4 shadow-sm">
        {/* Property Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Property Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Maple 89 Unit 4B"
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>

        {/* Acquisition Costs */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Acquisition Costs</label>
            {acqTotal > 0 && (
              <span className="text-xs font-semibold text-foreground">AED {fmt(acqTotal)}</span>
            )}
          </div>
          {acqItems.map(item =>
            renderCostRow(item, updateAcqItem, { labelEditable: false })
          )}
          <p className="text-xs text-muted-foreground">Tap 📷 on any row to scan a document</p>
        </div>

        <div className="h-px bg-border" />

        {/* Renovation Costs */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Renovation Costs</label>
            {renoTotal > 0 && (
              <span className="text-xs font-semibold text-primary">AED {fmt(renoTotal)}</span>
            )}
          </div>
          {renoItems.map((item, idx) =>
            renderCostRow(item, updateRenoItem, {
              labelEditable: true,
              onLabelChange: (id, label) => updateRenoItem(id, { label }),
              onRemove: renoItems.length > 1 ? removeRenoItem : undefined,
              placeholder: `Item ${idx + 1}`,
            })
          )}
          <button
            type="button"
            onClick={() => setRenoItems(prev => [...prev, newCostItem()])}
            className="flex items-center gap-1.5 text-sm text-primary font-medium py-1 active:opacity-70 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add cost item
          </button>
        </div>

        {/* Total Cost */}
        {hasCosts && (
          <div className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-2.5">
            <span className="text-sm text-muted-foreground font-medium">Total Cost</span>
            <span className="text-sm font-bold text-foreground">AED {fmt(totalCost)}</span>
          </div>
        )}

        {/* Sale Price */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Sale Price</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">AED</span>
            <input
              type="number"
              inputMode="decimal"
              value={salePrice}
              onChange={e => setSalePrice(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-background pl-14 pr-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <p className="text-xs text-muted-foreground">Target selling price</p>
        </div>
      </div>

      {/* Results */}
      {hasBoth && (
        <div className={`rounded-xl border p-4 shadow-sm ${isProfitable ? "bg-card border-card-border" : "bg-destructive/5 border-destructive/30"}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Results</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-1 py-1">
              <span className={`text-xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>{currency(profit, true)}</span>
              <span className="text-xs text-muted-foreground">Profit</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-1">
              <span className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>{isProfitable ? "+" : ""}{fmt(profitPct)}%</span>
              <span className="text-xs text-muted-foreground">Profit %</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-1">
              <span className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>{fmt(margin)}%</span>
              <span className="text-xs text-muted-foreground">Margin</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-1">
              <span className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>{fmt(roi)}%</span>
              <span className="text-xs text-muted-foreground">ROI</span>
            </div>
          </div>
        </div>
      )}

      {/* Price Targets */}
      {hasCosts && (
        <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Price Targets</p>
          <div className="flex flex-col gap-2">
            {TIERS.map(tier => {
              const price = totalCost + tier.profit;
              const isSelected = sale > 0 && Math.abs(sale - price) < 1;
              return (
                <button
                  key={tier.label}
                  onClick={() => setSalePrice(price.toString())}
                  className={`w-full flex items-center justify-between rounded-lg px-4 py-3 border transition active:opacity-80 ${isSelected ? "border-primary ring-1 ring-primary" : "border-border"} ${tier.bg}`}
                >
                  <div className="flex flex-col items-start gap-0.5">
                    <span className={`text-sm font-semibold ${tier.color}`}>{tier.label}</span>
                    <span className="text-xs text-muted-foreground">{tier.desc}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-base font-bold text-foreground">AED {fmt(price)}</span>
                    {tier.profit > 0 && <span className={`text-xs font-medium ${tier.color}`}>+AED {fmt(tier.profit)}</span>}
                    {tier.profit === 0 && <span className="text-xs text-muted-foreground">No profit</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">Tap a tier to set it as your sale price</p>
        </div>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={createItem.isPending || !name.trim() || !acqTotal || !sale}
        className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-4 text-base shadow-sm active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {createItem.isPending ? "Saving..." : "Save Property"}
      </button>
    </div>
  );
}
