import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, X, Sparkles, Receipt } from "lucide-react";

interface LicensePayment {
  ref: string;
  kind: "payment_intent" | "invoice";
  amount: number;
  currency: string;
  paid_at: string | null;
  description: string | null;
  receipt_url: string | null;
  invoice_pdf: string | null;
}

interface Suggestion {
  payment_intent_id: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  product_label: string | null;
}

interface Props {
  clientId: string;
  hasStripeCustomer: boolean;
  onChange?: () => void;
}

export function LicenseFeePaymentsEditor({ clientId, hasStripeCustomer, onChange }: Props) {
  const [refs, setRefs] = useState<string[]>([]);
  const [payments, setPayments] = useState<LicensePayment[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const reloadRefs = useCallback(async () => {
    const { data } = await supabase
      .from("clients")
      .select("license_fee_payment_ref")
      .eq("id", clientId)
      .maybeSingle();
    setRefs(((data as any)?.license_fee_payment_ref as string[]) ?? []);
  }, [clientId]);

  const reloadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("license-payments-admin", {
        body: { action: "list", client_id: clientId },
      });
      if (error) throw error;
      if (data?.ok) setPayments(data.payments ?? []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { reloadRefs(); reloadPayments(); }, [reloadRefs, reloadPayments]);

  const syncCache = async () => {
    try {
      const { error } = await supabase.functions.invoke("reconcile-client-stripe", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      toast.success("Billing cache synced", { duration: 1800 });
    } catch (e: any) {
      console.error("[license-editor] sync failed", e);
      toast.error("Saved, but cache sync failed — try Sync now on the client's billing tab", { duration: 4000 });
    }
  };

  const saveRefs = async (next: string[]) => {
    const { error } = await supabase
      .from("clients")
      .update({ license_fee_payment_ref: next } as any)
      .eq("id", clientId);
    if (error) { toast.error("Failed to save"); return; }
    setRefs(next);
    await reloadPayments();
    // Fire-and-await: refresh the cached license totals on client_subscriptions
    // so the client-facing Billing tab reflects the change immediately.
    await syncCache();
    onChange?.();
  };

  const addRef = async (value: string) => {
    const v = value.trim();
    if (!v) return;
    if (!/^(pi|in)_[A-Za-z0-9]+$/.test(v)) {
      toast.error("Expected pi_… or in_… id");
      return;
    }
    if (refs.includes(v)) { toast.info("Already linked"); return; }
    await saveRefs([...refs, v]);
    setInput("");
    toast.success("Payment linked");
  };

  const removeRef = async (ref: string) => {
    await saveRefs(refs.filter((r) => r !== ref));
  };

  const autoDetect = async () => {
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("license-payments-admin", {
        body: { action: "suggest", client_id: clientId },
      });
      if (error) throw error;
      if (data?.ok === false) { toast.info(data.message || "No suggestions"); return; }
      const list = (data?.suggestions ?? []) as Suggestion[];
      setSuggestions(list);
      if (list.length === 0) toast.info("No matching license payments found on Stripe");
    } catch (e: any) {
      toast.error(e?.message || "Auto-detect failed");
    } finally {
      setSuggesting(false);
    }
  };

  const fmt = (amt: number, cur: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(amt);

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const currency = payments[0]?.currency ?? "USD";

  return (
    <div className="space-y-2 pt-3 mt-3 border-t border-border">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Receipt className="w-3 h-3" /> License Fee Payments
        </p>
        {payments.length > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {fmt(totalPaid, currency)} · {payments.length}
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Paste Stripe Payment Intent (pi_…) or Invoice (in_…) IDs for this client's license / setup fee. Credit top-ups and subscription invoices are auto-excluded.
      </p>

      <div className="flex gap-2">
        <Input
          placeholder="pi_... or in_..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRef(input); } }}
          className="font-mono text-xs"
        />
        <Button size="sm" variant="outline" onClick={() => addRef(input)} disabled={!input.trim()}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="w-full h-7 text-[11px]"
        onClick={autoDetect}
        disabled={suggesting || !hasStripeCustomer}
      >
        {suggesting ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1.5" />}
        Auto-detect from Stripe
      </Button>

      {suggestions.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggestions</p>
          {suggestions.map((s) => (
            <div key={s.payment_intent_id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate">
                <span className="font-medium">{fmt(s.amount, s.currency)}</span>
                <span className="text-muted-foreground"> · {s.product_label || "License"}{s.paid_at ? ` · ${new Date(s.paid_at).toLocaleDateString()}` : ""}</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                onClick={() => { addRef(s.payment_intent_id); setSuggestions((cur) => cur.filter((x) => x.payment_intent_id !== s.payment_intent_id)); }}
              >
                Link
              </Button>
            </div>
          ))}
        </div>
      )}

      {loading && <p className="text-[11px] text-muted-foreground">Loading payments…</p>}

      {payments.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {payments.map((p) => (
            <div key={p.ref} className="flex items-center justify-between gap-2 text-[11px] rounded border border-border bg-background/50 p-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{fmt(p.amount, p.currency)}</span>
                  <span className="text-muted-foreground">
                    {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground truncate">{p.ref}</div>
                {(p.invoice_pdf || p.receipt_url) && (
                  <a
                    href={p.invoice_pdf || p.receipt_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary hover:underline"
                  >
                    Open receipt
                  </a>
                )}
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeRef(p.ref)} title="Remove">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {refs.length > 0 && payments.length === 0 && !loading && (
        <p className="text-[11px] text-destructive">
          Linked refs could not be fetched from Stripe. Check the IDs are correct and not credit top-ups.
        </p>
      )}
    </div>
  );
}
