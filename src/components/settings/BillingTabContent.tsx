import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AiUsageSection } from "./AiUsageSection";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { AlertCircle, FileText, ShoppingCart, RefreshCw, Database, Cloud, Eye } from "lucide-react";
import { useAdminImpersonation } from "@/contexts/AdminImpersonationContext";

interface LicensePayment {
  ref: string;
  kind: "payment_intent" | "invoice";
  amount: number;
  currency: string;
  paid_at: string | null;
  description: string | null;
  receipt_url: string | null;
  invoice_pdf: string | null;
  status: string | null;
}

interface BillingData {
  subscribed: boolean;
  status: string;
  scheduled_start_at?: string | null;
  product_id: string | null;
  plan_name: string | null;
  subscription_end: string | null;
  trial_end: string | null;
  has_license_fee: boolean;
  payment_method: { brand: string; last4: string; exp_month: number; exp_year: number } | null;
  invoices: { id: string; amount: number; status: string; date: string; pdf: string | null }[];
  license_payments?: LicensePayment[];
  license_total_paid?: number;
  license_currency?: string | null;
  license_last_paid_at?: string | null;
  _source?: "db_cache" | "stripe_live";
  _synced_at?: string;
}

interface PlanRow {
  name: string;
  price_monthly: number;
  include_license: boolean;
}

const CAD_ADDONS: Array<{
  name: string;
  desc: string;
  price: number;
  priceId: string;
  kind: "cad_tweak" | "new_cad" | "cad_render";
}> = [
  { name: "CAD Tweak", desc: "Minor modifications to existing CAD", price: 39, priceId: "price_1TI8rHELyIQnr0qGFputHmUE", kind: "cad_tweak" },
  { name: "New CAD Request", desc: "Brand new CAD design from scratch", price: 49, priceId: "price_1TI8rgELyIQnr0qGwkKGJfIi", kind: "new_cad" },
  { name: "CAD + Render", desc: "Full CAD design with photorealistic render", price: 99, priceId: "price_1TI8s4ELyIQnr0qGUVbRSlow", kind: "cad_render" },
];

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  trialing: { label: "Free Trial", variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "secondary" },
  canceled: { label: "Canceled", variant: "destructive" },
  past_due: { label: "Past Due", variant: "destructive" },
  error: { label: "Sync Error", variant: "destructive" },
  none: { label: "Not Subscribed", variant: "outline" },
};

export function BillingTabContent() {
  const { session, user } = useAuth();
  const { isImpersonating, impersonatedClientId, impersonatedClientName } = useAdminImpersonation();
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [plans, setPlans] = useState<Record<string, PlanRow>>({});
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [addonLoading, setAddonLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [addonBalances, setAddonBalances] = useState<Record<string, number>>({
    cad_tweak: 0, new_cad: 0, cad_render: 0,
  });
  const [impersonatedClientEmail, setImpersonatedClientEmail] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Load impersonated client's email for accurate empty-state messaging
  useEffect(() => {
    if (!isImpersonating || !impersonatedClientId) {
      setImpersonatedClientEmail(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("email")
        .eq("id", impersonatedClientId)
        .maybeSingle();
      setImpersonatedClientEmail((data?.email as string | null) ?? null);
    })();
  }, [isImpersonating, impersonatedClientId]);

  const fetchBilling = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: isImpersonating && impersonatedClientId
          ? { impersonate_client_id: impersonatedClientId }
          : {},
      });
      if (error) throw error;
      setBilling(data as BillingData);
      setBillingError(null);
    } catch (err) {
      console.error("Failed to fetch billing:", err);
      setBillingError("Billing sync failed. Please retry in a moment.");
      toast.error("Could not load billing information");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, isImpersonating, impersonatedClientId]);

  // Fetch plans from DB once
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("name, price_monthly, include_license");
      if (data) {
        const map: Record<string, PlanRow> = {};
        for (const p of data) {
          map[p.name] = {
            name: p.name,
            price_monthly: Number(p.price_monthly),
            include_license: !!p.include_license,
          };
        }
        setPlans(map);
      }
    })();
  }, []);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  // Fetch remaining (unconsumed) CAD add-on balances by kind
  const fetchAddonBalances = useCallback(async () => {
    if (!user?.id) return;
    try {
      let clientId: string | null = null;
      if (isImpersonating && impersonatedClientId) {
        clientId = impersonatedClientId;
      } else {
        const { data: clientRow } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        clientId = clientRow?.id ?? null;
      }
      if (!clientId) return;
      const { data, error } = await (supabase as any)
        .from("client_cad_addons")
        .select("addon_kind")
        .eq("client_id", clientId)
        .is("consumed_at", null);
      if (error) throw error;
      const counts: Record<string, number> = { cad_tweak: 0, new_cad: 0, cad_render: 0 };
      for (const row of (data ?? []) as Array<{ addon_kind: string }>) {
        if (row.addon_kind in counts) counts[row.addon_kind]++;
      }
      setAddonBalances(counts);
    } catch (err) {
      console.warn("Failed to load CAD addon balances", err);
    }
  }, [user?.id, isImpersonating, impersonatedClientId]);

  useEffect(() => {
    fetchAddonBalances();
  }, [fetchAddonBalances]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchBilling();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchBilling]);

  // Poll while status === 'none' — handles fresh signup webhook latency
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (billing?.status === "none" && !isImpersonating) {
      let attempts = 0;
      pollRef.current = window.setInterval(() => {
        attempts++;
        if (attempts > 6) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          return;
        }
        fetchBilling();
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [billing?.status, fetchBilling, isImpersonating]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchBilling();
    setRefreshing(false);
  };

  const openPortal = async () => {
    if (!session?.access_token) return;
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) {
        if (error instanceof Object && 'context' in error) {
          try {
            const body = await (error as any).context?.json?.();
            if (body?.error === "no_customer") {
              toast.error("No billing history yet. Subscribe first to access invoices.");
              return;
            }
            if (body?.error === "stripe_key_missing_customer_portal_permission") {
              toast.error("Billing portal is unavailable until billing permissions are updated.");
              return;
            }
          } catch {}
        }
        throw error;
      }
      if (data?.error === "no_customer") {
        toast.error("No billing history yet. Subscribe first to access invoices.");
        return;
      }
      if (data?.error === "stripe_key_missing_customer_portal_permission") {
        toast.error("Billing portal is unavailable until billing permissions are updated.");
        return;
      }
      if (data?.url) window.open(data.url, "_blank");
    } catch (err) {
      console.error("Failed to open portal:", err);
      toast.error("Could not open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!session?.access_token) return;
    setCheckoutLoading(true);
    try {
      const planName = billing?.plan_name || "Custom X";
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { plan_name: planName },
      });
      if (error) {
        // The function returns a JSON { error } body with a non-2xx status; the SDK
        // wraps it as FunctionsHttpError. Surface that message instead of a generic one
        // so a blocked resubscribe (trial guard, Stripe rejection) is diagnosable.
        let serverMsg: string | null = null;
        if (error instanceof Object && 'context' in error) {
          try {
            const body = await (error as any).context?.json?.();
            if (typeof body?.error === "string" && body.error.trim()) serverMsg = body.error;
          } catch {}
        }
        throw new Error(serverMsg ?? (error as Error)?.message ?? "Checkout failed");
      }
      if (data?.url) {
        window.open(data.url, "_blank");
        if (data?.kind === "invoice") {
          toast.info("Your renewal invoice is open in a new tab. Pay it to reactivate your subscription.");
        }
        return;
      }
      throw new Error(data?.error || "No checkout URL returned");
    } catch (err) {
      console.error("Failed to create checkout:", err);
      const msg = err instanceof Error && err.message ? err.message : "";
      toast.error(msg ? `Could not start checkout: ${msg}` : "Could not start checkout. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card><CardContent className="p-6 space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /><Skeleton className="h-9 w-24" /></CardContent></Card>
          <Card><CardContent className="p-6 space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /></CardContent></Card>
        </div>
        <Card><CardContent className="p-6 space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-10 w-32" /><Skeleton className="h-4 w-full" /></CardContent></Card>
      </div>
    );
  }

  const status = billingError ? "error" : billing?.status || "none";
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.none;
  const isSubscribed = billing?.subscribed && (status === "active" || status === "trialing" || status === "scheduled");
  const planName = billing?.plan_name || null;
  const planInfo = planName ? plans[planName] : null;
  const licensePayments = billing?.license_payments ?? [];
  const hasLicensePayments = licensePayments.length > 0;
  const licenseTotal = billing?.license_total_paid ?? 0;
  const licenseCurrency = billing?.license_currency ?? "USD";
  const licenseLastPaidAt = billing?.license_last_paid_at ?? null;
  const showLicenseCard =
    hasLicensePayments || (planInfo?.include_license ?? billing?.has_license_fee ?? false);
  const licenseAmountLabel = hasLicensePayments
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: licenseCurrency, maximumFractionDigits: 0 }).format(licenseTotal)
    : "—";
  const userEmail = (isImpersonating)
    ? (impersonatedClientEmail || impersonatedClientName || "this client")
    : (user?.email || "your account");
  const actionsDisabled = isImpersonating;

  const source = billing?._source;
  const syncedAt = billing?._synced_at ? new Date(billing._synced_at) : null;
  const formatRelative = (d: Date) => {
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {isImpersonating && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <Eye className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground">
            Viewing as {impersonatedClientName || "client"}
          </span>
          <span className="text-muted-foreground">&middot; Actions disabled in impersonation mode</span>
        </div>
      )}

      {/* Billing Sync Status */}
      {source && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          {source === "db_cache" ? (
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Cloud className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="font-medium text-foreground">
            {source === "db_cache" ? "Cached" : "Live from Stripe"}
          </span>
          {syncedAt && (
            <span className="text-muted-foreground">
              &middot; Last synced {formatRelative(syncedAt)}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="ml-auto h-6 px-2 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      )}

      {/* Top Section — Two side-by-side cards */}
      <div className={`grid grid-cols-1 ${showLicenseCard ? 'md:grid-cols-2' : ''} gap-4`}>
        {/* Left: Current Subscription */}
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                Current Subscription
                <InfoTooltip text="Your monthly platform subscription status" />
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="h-7 px-2"
                title="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-foreground">{planName || "—"}</h2>
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              {isSubscribed && planName && !planInfo && (
                <Badge variant="outline" className="text-[10px]">Custom plan</Badge>
              )}
            </div>
            {isSubscribed && billing?.subscription_end && status === "active" && (
              <p className="text-sm text-muted-foreground">
                Renews {new Date(billing.subscription_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
            {isSubscribed && billing?.trial_end && status === "trialing" && (
              <p className="text-sm text-muted-foreground">
                Trial ends {new Date(billing.trial_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
            {status === "scheduled" && billing?.scheduled_start_at && (
              <p className="text-sm text-muted-foreground">
                Plan starts {new Date(billing.scheduled_start_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
            {!isSubscribed && status !== "none" && (
              <p className="text-sm text-muted-foreground">No active subscription</p>
            )}
            {isSubscribed && !actionsDisabled && (
              <Button variant="outline" size="sm" onClick={openPortal} disabled={portalLoading}>
                {portalLoading ? "Opening…" : "Manage"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Right: License Fee — dynamic from admin-linked Stripe payments */}
        {showLicenseCard && (
          <Card>
            <CardContent className="p-6 space-y-3">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                License Fee
                <InfoTooltip text="One-time license / setup fee paid on Stripe. Amount reflects what was actually charged." />
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-semibold text-foreground">{licenseAmountLabel}</h2>
                <Badge variant={hasLicensePayments || billing?.has_license_fee ? "default" : "outline"}>
                  {hasLicensePayments || billing?.has_license_fee ? "Paid" : "Unpaid"}
                </Badge>
                {licensePayments.length > 1 && (
                  <Badge variant="outline" className="text-[10px]">{licensePayments.length} payments</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {hasLicensePayments && licenseLastPaidAt
                  ? `Last paid ${new Date(licenseLastPaidAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                  : "One-time platform license fee"}
              </p>
              {licensePayments.length > 0 && (
                <div className="pt-2 mt-1 border-t border-border space-y-1.5">
                  {licensePayments.map((p) => (
                    <div key={p.ref} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                        {p.description ? ` · ${p.description}` : ""}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.amount)}
                        </span>
                        {(p.invoice_pdf || p.receipt_url) && (
                          <a
                            href={p.invoice_pdf || p.receipt_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Receipt
                          </a>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {billingError && (
        <Card className="border-destructive/40">
          <CardContent className="p-6 sm:p-8 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Billing sync failed</h3>
                <p className="text-sm text-muted-foreground mt-1">{billingError}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleManualRefresh} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Retry sync
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Honest fallback when no subscription found */}
      {!billingError && status === "none" && (
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">No subscription found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                We couldn't find an active subscription tied to <strong>{userEmail}</strong>.
                If you paid with a different email address, please contact support so we can link your account.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleManualRefresh} disabled={refreshing}>
                <RefreshCw className={`h-3.5 w-3.5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resubscribe card — only for canceled/past_due (a known plan_name exists) */}
      {!isSubscribed && status !== "none" && status !== "error" && planName && planInfo && (
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{planName}</h3>
              <p className="text-sm text-muted-foreground mt-1">Reactivate your subscription to continue using the platform</p>
            </div>

            <div>
              <p className="text-3xl font-bold text-foreground">
                ${planInfo.price_monthly}
                <span className="text-base font-normal text-muted-foreground"> / month</span>
              </p>
              {planInfo.include_license && (
                <p className="text-sm text-muted-foreground mt-1">+ $4,999 one-time license fee</p>
              )}
            </div>

            <Button onClick={handleSubscribe} disabled={checkoutLoading || actionsDisabled} title={actionsDisabled ? "Disabled during impersonation" : undefined}>
              {checkoutLoading ? "Redirecting…" : "Resubscribe"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* CAD Add-ons */}
      {isSubscribed && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              CAD Add-ons
            </h3>
            <p className="text-sm text-muted-foreground mb-4">Purchase additional CAD services for your projects</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {CAD_ADDONS.map((addon) => {
                const remaining = addonBalances[addon.kind] ?? 0;
                return (
                <Card key={addon.name}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-sm text-foreground">{addon.name}</h4>
                      <Badge variant={remaining > 0 ? "default" : "outline"} className="text-[10px]">
                        {remaining} left
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{addon.desc}</p>
                    <p className="text-lg font-bold text-foreground">${addon.price}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={addonLoading === addon.priceId || actionsDisabled}
                      title={actionsDisabled ? "Disabled during impersonation" : undefined}
                      onClick={async () => {
                        if (!session?.access_token) return;
                        setAddonLoading(addon.priceId);
                        try {
                          const { data, error } = await supabase.functions.invoke("purchase-cad-addon", {
                            headers: { Authorization: `Bearer ${session.access_token}` },
                            body: { price_id: addon.priceId },
                          });
                          if (error) throw error;
                          if (data?.url) window.open(data.url, "_blank");
                        } catch (err) {
                          console.error("Failed to purchase addon:", err);
                          toast.error("Could not start checkout. Please try again.");
                        } finally {
                          setAddonLoading(null);
                        }
                      }}
                    >
                      {addonLoading === addon.priceId ? "Redirecting…" : "Buy"}
                    </Button>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Billing & Invoices */}
      <div className="px-1">
        <Separator className="mb-6" />
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">Billing & Invoices</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              View invoices, update payment method, and manage billing details
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={openPortal} disabled={portalLoading || billing?.status === 'none' || actionsDisabled} title={actionsDisabled ? "Disabled during impersonation" : undefined}>
            {portalLoading ? "Opening…" : "View Invoices"}
          </Button>
        </div>
        {!!billing?.invoices?.length && (
          <div className="mt-4 space-y-2">
            {billing.invoices.map((invoice) => (
              <div key={invoice.id} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">${invoice.amount.toFixed(2)} · {invoice.status}</p>
                    <p className="text-xs text-muted-foreground">{new Date(invoice.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                </div>
                {invoice.pdf && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={invoice.pdf} target="_blank" rel="noreferrer">Open PDF</a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {billing?.status === 'none' && (
          <p className="text-xs text-muted-foreground mt-2">Subscribe to access invoices and payment history.</p>
        )}
      </div>

      {/* AI Credits & Usage Section */}
      <AiUsageSection />
    </div>
  );
}
