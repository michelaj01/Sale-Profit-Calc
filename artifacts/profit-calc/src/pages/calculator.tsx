import { useState } from "react";
import { useCreateItem } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function fmt(val: number) {
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TIERS = [
  { label: "Breakeven", margin: 0,   color: "text-muted-foreground", bg: "bg-muted/60",        desc: "No profit" },
  { label: "Conservative", margin: 0.25, color: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-950/40", desc: "25% margin" },
  { label: "Moderate",  margin: 0.40, color: "text-primary",        bg: "bg-green-50 dark:bg-green-950/40", desc: "40% margin" },
  { label: "Ambitious", margin: 0.60, color: "text-amber-500",      bg: "bg-amber-50 dark:bg-amber-950/40", desc: "60% margin" },
];

function tierPrice(acq: number, margin: number) {
  // margin = profit / price  =>  price = acq / (1 - margin)
  if (margin >= 1) return acq;
  return margin === 0 ? acq : acq / (1 - margin);
}

export default function Calculator() {
  const [name, setName] = useState("");
  const [acqCost, setAcqCost] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const createItem = useCreateItem();

  const acq = parseFloat(acqCost) || 0;
  const sale = parseFloat(salePrice) || 0;
  const profit = sale - acq;
  const profitPct = acq !== 0 ? (profit / acq) * 100 : 0;
  const margin = sale !== 0 ? (profit / sale) * 100 : 0;
  const roi = acq !== 0 ? (profit / acq) * 100 : 0;
  const hasBoth = acq > 0 && sale > 0;
  const isProfitable = profit >= 0;

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Enter an item name", variant: "destructive" });
      return;
    }
    if (!acq || !sale) {
      toast({ title: "Enter both costs", variant: "destructive" });
      return;
    }
    await createItem.mutateAsync({
      data: { name: name.trim(), acquisitionCost: acq, salePrice: sale, notes: notes.trim() || undefined },
    });
    toast({ title: "Saved to history!" });
    setName("");
    setAcqCost("");
    setSalePrice("");
    setNotes("");
  }

  return (
    <div className="flex flex-col gap-5 p-4 max-w-md mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profit Calculator</h1>
        <p className="text-sm text-muted-foreground">Calculate your profit potential</p>
      </div>

      {/* Input section */}
      <div className="bg-card border border-card-border rounded-xl p-4 flex flex-col gap-4 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Item Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Vintage Lamp"
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Acquisition Cost</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-base font-medium">$</span>
            <input
              type="number"
              inputMode="decimal"
              value={acqCost}
              onChange={e => setAcqCost(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-background pl-8 pr-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <p className="text-xs text-muted-foreground">What you paid for it</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Sale Price</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-base font-medium">$</span>
            <input
              type="number"
              inputMode="decimal"
              value={salePrice}
              onChange={e => setSalePrice(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-background pl-8 pr-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <p className="text-xs text-muted-foreground">What you want to sell it for</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Found at garage sale"
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
      </div>

      {/* Results — shown when both cost and price entered */}
      {hasBoth && (
        <div className={`rounded-xl border p-4 shadow-sm ${isProfitable ? "bg-card border-card-border" : "bg-destructive/5 border-destructive/30"}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Results</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-1 py-1">
              <span className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>
                {isProfitable ? "+$" : "-$"}{fmt(Math.abs(profit))}
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

      {/* Pricing tiers — shown whenever acquisition cost is entered */}
      {acq > 0 && (
        <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Price Targets</p>
          <div className="flex flex-col gap-2">
            {TIERS.map((tier) => {
              const price = tierPrice(acq, tier.margin);
              const tierProfit = price - acq;
              const isSelected = sale > 0 && Math.abs(sale - price) < 0.005;
              return (
                <button
                  key={tier.label}
                  onClick={() => setSalePrice(fmt(price))}
                  className={`w-full flex items-center justify-between rounded-lg px-4 py-3 border transition active:opacity-80 ${isSelected ? "border-primary ring-1 ring-primary" : "border-border"} ${tier.bg}`}
                >
                  <div className="flex flex-col items-start gap-0.5">
                    <span className={`text-sm font-semibold ${tier.color}`}>{tier.label}</span>
                    <span className="text-xs text-muted-foreground">{tier.desc}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-base font-bold text-foreground">${fmt(price)}</span>
                    {tier.margin > 0 && (
                      <span className={`text-xs font-medium ${tier.color}`}>+${fmt(tierProfit)}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">Tap a tier to set it as your sale price</p>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={createItem.isPending || !name.trim() || !acq || !sale}
        className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-4 text-base shadow-sm active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {createItem.isPending ? "Saving..." : "Save Item"}
      </button>
    </div>
  );
}
