import { useState } from "react";
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

function AEDInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
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

export default function Calculator() {
  const [name, setName] = useState("");
  const [acqCost, setAcqCost] = useState("");
  const [renoCost, setRenoCost] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const createItem = useCreateItem();

  const acq = parseFloat(acqCost) || 0;
  const reno = parseFloat(renoCost) || 0;
  const totalCost = acq + reno;
  const sale = parseFloat(salePrice) || 0;
  const profit = sale - totalCost;
  const profitPct = totalCost !== 0 ? (profit / totalCost) * 100 : 0;
  const margin = sale !== 0 ? (profit / sale) * 100 : 0;
  const roi = totalCost !== 0 ? (profit / totalCost) * 100 : 0;
  const hasCosts = totalCost > 0;
  const hasBoth = hasCosts && sale > 0;
  const isProfitable = profit >= 0;

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Enter a property name", variant: "destructive" });
      return;
    }
    if (!acq || !sale) {
      toast({ title: "Enter acquisition cost and sale price", variant: "destructive" });
      return;
    }
    await createItem.mutateAsync({
      data: {
        name: name.trim(),
        acquisitionCost: acq,
        renovationCost: reno || undefined,
        salePrice: sale,
        notes: notes.trim() || undefined,
      },
    });
    toast({ title: "Property saved!" });
    setName("");
    setAcqCost("");
    setRenoCost("");
    setSalePrice("");
    setNotes("");
  }

  return (
    <div className="flex flex-col gap-5 p-4 max-w-md mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profit Calculator</h1>
        <p className="text-sm text-muted-foreground">Calculate your profit potential</p>
      </div>

      {/* Inputs */}
      <div className="bg-card border border-card-border rounded-xl p-4 flex flex-col gap-4 shadow-sm">
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

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Acquisition Cost</label>
          <AEDInput value={acqCost} onChange={setAcqCost} placeholder="0.00" />
          <p className="text-xs text-muted-foreground">Purchase price</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Renovation Cost <span className="text-muted-foreground font-normal">(optional)</span></label>
          <AEDInput value={renoCost} onChange={setRenoCost} placeholder="0.00" />
          <p className="text-xs text-muted-foreground">Fit-out, refurb, or other costs</p>
        </div>

        {/* Total cost indicator */}
        {hasCosts && (
          <div className="flex items-center justify-between rounded-lg bg-muted/60 px-4 py-2.5">
            <span className="text-sm text-muted-foreground font-medium">Total Cost</span>
            <span className="text-sm font-bold text-foreground">AED {fmt(totalCost)}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Sale Price</label>
          <AEDInput value={salePrice} onChange={setSalePrice} placeholder="0.00" />
          <p className="text-xs text-muted-foreground">Target selling price</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Off-plan, handover Q4 2025"
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
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

      {/* Price Targets — based on total cost */}
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
                      <span className={`text-xs font-medium ${tier.color}`}>
                        +AED {fmt(tier.profit)}
                      </span>
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
