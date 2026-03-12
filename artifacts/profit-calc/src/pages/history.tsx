import { useState } from "react";
import { useListItems, useDeleteItem } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function fmt(val: number) {
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function History() {
  const { data: items = [], isLoading, refetch } = useListItems();
  const deleteItem = useDeleteItem();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const totalProfit = items.reduce((sum, i) => sum + i.profit, 0);
  const avgMargin = items.length > 0
    ? items.reduce((sum, i) => sum + i.profitMargin, 0) / items.length
    : 0;

  async function handleDelete(id: number) {
    setDeletingId(id);
    await deleteItem.mutateAsync({ id });
    await refetch();
    setDeletingId(null);
    toast({ title: "Item removed" });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-md mx-auto pb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">History</h1>
        <p className="text-sm text-muted-foreground">Your saved items</p>
      </div>

      {/* Summary stats */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-card-border rounded-xl p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-foreground">{items.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Items</p>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-3 text-center shadow-sm">
            <p className={`text-xl font-bold ${totalProfit >= 0 ? "text-primary" : "text-destructive"}`}>
              ${fmt(totalProfit)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Profit</p>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-3 text-center shadow-sm">
            <p className={`text-xl font-bold ${avgMargin >= 0 ? "text-primary" : "text-destructive"}`}>
              {fmt(avgMargin)}%
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Avg Margin</p>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-muted-foreground text-sm">No items saved yet.<br />Use the Calculator to add items.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...items].reverse().map((item) => (
            <div key={item.id} className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{item.name}</p>
                  {item.notes && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{item.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition disabled:opacity-40"
                  aria-label="Delete item"
                >
                  {deletingId === item.id ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cost</span>
                  <span className="font-medium">${fmt(item.acquisitionCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sale</span>
                  <span className="font-medium">${fmt(item.salePrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profit</span>
                  <span className={`font-semibold ${item.profit >= 0 ? "text-primary" : "text-destructive"}`}>
                    {item.profit >= 0 ? "+" : ""}${fmt(item.profit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Margin</span>
                  <span className={`font-semibold ${item.profitMargin >= 0 ? "text-primary" : "text-destructive"}`}>
                    {fmt(item.profitMargin)}%
                  </span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground">ROI</span>
                  <span className={`font-semibold ${item.roi >= 0 ? "text-primary" : "text-destructive"}`}>
                    {fmt(item.roi)}%
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
