import { useState } from "react";
import { useCreateItem } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function fmt(val: number) {
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
          <label className="text-sm font-medium text-foreground">Target Sale Price</label>
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

      {/* Results */}
      {hasBoth && (
        <div className={`rounded-xl border p-4 shadow-sm ${isProfitable ? "bg-card border-card-border" : "bg-destructive/5 border-destructive/30"}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Results</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-1">
              <span className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>
                {isProfitable ? "+" : ""}{fmt(profit)}
              </span>
              <span className="text-xs text-muted-foreground">Profit</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>
                {fmt(margin)}%
              </span>
              <span className="text-xs text-muted-foreground">Margin</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className={`text-2xl font-bold ${isProfitable ? "text-primary" : "text-destructive"}`}>
                {fmt(roi)}%
              </span>
              <span className="text-xs text-muted-foreground">ROI</span>
            </div>
          </div>

          {/* Breakdown bar */}
          {sale > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Cost: ${fmt(acq)}</span>
                <span>Sale: ${fmt(sale)}</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isProfitable ? "bg-primary" : "bg-destructive"}`}
                  style={{ width: `${Math.min(100, Math.max(0, (acq / sale) * 100))}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                {isProfitable
                  ? `Cost is ${fmt((acq / sale) * 100)}% of sale price`
                  : "Cost exceeds sale price"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={createItem.isPending || !name.trim() || !acq || !sale}
        className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-4 text-base shadow-sm active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {createItem.isPending ? "Saving..." : "Save to History"}
      </button>
    </div>
  );
}
