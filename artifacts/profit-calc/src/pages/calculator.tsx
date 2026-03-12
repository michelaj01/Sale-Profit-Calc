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
  {
    label: "Breakeven",
    profit: 0,
    color: "text-muted-foreground",
    bg: "bg-muted/60",
    desc: "Zero profit",
  },
  {
    label: "Conservative",
    profit: 300_000,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    desc: "+AED 300K profit",
  },
  {
    label: "Moderate",
    profit: 500_000,
    color: "text-primary",
    bg: "bg-green-50 dark:bg-green-950/40",
    desc: "+AED 500K profit",
  },
  {
    label: "Ambitious",
    profit: 800_000,
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    desc: "+AED 800K profit",
  },
];

interface CostItem {
  id: string;
  label: string;
  amount: string;
  scanning: boolean;
}

function AEDInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">AED</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "0.00"}
        className="w-full rounded-lg border border-input bg-background pl-14 pr-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
      />
    </div>
  );
}

function newCostItem(): CostItem {
  return { id: crypto.randomUUID(), label: "", amount: "", scanning: false };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Calculator() {
  const [name, setName] = useState("");
  const [acqCost, setAcqCost] = useState("");
  const [costItems, setCostItems] = useState<CostItem[]>([newCostItem()]);
  const [salePrice, setSalePrice] = useState("");
  const { toast } = useToast();
  const createItem = useCreateItem();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const acq = parseFloat(acqCost) || 0;
  const renoTotal = costItems.reduce((sum, ci) => sum + (parseFloat(ci.amount) || 0), 0);
  const totalCost = acq + renoTotal;
  const sale = parseFloat(salePrice) || 0;
  const profit = sale - totalCost;
  const profitPct = totalCost !== 0 ? (profit / totalCost) * 100 : 0;
  const margin = sale !== 0 ? (profit / sale) * 100 : 0;
  const roi = totalCost !== 0 ? (profit / totalCost) * 100 : 0;
  const hasCosts = totalCost > 0;
  const hasBoth = hasCosts && sale > 0;
  const isProfitable = profit >= 0;

  const updateCostItem = useCallback((id: string, patch: Partial<CostItem>) => {
    setCostItems(prev => prev.map(ci => ci.id === id ? { ...ci, ...patch } : ci));
  }, []);

  const removeCostItem = useCallback((id: string) => {
    setCostItems(prev => prev.length > 1 ? prev.filter(ci => ci.id !== id) : prev);
  }, []);

  const addCostItem = useCallback(() => {
    setCostItems(prev => [...prev, newCostItem()]);
  }, []);

  const handleScan = useCallback(async (itemId: string, file: File) => {
    updateCostItem(itemId, { scanning: true });
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
        updateCostItem(itemId, { amount: amount.toString(), scanning: false });
        toast({ title: `Amount scanned: AED ${fmt(amount)}` });
      } else {
        updateCostItem(itemId, { scanning: false });
        toast({ title: "Could not read amount", description: "Enter it manually", variant: "destructive" });
      }
    } catch {
      updateCostItem(itemId, { scanning: false });
      toast({ title: "Scan failed", description: "Enter amount manually", variant: "destructive" });
    }
  }, [updateCostItem, toast]);

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Enter a property name", variant: "destructive" });
      return;
    }
    if (!acq || !sale) {
      toast({ title: "Enter acquisition cost and sale price", variant: "destructive" });
      return;
    }
    const validItems = costItems.filter(ci => ci.label.trim() && parseFloat(ci.amount) > 0);
    await createItem.mutateAsync({
      data: {
        name: name.trim(),
        acquisitionCost: acq,
        renovationCost: renoTotal || undefined,
        costItems: validItems.length > 0 ? validItems.map(ci => ({ label: ci.label.trim(), amount: parseFloat(ci.amount) })) : undefined,
        salePrice: sale,
      },
    });
    toast({ title: "Property saved!" });
    setName("");
    setAcqCost("");
    setCostItems([newCostItem()]);
    setSalePrice("");
  }

  return (
    <div className="flex flex-col gap-5 p-4 max-w-md mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profit Calculator</h1>
        <p className="text-sm text-muted-foreground">Calculate your profit potential</p>
      </div>

      {/* Inputs */}
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

        {/* Acquisition Cost */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Acquisition Cost</label>
          <AEDInput value={acqCost} onChange={setAcqCost} placeholder="0.00" />
          <p className="text-xs text-muted-foreground">Purchase price</p>
        </div>

        {/* Renovation / Cost Items */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Renovation Costs</label>
            {renoTotal > 0 && (
              <span className="text-xs font-semibold text-primary">AED {fmt(renoTotal)}</span>
            )}
          </div>

          {costItems.map((ci, idx) => (
            <div key={ci.id} className="flex gap-2 items-center">
              {/* Label */}
              <input
                type="text"
                value={ci.label}
                onChange={e => updateCostItem(ci.id, { label: e.target.value })}
                placeholder={`Item ${idx + 1}`}
                className="w-28 shrink-0 rounded-lg border border-input bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />

              {/* AED Amount */}
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">AED</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={ci.amount}
                  onChange={e => updateCostItem(ci.id, { amount: e.target.value })}
                  placeholder="0"
                  className="w-full rounded-lg border border-input bg-background pl-12 pr-2 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                />
              </div>

              {/* Camera scan button */}
              <button
                type="button"
                onClick={() => fileInputRefs.current[ci.id]?.click()}
                disabled={ci.scanning}
                className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border border-input bg-background text-muted-foreground active:bg-muted transition disabled:opacity-50"
                title="Scan invoice"
              >
                {ci.scanning ? (
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

              {/* Hidden file input */}
              <input
                ref={el => { fileInputRefs.current[ci.id] = el; }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleScan(ci.id, file);
                  e.target.value = "";
                }}
              />

              {/* Remove */}
              {costItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCostItem(ci.id)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive active:opacity-70 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addCostItem}
            className="flex items-center gap-1.5 text-sm text-primary font-medium py-1 active:opacity-70 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add cost item
          </button>

          <p className="text-xs text-muted-foreground -mt-1">Tap <span className="font-medium">📷</span> to scan a quotation or invoice</p>
        </div>

        {/* Total cost indicator */}
        {hasCosts && (
          <div className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-2.5">
            <span className="text-sm text-muted-foreground font-medium">Total Cost</span>
            <span className="text-sm font-bold text-foreground">AED {fmt(totalCost)}</span>
          </div>
        )}

        {/* Sale Price */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Sale Price</label>
          <AEDInput value={salePrice} onChange={setSalePrice} placeholder="0.00" />
          <p className="text-xs text-muted-foreground">Target selling price</p>
        </div>
      </div>

      {/* Results */}
      {hasBoth && (
        <div className={`rounded-xl border p-4 shadow-sm ${isProfitable ? "bg-card border-card-border" : "bg-destructive/5 border-destructive/30"}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Results</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-1 py-1">
              <span className={`text-xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>
                {currency(profit, true)}
              </span>
              <span className="text-xs text-muted-foreground">Profit</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-1">
              <span className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>
                {isProfitable ? "+" : ""}{fmt(profitPct)}%
              </span>
              <span className="text-xs text-muted-foreground">Profit %</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-1">
              <span className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>
                {fmt(margin)}%
              </span>
              <span className="text-xs text-muted-foreground">Margin</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-1">
              <span className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>
                {fmt(roi)}%
              </span>
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
            {TIERS.map((tier) => {
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
                    {tier.profit > 0 && (
                      <span className={`text-xs font-medium ${tier.color}`}>+AED {fmt(tier.profit)}</span>
                    )}
                    {tier.profit === 0 && (
                      <span className="text-xs text-muted-foreground">No profit</span>
                    )}
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
        disabled={createItem.isPending || !name.trim() || !acq || !sale}
        className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-4 text-base shadow-sm active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {createItem.isPending ? "Saving..." : "Save Property"}
      </button>
    </div>
  );
}
