import { useState, useRef, useCallback } from "react";
import { useCreateItem } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// ─── formatting ────────────────────────────────────────────────────────────

function fmtDisplay(raw: string): string {
  if (!raw) return "";
  const [int, dec] = raw.split(".");
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec !== undefined ? `${formatted}.${dec}` : formatted;
}

function stripCommas(s: string): string {
  return s.replace(/,/g, "").replace(/[^\d.]/g, "");
}

function n(raw: string): number {
  return parseFloat(raw) || 0;
}

function aed(val: number): string {
  return "AED " + val.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function aedSigned(val: number): string {
  const sign = val > 0 ? "+" : val < 0 ? "−" : "";
  return `${sign}AED ${Math.abs(val).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(val: number): string {
  return val.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

// ─── constants ─────────────────────────────────────────────────────────────

const AGENCY_FEE_PCT   = 0.02;
const AGENCY_VAT_PCT   = 0.05;
const DLD_FEE_PCT      = 0.04;
const TRUSTEE_FEE_FLAT = 4_200;
const MORTGAGE_REG_PCT = 0.0025;

const TIERS = [
  { label: "Breakeven",    minProfit: 0,       maxProfit: 300_000,  targetProfit: 0,       color: "text-slate-500",    activeColor: "text-slate-700", bg: "bg-slate-50 dark:bg-slate-800/40",   activeBg: "bg-slate-100 dark:bg-slate-800",   ring: "ring-slate-400",  desc: "Zero profit" },
  { label: "Conservative", minProfit: 300_000, maxProfit: 500_000,  targetProfit: 300_000, color: "text-blue-500",     activeColor: "text-blue-600",  bg: "bg-blue-50 dark:bg-blue-950/40",     activeBg: "bg-blue-100 dark:bg-blue-900/60",  ring: "ring-blue-500",   desc: "+AED 300K profit" },
  { label: "Moderate",     minProfit: 500_000, maxProfit: 800_000,  targetProfit: 500_000, color: "text-emerald-600",  activeColor: "text-emerald-700", bg: "bg-green-50 dark:bg-green-950/40", activeBg: "bg-emerald-100 dark:bg-emerald-900/60", ring: "ring-emerald-500", desc: "+AED 500K profit" },
  { label: "Ambitious",    minProfit: 800_000, maxProfit: Infinity, targetProfit: 800_000, color: "text-amber-500",    activeColor: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40",   activeBg: "bg-amber-100 dark:bg-amber-900/60", ring: "ring-amber-500",  desc: "+AED 800K profit" },
];

function getActiveTier(profit: number): string | null {
  if (profit < 0) return null;
  for (const t of TIERS) {
    if (profit >= t.minProfit && profit < t.maxProfit) return t.label;
  }
  return "Ambitious";
}

// ─── inputs ────────────────────────────────────────────────────────────────

function NumberInput({
  value, onChange, placeholder, className,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = stripCommas(e.target.value);
    onChange(raw);
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      value={fmtDisplay(value)}
      onChange={handleChange}
      placeholder={placeholder ?? "0"}
      className={className}
    />
  );
}

function AEDInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold select-none">AED</span>
      <NumberInput
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? "0"}
        className="w-full rounded-lg border border-input bg-background pl-14 pr-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
      />
    </div>
  );
}

function AEDRowInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative flex-1 min-w-0">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold select-none">AED</span>
      <NumberInput
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? "0"}
        className="w-full rounded-lg border border-input bg-background pl-12 pr-2 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
      />
    </div>
  );
}

// ─── cost items ────────────────────────────────────────────────────────────

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
    <button type="button" onClick={onClick} disabled={scanning}
      className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border border-input bg-background text-muted-foreground active:bg-muted transition disabled:opacity-50" title="Scan invoice">
      {scanning ? (
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  );
}

// ─── main component ────────────────────────────────────────────────────────

export default function Calculator() {
  const [name, setName] = useState("");

  // Acquisition inputs
  const [propertyPrice, setPropertyPrice] = useState("");
  const [bankProcFee, setBankProcFee]     = useState("");
  const [valuationFee, setValuationFee]   = useState("");
  const [nocFee, setNocFee]               = useState("");
  const [serviceFee, setServiceFee]       = useState("");

  // Renovation
  const [renoItems, setRenoItems] = useState<CostItem[]>([newCostItem()]);

  // Sale & mortgage
  const [salePrice, setSalePrice] = useState("");
  const [downPct, setDownPct]     = useState("20");

  const { toast } = useToast();
  const createItem = useCreateItem();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── derived acquisition ────────────────────────────────────────────────
  const propPrice    = n(propertyPrice);
  const agencyFee    = propPrice * AGENCY_FEE_PCT * (1 + AGENCY_VAT_PCT);  // 2% + 5% VAT
  const dldFee       = propPrice * DLD_FEE_PCT;
  const trusteeFee   = propPrice > 0 ? TRUSTEE_FEE_FLAT : 0;
  const downFrac     = Math.min(100, Math.max(0, parseFloat(downPct) || 20)) / 100;
  const loanAmount   = propPrice * (1 - downFrac);
  const mortgageReg  = loanAmount * MORTGAGE_REG_PCT;                       // 0.25% of loan
  const manualAcq    = n(bankProcFee) + n(valuationFee) + n(nocFee) + n(serviceFee);
  const acqTotal     = propPrice + agencyFee + dldFee + trusteeFee + mortgageReg + manualAcq;

  // ── derived reno & totals ──────────────────────────────────────────────
  const renoTotal  = renoItems.reduce((s, i) => s + n(i.amount), 0);
  const totalCost  = acqTotal + renoTotal;
  const sale       = n(salePrice);
  const profit     = sale - totalCost;
  const profitPct  = totalCost ? (profit / totalCost) * 100 : 0;
  const margin     = sale ? (profit / sale) * 100 : 0;
  const roi        = totalCost ? (profit / totalCost) * 100 : 0;
  const hasCosts   = totalCost > 0;
  const hasBoth    = hasCosts && sale > 0;
  const profitable = profit >= 0;
  const activeTier = hasBoth ? getActiveTier(profit) : null;

  // ── mortgage return ────────────────────────────────────────────────────
  const downPayment  = propPrice * downFrac;
  const cashOut      = downPayment + agencyFee + dldFee + trusteeFee + mortgageReg + manualAcq + renoTotal;
  const mortgageRoiPct = cashOut > 0 ? (profit / cashOut) * 100 : 0;

  // ── handlers ──────────────────────────────────────────────────────────
  const updateRenoItem = useCallback((id: string, patch: Partial<CostItem>) =>
    setRenoItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i)), []);

  const removeRenoItem = useCallback((id: string) =>
    setRenoItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev), []);

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
      const { amount } = await res.json() as { amount: number };
      if (amount > 0) {
        updateRenoItem(id, { amount: amount.toString(), scanning: false });
        toast({ title: `Scanned: ${aed(amount)}` });
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
    const validReno = renoItems.filter(i => i.label.trim() && n(i.amount) > 0);
    await createItem.mutateAsync({
      data: {
        name: name.trim(),
        acquisitionCost: acqTotal,
        renovationCost: renoTotal || undefined,
        costItems: validReno.length > 0 ? validReno.map(i => ({ label: i.label.trim(), amount: n(i.amount) })) : undefined,
        salePrice: sale,
      },
    });
    toast({ title: "Property saved!" });
    setName(""); setPropertyPrice(""); setBankProcFee(""); setValuationFee(""); setNocFee(""); setServiceFee("");
    setRenoItems([newCostItem()]); setSalePrice("");
  }

  // ── auto row ──────────────────────────────────────────────────────────
  function AutoRow({ label, sub, val }: { label: string; sub: string; val: number }) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm text-foreground">{label}</span>
          <span className="text-[11px] text-muted-foreground">{sub}</span>
        </div>
        <span className={`text-sm font-medium tabular-nums ${propPrice > 0 ? "text-foreground" : "text-muted-foreground"}`}>
          {aed(val)}
        </span>
      </div>
    );
  }

  function ManualRow({ label, sub, value, onChange }: { label: string; sub?: string; value: string; onChange: (v: string) => void }) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-baseline gap-1">
          <span className="text-sm text-foreground whitespace-nowrap">{label}</span>
          {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
        </div>
        <div className="relative w-36">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold select-none">AED</span>
          <NumberInput
            value={value}
            onChange={onChange}
            className="w-full rounded-md border border-input bg-background pl-10 pr-2 py-1.5 text-sm text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 p-4 max-w-md mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profit Calculator</h1>
        <p className="text-sm text-muted-foreground">Calculate your profit potential</p>
      </div>

      {/* ── Input card ── */}
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

        {/* ── Acquisition Costs ── */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Acquisition Costs</label>
            {acqTotal > 0 && <span className="text-xs font-semibold tabular-nums text-foreground">{aed(acqTotal)}</span>}
          </div>

          {/* Property price input */}
          <div className="flex items-center gap-2">
            <span className="w-32 shrink-0 text-sm font-medium text-foreground whitespace-nowrap">Property Price</span>
            <AEDInput value={propertyPrice} onChange={setPropertyPrice} className="flex-1 min-w-0" />
          </div>

          {/* Auto-computed fees */}
          <div className="flex flex-col gap-2 bg-muted/40 rounded-lg px-3 py-2.5">
            <AutoRow label="Agency Fee" sub="2% + 5% VAT" val={agencyFee} />
            <AutoRow label="DLD Fee"    sub="4%"           val={dldFee} />
            <AutoRow label="Trustee Fee" sub="flat"        val={trusteeFee} />
            <AutoRow label="Mortgage Reg." sub="0.25% of loan" val={mortgageReg} />

            <div className="h-px bg-border" />

            {/* Manual / variable fees */}
            <ManualRow label="Bank Processing" value={bankProcFee} onChange={setBankProcFee} />
            <ManualRow label="Valuation Fee"   value={valuationFee} onChange={setValuationFee} />
            <ManualRow label="NOC Fee"         value={nocFee} onChange={setNocFee} />
            <ManualRow label="Service Fee Prov." value={serviceFee} onChange={setServiceFee} />

            <div className="border-t border-border pt-1.5 flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">Total Acquisition</span>
              <span className={`text-sm font-bold tabular-nums ${propPrice > 0 ? "text-foreground" : "text-muted-foreground"}`}>{aed(acqTotal)}</span>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* ── Renovation Costs ── */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Renovation Costs</label>
            {renoTotal > 0 && <span className="text-xs font-semibold text-primary tabular-nums">{aed(renoTotal)}</span>}
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
              <AEDRowInput value={item.amount} onChange={v => updateRenoItem(item.id, { amount: v })} />
              <ScanButton scanning={item.scanning} onClick={() => fileInputRefs.current[item.id]?.click()} />
              <input ref={el => { fileInputRefs.current[item.id] = el; }} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(item.id, f); e.target.value = ""; }} />
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
            <span className="text-sm font-bold text-foreground tabular-nums">{aed(totalCost)}</span>
          </div>
        )}

        {/* Sale Price */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Sale Price</label>
          <AEDInput value={salePrice} onChange={setSalePrice} placeholder="0" />
          <p className="text-xs text-muted-foreground">Target selling price</p>
        </div>
      </div>

      {/* ── Results ── */}
      {hasBoth && (
        <div className={`rounded-xl border p-4 shadow-sm ${profitable ? "bg-card border-card-border" : "bg-destructive/5 border-destructive/30"}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Results</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { val: aedSigned(profit),        label: "Profit" },
              { val: (profitable ? "+" : "") + pct(profitPct), label: "Profit %" },
              { val: pct(margin),              label: "Margin" },
              { val: pct(roi),                 label: "ROI" },
            ].map(({ val, label }) => (
              <div key={label} className="flex flex-col items-center gap-1 py-1">
                <span className={`text-xl font-bold tabular-nums ${profitable ? "text-primary" : "text-destructive"}`}>{val}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Price Targets ── */}
      {hasCosts && (
        <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Price Targets</p>
          <div className="flex flex-col gap-2">
            {TIERS.map(tier => {
              const tierPrice     = totalCost + tier.targetProfit;
              const tierProfit    = tier.targetProfit;
              const tierProfitPct = totalCost ? (tierProfit / totalCost) * 100 : 0;
              const isActive      = activeTier === tier.label;

              return (
                <button key={tier.label} onClick={() => setSalePrice(tierPrice.toString())}
                  className={`w-full flex items-center justify-between rounded-xl px-4 py-3 border-2 transition active:opacity-80
                    ${isActive
                      ? `${tier.activeBg} border-current ${tier.ring} ring-2 shadow-sm`
                      : `${tier.bg} border-transparent`}`}>
                  <div className="flex flex-col items-start gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isActive ? tier.activeColor : tier.color}`}>{tier.label}</span>
                      {isActive && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tier.activeBg} ${tier.activeColor} border border-current`}>
                          YOUR PRICE
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">Sell at {aed(tierPrice)}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`text-sm font-bold tabular-nums ${tier.targetProfit > 0 ? tier.color : "text-muted-foreground"}`}>
                      {tier.targetProfit > 0 ? `+AED ${tierProfit.toLocaleString("en-AE", { maximumFractionDigits: 0 })}` : "AED 0"}
                    </span>
                    <span className={`text-xs font-semibold tabular-nums ${tier.targetProfit > 0 ? tier.color : "text-muted-foreground"}`}>
                      {tier.targetProfit > 0 ? `+${pct(tierProfitPct)}` : "0%"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {!activeTier && hasBoth && (
            <p className="text-xs text-destructive mt-2 text-center font-medium">Below breakeven — selling at a loss</p>
          )}
          {!hasBoth && (
            <p className="text-xs text-muted-foreground mt-2 text-center">Enter a sale price to see your tier</p>
          )}
        </div>
      )}

      {/* ── Mortgage Return ── */}
      {hasCosts && (
        <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Mortgage Return</p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Down</span>
              <div className="relative w-16">
                <input type="number" inputMode="decimal" value={downPct} onChange={e => setDownPct(e.target.value)}
                  min={1} max={100}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1 text-sm text-center text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
              </div>
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 text-sm">
            {[
              { label: `Down payment (${Math.round(downFrac * 100)}%)`, val: downPayment },
              { label: "Agency fee + DLD + trustee + reg", val: agencyFee + dldFee + trusteeFee + mortgageReg },
              ...(manualAcq > 0 ? [{ label: "Other fees", val: manualAcq }] : []),
              ...(renoTotal > 0 ? [{ label: "Renovation costs", val: renoTotal }] : []),
            ].map(({ label, val }) => (
              <div key={label} className="flex justify-between text-muted-foreground">
                <span>{label}</span>
                <span className="font-medium text-foreground tabular-nums">{aed(val)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1.5 mt-0.5">
              <span className="font-semibold text-foreground">Total out of pocket</span>
              <span className="font-bold text-foreground tabular-nums">{aed(cashOut)}</span>
            </div>
          </div>

          {hasBoth && cashOut > 0 && (
            <div className={`mt-3 rounded-xl p-3 flex items-center justify-between ${profitable ? "bg-primary/10" : "bg-destructive/10"}`}>
              <div>
                <p className="text-xs text-muted-foreground">Return on cash invested</p>
                <p className={`text-xl font-bold mt-0.5 tabular-nums ${profitable ? "text-primary" : "text-destructive"}`}>
                  {(profitable ? "+" : "") + pct(mortgageRoiPct)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Profit</p>
                <p className={`text-base font-bold mt-0.5 tabular-nums ${profitable ? "text-primary" : "text-destructive"}`}>
                  {aedSigned(profit)}
                </p>
              </div>
            </div>
          )}
          {!hasBoth && <p className="text-xs text-muted-foreground mt-2 text-center">Enter a sale price to see your mortgage return</p>}
        </div>
      )}

      {/* Save */}
      <button onClick={handleSave}
        disabled={createItem.isPending || !name.trim() || !propPrice || !sale}
        className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-4 text-base shadow-sm active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition">
        {createItem.isPending ? "Saving..." : "Save Property"}
      </button>
    </div>
  );
}
