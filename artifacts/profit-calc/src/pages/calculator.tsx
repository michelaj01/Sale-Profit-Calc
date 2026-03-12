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

// Default values for editable preset fees (typical Dubai market rates)
const DEFAULTS = {
  bankProcFee: "10395",
  valuationFee: "3150",
  nocFee: "1050",
  serviceFee: "6000",
} as const;

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

// ─── editable preset row ───────────────────────────────────────────────────

function EditableAutoRow({
  label, sub, value, onChange, isEditing, onEdit, onDone, onReset, isOverridden,
}: {
  label: string;
  sub?: string;
  value: string;
  onChange: (v: string) => void;
  isEditing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onReset?: () => void;
  isOverridden?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    onEdit();
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  if (isEditing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-sm text-foreground">{label}</span>
          {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {onReset && (
            <button type="button" onClick={() => { onReset(); onDone(); }}
              className="text-[11px] text-primary font-semibold px-2 py-1 rounded-md bg-primary/10 active:opacity-70 transition whitespace-nowrap">
              Reset auto
            </button>
          )}
          <div className="relative w-32">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold select-none">AED</span>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={fmtDisplay(value)}
              onChange={e => onChange(stripCommas(e.target.value))}
              onKeyDown={e => e.key === "Enter" && onDone()}
              className="w-full rounded-md border border-primary bg-background pl-10 pr-2 py-1.5 text-sm text-right text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <button type="button" onClick={onDone}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground active:opacity-80 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm text-foreground">{label}</span>
        {sub && !isOverridden && <span className="text-[11px] text-muted-foreground">{sub}</span>}
        {isOverridden && <span className="text-[10px] font-semibold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full">edited</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums text-foreground">
          {aed(parseFloat(value) || 0)}
        </span>
        <button type="button" onClick={startEdit}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground active:opacity-70 transition" title="Edit">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────

export default function Calculator() {
  const [name, setName] = useState("");

  // Acquisition inputs
  const [propertyPrice, setPropertyPrice] = useState("");
  const [bankProcFee, setBankProcFee]     = useState(DEFAULTS.bankProcFee);
  const [valuationFee, setValuationFee]   = useState(DEFAULTS.valuationFee);
  const [nocFee, setNocFee]               = useState(DEFAULTS.nocFee);
  const [serviceFee, setServiceFee]       = useState(DEFAULTS.serviceFee);

  // Advanced pricing (optional)
  const [showAdvanced,   setShowAdvanced]   = useState(false);
  const [mouPrice,       setMouPrice]       = useState("");   // MOU/contract price → DLD fee basis
  const [bankValuation,  setBankValuation]  = useState("");   // Bank valuation → mortgage reg basis
  const [gapPaymentOvr,  setGapPaymentOvr]  = useState<string | null>(null); // null = auto (actual − MOU)

  // Override states for auto-computed fees (null = use formula)
  const [agencyFeeOvr,   setAgencyFeeOvr]   = useState<string | null>(null);
  const [dldFeeOvr,      setDldFeeOvr]      = useState<string | null>(null);
  const [trusteeFeeOvr,  setTrusteeFeeOvr]  = useState<string | null>(null);
  const [mortgageRegOvr, setMortgageRegOvr] = useState<string | null>(null);

  // Editing states for all editable rows
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  // Renovation
  const [renoItems, setRenoItems] = useState<CostItem[]>([newCostItem()]);

  // Sale & mortgage
  const [salePrice, setSalePrice] = useState("");
  const [downPct, setDownPct]     = useState("20");

  const { toast } = useToast();
  const createItem = useCreateItem();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── derived acquisition ────────────────────────────────────────────────
  const propPrice      = n(propertyPrice);
  const mouPriceN      = showAdvanced && mouPrice      ? n(mouPrice)      : propPrice;
  const bankValN       = showAdvanced && bankValuation ? n(bankValuation) : propPrice;
  const gapPaymentCalc = showAdvanced && propPrice > 0 && mouPriceN > 0 ? Math.max(0, propPrice - mouPriceN) : 0;
  const gapPaymentN    = showAdvanced ? (gapPaymentOvr !== null ? n(gapPaymentOvr) : gapPaymentCalc) : 0;

  // Fee basis: agency on actual price, DLD on MOU, mortgage reg on bank val
  const agencyFeeCalc   = propPrice * AGENCY_FEE_PCT * (1 + AGENCY_VAT_PCT);
  const dldFeeCalc      = mouPriceN * DLD_FEE_PCT;
  const trusteeFeeCalc  = propPrice > 0 ? TRUSTEE_FEE_FLAT : 0;
  const downFrac        = Math.min(100, Math.max(0, parseFloat(downPct) || 20)) / 100;
  const loanAmount      = bankValN * (1 - downFrac);
  const mortgageRegCalc = loanAmount * MORTGAGE_REG_PCT;

  // Use override if manually edited, otherwise use formula
  const agencyFee   = agencyFeeOvr   !== null ? n(agencyFeeOvr)   : agencyFeeCalc;
  const dldFee      = dldFeeOvr      !== null ? n(dldFeeOvr)      : dldFeeCalc;
  const trusteeFee  = trusteeFeeOvr  !== null ? n(trusteeFeeOvr)  : trusteeFeeCalc;
  const mortgageReg = mortgageRegOvr !== null ? n(mortgageRegOvr) : mortgageRegCalc;

  const manualAcq   = n(bankProcFee) + n(valuationFee) + n(nocFee) + n(serviceFee);
  // Use MOU price as property base in advanced mode (gap added separately = actual price, no double count)
  const propertyBase = showAdvanced && mouPrice ? mouPriceN : propPrice;
  const acqTotal    = propertyBase + gapPaymentN + agencyFee + dldFee + trusteeFee + mortgageReg + manualAcq;

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
  const downPayment  = propertyBase * downFrac;
  const cashOut      = downPayment + gapPaymentN + agencyFee + dldFee + trusteeFee + mortgageReg + manualAcq + renoTotal;
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
    setMouPrice(""); setBankValuation(""); setGapPaymentOvr(null); setShowAdvanced(false);
    setRenoItems([newCostItem()]); setSalePrice("");
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

          {/* Property price input */}
          <div className="flex items-center gap-2">
            <span className="w-32 shrink-0 text-sm font-medium text-foreground whitespace-nowrap">Actual Price</span>
            <AEDInput value={propertyPrice} onChange={setPropertyPrice} className="flex-1 min-w-0" />
          </div>

          {/* Advanced pricing toggle */}
          <button type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary active:opacity-70 transition self-start">
            <svg className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
            {showAdvanced ? "Hide advanced pricing" : "Different MOU / bank valuation?"}
          </button>

          {/* Advanced pricing fields */}
          {showAdvanced && (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-3">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Advanced Pricing</p>

              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm text-foreground">MOU Price</span>
                  <AEDInput value={mouPrice} onChange={setMouPrice} placeholder="e.g. 4,990,000" className="flex-1 min-w-0" />
                </div>
                <p className="text-[11px] text-muted-foreground pl-34 ml-[8.5rem]">DLD fee (4%) is billed on this</p>
              </div>

              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm text-foreground">Bank Valuation</span>
                  <AEDInput value={bankValuation} onChange={setBankValuation} placeholder="e.g. 4,950,000" className="flex-1 min-w-0" />
                </div>
                <p className="text-[11px] text-muted-foreground ml-[8.5rem]">Mortgage reg (0.25%) uses this</p>
              </div>

              <div className="flex flex-col gap-0.5">
                <EditableAutoRow
                  label="Gap Payment"
                  sub="actual − MOU"
                  value={gapPaymentOvr !== null ? gapPaymentOvr : gapPaymentCalc.toFixed(2)}
                  onChange={v => setGapPaymentOvr(v)}
                  isEditing={!!editing["gapPayment"]}
                  onEdit={() => {
                    setEditing(e => ({ ...e, gapPayment: true }));
                    if (gapPaymentOvr === null) setGapPaymentOvr(gapPaymentCalc.toFixed(2));
                  }}
                  onDone={() => setEditing(e => ({ ...e, gapPayment: false }))}
                  onReset={() => setGapPaymentOvr(null)}
                  isOverridden={gapPaymentOvr !== null}
                />
                <p className="text-[11px] text-muted-foreground ml-[8.5rem]">Extra cash paid above MOU (added to cost)</p>
              </div>
            </div>
          )}

          {/* Auto-computed fees */}
          <div className="flex flex-col gap-2 bg-muted/40 rounded-lg px-3 py-2.5">
            {([
              { key: "agencyFee",   label: "Agency Fee",    sub: showAdvanced ? "2% + 5% VAT (actual)" : "2% + 5% VAT",       val: agencyFee,   ovr: agencyFeeOvr,   setOvr: setAgencyFeeOvr },
              { key: "dldFee",      label: "DLD Fee",       sub: showAdvanced && mouPrice ? "4% of MOU price" : "4%",           val: dldFee,      ovr: dldFeeOvr,      setOvr: setDldFeeOvr },
              { key: "trusteeFee",  label: "Trustee Fee",   sub: "flat",                                                        val: trusteeFee,  ovr: trusteeFeeOvr,  setOvr: setTrusteeFeeOvr },
              { key: "mortgageReg", label: "Mortgage Reg.", sub: showAdvanced && bankValuation ? "0.25% of bank val. loan" : "0.25% of loan", val: mortgageReg, ovr: mortgageRegOvr, setOvr: setMortgageRegOvr },
            ] as const).map(({ key, label, sub, val, ovr, setOvr }) => (
              <EditableAutoRow
                key={key}
                label={label}
                sub={sub}
                value={ovr !== null ? ovr : val.toFixed(2)}
                onChange={v => setOvr(v)}
                isEditing={!!editing[key]}
                onEdit={() => {
                  setEditing(e => ({ ...e, [key]: true }));
                  if (ovr === null) setOvr(val.toFixed(2));
                }}
                onDone={() => setEditing(e => ({ ...e, [key]: false }))}
                onReset={() => setOvr(null)}
                isOverridden={ovr !== null}
              />
            ))}

            <div className="h-px bg-border" />

            {/* Editable preset fees */}
            {([
              { key: "bankProc",   label: "Bank Processing", value: bankProcFee,  set: setBankProcFee },
              { key: "valuation",  label: "Valuation Fee",   value: valuationFee, set: setValuationFee },
              { key: "noc",        label: "NOC Fee",          value: nocFee,       set: setNocFee },
              { key: "serviceFee", label: "Service Fee Prov.",value: serviceFee,   set: setServiceFee },
            ] as const).map(({ key, label, value, set }) => (
              <EditableAutoRow
                key={key}
                label={label}
                value={value}
                onChange={set}
                isEditing={!!editing[key]}
                onEdit={() => setEditing(e => ({ ...e, [key]: true }))}
                onDone={() => setEditing(e => ({ ...e, [key]: false }))}
              />
            ))}

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
        <div className={`rounded-xl border p-4 shadow-sm flex flex-col gap-4 ${profitable ? "bg-card border-card-border" : "bg-destructive/5 border-destructive/30"}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Results</p>

          {/* Profit headline */}
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Your Profit</p>
              <p className={`text-3xl font-bold tabular-nums ${profitable ? "text-primary" : "text-destructive"}`}>
                {profitable
                  ? aed(profit)
                  : `−AED ${Math.abs(profit).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-0.5">Sale Price</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">{aed(sale)}</p>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Return on total investment */}
          <div className={`rounded-xl p-3.5 ${profitable ? "bg-primary/8" : "bg-destructive/8"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">Total Investment Return</p>
                <p className="text-xs text-muted-foreground mt-0.5">Profit ÷ everything you spent</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total cost: <span className="font-medium text-foreground tabular-nums">{aed(totalCost)}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">(property + all fees + renovation)</p>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className={`text-lg font-bold tabular-nums ${profitable ? "text-primary" : "text-destructive"}`}>
                  {profitable ? aed(profit) : `−AED ${Math.abs(profit).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`}
                </span>
                <span className={`text-sm font-semibold tabular-nums ${profitable ? "text-primary" : "text-destructive"}`}>
                  {pct(roi)}
                </span>
              </div>
            </div>
          </div>

          {/* Return on cash out of pocket */}
          <div className={`rounded-xl p-3.5 ${profitable ? "bg-blue-50 dark:bg-blue-950/30" : "bg-destructive/8"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">Cash-on-Cash Return</p>
                <p className="text-xs text-muted-foreground mt-0.5">Profit ÷ your actual cash out of pocket</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cash invested: <span className="font-medium text-foreground tabular-nums">{aed(cashOut)}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">(down payment + fees + renovation)</p>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className={`text-lg font-bold tabular-nums ${profitable ? "text-blue-600 dark:text-blue-400" : "text-destructive"}`}>
                  {profitable ? aed(profit) : `−AED ${Math.abs(profit).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`}
                </span>
                <span className={`text-sm font-semibold tabular-nums ${profitable ? "text-blue-600 dark:text-blue-400" : "text-destructive"}`}>
                  {pct(mortgageRoiPct)}
                </span>
              </div>
            </div>
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

              // When this tier is active, show the user's real profit, not the fixed threshold
              const displayProfit    = isActive ? profit    : tierProfit;
              const displayProfitPct = isActive ? profitPct : tierProfitPct;
              const displayPositive  = displayProfit > 0;

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
                    <span className="text-xs text-muted-foreground">
                      {isActive
                        ? `Selling at ${aed(sale)}`
                        : `Sell at ${aed(tierPrice)}`}
                    </span>
                    {/* Show the tier threshold as a note when active */}
                    {isActive && tier.targetProfit > 0 && (
                      <span className={`text-[11px] ${tier.color} opacity-70`}>
                        {tier.label === "Ambitious" ? "800K+ target" : `${tier.targetProfit >= 1_000_000 ? (tier.targetProfit / 1_000_000).toFixed(1) + "M" : (tier.targetProfit / 1_000) + "K"}+ target`}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`text-sm font-bold tabular-nums ${displayPositive ? tier.color : "text-muted-foreground"}`}>
                      {displayPositive
                        ? `+AED ${displayProfit.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`
                        : displayProfit === 0 ? "AED 0" : `−AED ${Math.abs(displayProfit).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`}
                    </span>
                    <span className={`text-xs font-semibold tabular-nums ${displayPositive ? tier.color : "text-muted-foreground"}`}>
                      {displayPositive ? `+${pct(displayProfitPct)}` : `${pct(displayProfitPct)}`}
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

      {/* ── Cash Out of Pocket ── */}
      {hasCosts && (
        <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm flex flex-col gap-4">

          {/* Header + down payment % */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your Cash Out of Pocket</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Every dirham you actually spend</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Down</span>
              <input type="number" inputMode="decimal" value={downPct} onChange={e => setDownPct(e.target.value)}
                min={1} max={100}
                className="w-14 rounded-lg border border-input bg-background px-2 py-1 text-sm text-center text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>

          {/* Bank portion note */}
          {propPrice > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Bank finances (mortgage)</span>
              <span className="font-semibold text-foreground tabular-nums">{aed(loanAmount)}</span>
            </div>
          )}

          {/* Itemized breakdown */}
          <div className="flex flex-col gap-0">

            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Your share — item by item</p>

            {/* Down payment */}
            <div className="flex justify-between items-center py-2 border-b border-border/60">
              <div>
                <p className="text-sm text-foreground font-medium">Down Payment</p>
                <p className="text-[11px] text-muted-foreground">
                  {Math.round(downFrac * 100)}% of {showAdvanced && mouPrice ? "MOU price" : "property price"}
                </p>
              </div>
              <span className="text-sm font-semibold text-foreground tabular-nums">{aed(downPayment)}</span>
            </div>

            {/* Gap payment (advanced mode only) */}
            {gapPaymentN > 0 && (
              <div className="flex justify-between items-center py-2 border-b border-border/60">
                <div>
                  <p className="text-sm text-foreground font-medium">Gap Payment</p>
                  <p className="text-[11px] text-muted-foreground">extra cash to seller (actual − MOU)</p>
                </div>
                <span className="text-sm font-semibold text-foreground tabular-nums">{aed(gapPaymentN)}</span>
              </div>
            )}

            {/* Acquisition fees */}
            {[
              { label: "Agency Fee",     sub: "2% + 5% VAT",      val: agencyFee,   show: propPrice > 0 },
              { label: "DLD Fee",        sub: "4% of price",       val: dldFee,      show: propPrice > 0 },
              { label: "Trustee Fee",    sub: "flat DLD fee",      val: trusteeFee,  show: propPrice > 0 },
              { label: "Mortgage Reg.", sub: "0.25% of loan",     val: mortgageReg, show: propPrice > 0 },
              { label: "Bank Processing",sub: "bank charge",       val: n(bankProcFee),  show: n(bankProcFee) > 0 },
              { label: "Valuation Fee",  sub: "bank valuation",    val: n(valuationFee), show: n(valuationFee) > 0 },
              { label: "NOC Fee",        sub: "developer fee",     val: n(nocFee),       show: n(nocFee) > 0 },
              { label: "Service Fee Prov.", sub: "maintenance est.", val: n(serviceFee), show: n(serviceFee) > 0 },
            ].filter(r => r.show).map(({ label, sub, val }) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-border/60">
                <div>
                  <p className="text-sm text-foreground">{label}</p>
                  <p className="text-[11px] text-muted-foreground">{sub}</p>
                </div>
                <span className="text-sm font-medium text-foreground tabular-nums">{aed(val)}</span>
              </div>
            ))}

            {/* Renovation items */}
            {renoItems.filter(i => n(i.amount) > 0).map(item => (
              <div key={item.id} className="flex justify-between items-center py-2 border-b border-border/60">
                <div>
                  <p className="text-sm text-foreground">{item.label || "Renovation item"}</p>
                  <p className="text-[11px] text-muted-foreground">renovation cost</p>
                </div>
                <span className="text-sm font-medium text-foreground tabular-nums">{aed(n(item.amount))}</span>
              </div>
            ))}

            {/* Total */}
            <div className="flex justify-between items-center pt-3 mt-1">
              <div>
                <p className="text-base font-bold text-foreground">Total Out of Pocket</p>
                <p className="text-[11px] text-muted-foreground">What you actually spend</p>
              </div>
              <span className="text-base font-bold text-foreground tabular-nums">{aed(cashOut)}</span>
            </div>
          </div>

          {/* Result */}
          {hasBoth && cashOut > 0 ? (
            <div className={`rounded-xl p-4 flex flex-col gap-3 ${profitable ? "bg-primary/8" : "bg-destructive/8"}`}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Return on Your Cash</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Profit</p>
                  <p className={`text-2xl font-bold tabular-nums mt-0.5 ${profitable ? "text-primary" : "text-destructive"}`}>
                    {aedSigned(profit)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">ROI on cash invested</p>
                  <p className={`text-2xl font-bold tabular-nums mt-0.5 ${profitable ? "text-primary" : "text-destructive"}`}>
                    {(mortgageRoiPct > 0 ? "+" : "") + pct(mortgageRoiPct)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 pt-2 mt-1">
                <span>Cash invested: <span className="font-semibold text-foreground tabular-nums">{aed(cashOut)}</span></span>
                <span>Sale: <span className="font-semibold text-foreground tabular-nums">{aed(sale)}</span></span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center">Enter a sale price above to see your return on cash</p>
          )}
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
