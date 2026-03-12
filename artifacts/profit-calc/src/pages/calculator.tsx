import { useState, useRef, useCallback } from "react";
import { useCreateItem } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function fmt(val: number) {
  return val.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(val: number) {
  return val.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function currency(val: number, showSign = false) {
  const sign = showSign && val > 0 ? "+" : showSign && val < 0 ? "−" : "";
  return `${sign}AED ${fmt(Math.abs(val))}`;
}

const AGENCY_FEE_PCT = 0.02;
const DLD_FEE_PCT = 0.04;
const MORTGAGE_REG_PCT = 0.0025;
const MORTGAGE_REG_FIXED = 290;

const TIERS = [
  {
    label: "Breakeven",
    minProfit: 0,
    maxProfit: 300_000,
    targetProfit: 0,
    color: "text-muted-foreground",
    activeColor: "text-slate-700 dark:text-slate-200",
    bg: "bg-muted/60",
    activeBg: "bg-slate-100 dark:bg-slate-800",
    ring: "ring-slate-400",
    desc: "Zero profit",
  },
  {
    label: "Conservative",
    minProfit: 300_000,
    maxProfit: 500_000,
    targetProfit: 300_000,
    color: "text-blue-500",
    activeColor: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    activeBg: "bg-blue-100 dark:bg-blue-900/60",
    ring: "ring-blue-500",
    desc: "+AED 300K profit",
  },
  {
    label: "Moderate",
    minProfit: 500_000,
    maxProfit: 800_000,
    targetProfit: 500_000,
    color: "text-emerald-600",
    activeColor: "text-emerald-700",
    bg: "bg-green-50 dark:bg-green-950/40",
    activeBg: "bg-emerald-100 dark:bg-emerald-900/60",
    ring: "ring-emerald-500",
    desc: "+AED 500K profit",
  },
  {
    label: "Ambitious",
    minProfit: 800_000,
    maxProfit: Infinity,
    targetProfit: 800_000,
    color: "text-amber-500",
    activeColor: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    activeBg: "bg-amber-100 dark:bg-amber-900/60",
    ring: "ring-amber-500",
    desc: "+AED 800K profit",
  },
];

function getActiveTierLabel(profit: number): string | null {
  if (profit < 0) return null;
  for (const t of TIERS) {
    if (profit >= t.minProfit && profit < t.maxProfit) return t.label;
  }
  return "Ambitious";
}

interface CostItem {
  id: string;
  label: string;
  amount: string;
  scanning: boolean;
}

function newCostItem(): CostItem {
  return { id: crypto.randomUUID(), label: "", amount: "", scanning: false };
}

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
  const [propertyPrice, setPropertyPrice] = useState("");
  const [renoItems, setRenoItems] = useState<CostItem[]>([newCostItem()]);
  const [salePrice, setSalePrice] = useState("");
  const [downPct, setDownPct] = useState("20");
  const { toast } = useToast();
  const createItem = useCreateItem();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const propPrice = parseFloat(propertyPrice) || 0;
  const agencyFee = propPrice * AGENCY_FEE_PCT;
  const dldFee = propPrice * DLD_FEE_PCT;
  const mortgageRegFee = propPrice > 0 ? propPrice * MORTGAGE_REG_PCT + MORTGAGE_REG_FIXED : 0;
  const acqTotal = propPrice + agencyFee + dldFee + mortgageRegFee;
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
  const activeTierLabel = hasBoth ? getActiveTierLabel(profit) : null;

  // Mortgage ROI
  const dpPct = Math.min(100, Math.max(0, parseFloat(downPct) || 20)) / 100;
  const downPayment = propPrice * dpPct;
  const cashOut = downPayment + agencyFee + dldFee + mortgageRegFee + renoTotal;
  const mortgageRoi = cashOut > 0 ? (profit / cashOut) * 100 : 0;

  const updateRenoItem = useCallback((id: string, patch: Partial<CostItem>) => {
    setRenoItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }, []);

  const removeRenoItem = useCallback((id: string) => {
    setRenoItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);
  }, []);

  const handleScan = useCallback(async (id: string, file: File) => {
    updateRenoItem(id, { scanning: true });
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
        updateRenoItem(id, { amount: amount.toString(), scanning: false });
        toast({ title: `Scanned: AED ${fmt(amount)}` });
      } else {
        updateRenoItem(id, { scanning: false });
        toast({ title: "Could not read amount", description: "Enter it manually", variant: "destructive" });
      }
    } catch {
      updateRenoItem(id, { scanning: false });
      toast({ title: "Scan failed", description: "Enter amount manually", variant: "destructive" });
    }
  }, [updateRenoItem, toast]);

  async function handleSave() {
    if (!name.trim()) { toast({ title: "Enter a property name", variant: "destructive" }); return; }
    if (!propPrice || !sale) { toast({ title: "Enter property price and sale price", variant: "destructive" }); return; }
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
    setPropertyPrice("");
    setRenoItems([newCostItem()]);
    setSalePrice("");
  }

  return (
    <div className="flex flex-col gap-5 p-4 max-w-md mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profit Calculator</h1>
        <p className="text-sm text-muted-foreground">Calculate your profit potential</p>
      </div>

      {/* Input card */}
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
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Acquisition Costs</label>
            {acqTotal > 0 && <span className="text-xs font-semibold text-foreground">AED {fmt(acqTotal)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm text-foreground font-medium px-1 whitespace-nowrap">Property Price</span>
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">AED</span>
              <input
                type="number"
                inputMode="decimal"
                value={propertyPrice}
                onChange={e => setPropertyPrice(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-input bg-background pl-12 pr-2 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
            </div>
          </div>
          {propPrice > 0 && (
            <div className="flex flex-col gap-1.5 bg-muted/40 rounded-lg px-3 py-2.5">
              {[
                { label: "Agency Fee", sub: "2%", val: agencyFee },
                { label: "DLD Fee", sub: "4%", val: dldFee },
                { label: "Mortgage Reg.", sub: "0.25% + 290", val: mortgageRegFee },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm text-foreground">{row.label}</span>
                    <span className="text-[11px] text-muted-foreground">{row.sub}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">AED {fmt(row.val)}</span>
                </div>
              ))}
              <div className="border-t border-border mt-1 pt-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Total Acquisition</span>
                <span className="text-sm font-bold text-foreground">AED {fmt(acqTotal)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* Renovation Costs */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Renovation Costs</label>
            {renoTotal > 0 && <span className="text-xs font-semibold text-primary">AED {fmt(renoTotal)}</span>}
          </div>
          {renoItems.map((item, idx) => (
            <div key={item.id} className="flex gap-2 items-center">
              <input
                type="text"
                value={item.label}
                onChange={e => updateRenoItem(item.id, { label: e.target.value })}
                placeholder={`Item ${idx + 1}`}
                className="w-28 shrink-0 rounded-lg border border-input bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">AED</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={item.amount}
                  onChange={e => updateRenoItem(item.id, { amount: e.target.value })}
                  placeholder="0"
                  className="w-full rounded-lg border border-input bg-background pl-12 pr-2 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                />
              </div>
              <ScanButton scanning={item.scanning} onClick={() => fileInputRefs.current[item.id]?.click()} />
              <input
                ref={el => { fileInputRefs.current[item.id] = el; }}
                type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(item.id, f); e.target.value = ""; }}
              />
              {renoItems.length > 1 && (
                <button type="button" onClick={() => removeRenoItem(item.id)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive active:opacity-70 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setRenoItems(prev => [...prev, newCostItem()])}
            className="flex items-center gap-1.5 text-sm text-primary font-medium py-1 active:opacity-70 transition">
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
              const tierPrice = totalCost + tier.targetProfit;
              const tierProfit = tierPrice - totalCost;
              const tierProfitPct = totalCost !== 0 ? (tierProfit / totalCost) * 100 : 0;
              const isActive = activeTierLabel === tier.label;
              const isTapped = sale > 0 && Math.abs(sale - tierPrice) < 1;

              return (
                <button
                  key={tier.label}
                  onClick={() => setSalePrice(tierPrice.toString())}
                  className={`w-full flex items-center justify-between rounded-xl px-4 py-3 border-2 transition active:opacity-80
                    ${isActive
                      ? `${tier.activeBg} border-current ${tier.ring} ring-2 shadow-sm`
                      : isTapped
                        ? `${tier.bg} border-current ${tier.ring} ring-1`
                        : `${tier.bg} border-transparent`
                    }`}
                >
                  <div className="flex flex-col items-start gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isActive ? tier.activeColor : tier.color}`}>{tier.label}</span>
                      {isActive && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tier.activeBg} ${tier.activeColor} border border-current`}>
                          YOUR PRICE
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">Sell at AED {fmtShort(tierPrice)}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`text-base font-bold ${tier.targetProfit > 0 ? tier.color : "text-muted-foreground"}`}>
                      {tier.targetProfit > 0 ? `+AED ${fmtShort(tier.targetProfit)}` : "AED 0"}
                    </span>
                    <span className={`text-xs font-semibold ${tier.targetProfit > 0 ? tier.color : "text-muted-foreground"}`}>
                      {tier.targetProfit > 0 ? `+${fmt(tierProfitPct)}%` : "0%"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {!activeTierLabel && hasBoth && (
            <p className="text-xs text-destructive mt-2 text-center font-medium">Below breakeven — selling at a loss</p>
          )}
          {!hasBoth && (
            <p className="text-xs text-muted-foreground mt-2 text-center">Enter a sale price to see your tier</p>
          )}
        </div>
      )}

      {/* Mortgage ROI */}
      {hasCosts && (
        <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Mortgage Return</p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Down</span>
              <div className="relative w-16">
                <input
                  type="number"
                  inputMode="decimal"
                  value={downPct}
                  onChange={e => setDownPct(e.target.value)}
                  min={1} max={100}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1 text-sm text-center text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                />
              </div>
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Down payment ({downPct}%)</span>
              <span className="font-medium text-foreground">AED {fmt(downPayment)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Fees (agency + DLD + reg)</span>
              <span className="font-medium text-foreground">AED {fmt(agencyFee + dldFee + mortgageRegFee)}</span>
            </div>
            {renoTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Renovation costs</span>
                <span className="font-medium text-foreground">AED {fmt(renoTotal)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1.5 mt-0.5">
              <span className="font-semibold text-foreground">Total out of pocket</span>
              <span className="font-bold text-foreground">AED {fmt(cashOut)}</span>
            </div>
          </div>

          {hasBoth && cashOut > 0 && (
            <div className={`mt-3 rounded-xl p-3 flex items-center justify-between ${isProfitable ? "bg-primary/10" : "bg-destructive/10"}`}>
              <div>
                <p className="text-xs text-muted-foreground">Return on cash invested</p>
                <p className={`text-xl font-bold mt-0.5 ${isProfitable ? "text-primary" : "text-destructive"}`}>
                  {isProfitable ? "+" : ""}{fmt(mortgageRoi)}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Profit</p>
                <p className={`text-base font-bold mt-0.5 ${isProfitable ? "text-primary" : "text-destructive"}`}>
                  {currency(profit, true)}
                </p>
              </div>
            </div>
          )}

          {!hasBoth && (
            <p className="text-xs text-muted-foreground mt-2 text-center">Enter a sale price to see your mortgage return</p>
          )}
        </div>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={createItem.isPending || !name.trim() || !propPrice || !sale}
        className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-4 text-base shadow-sm active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {createItem.isPending ? "Saving..." : "Save Property"}
      </button>
    </div>
  );
}
