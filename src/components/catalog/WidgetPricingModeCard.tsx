import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save, DollarSign, Lock, Sparkles, AlertTriangle, RefreshCw, CheckCircle2, UserPlus } from 'lucide-react';
import { getCurrencySymbol } from '@/lib/pricing-utils';
import type { WidgetPricingMode } from '@/lib/widget-pricing-mode';

interface WidgetPricingModeCardProps {
  clientId: string;
  currency?: string;
}

type PushStatus = 'idle' | 'pushing' | 'success' | 'failed';

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAYS_MS = [1500, 3500, 7000];

export const WidgetPricingModeCard = ({ clientId, currency = 'USD' }: WidgetPricingModeCardProps) => {
  const [pricingMode, setPricingMode] = useState<WidgetPricingMode>('estimates');
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Push status tracking
  const [pushStatus, setPushStatus] = useState<PushStatus>('idle');
  const [pushAttempt, setPushAttempt] = useState<number>(0);
  const [pushError, setPushError] = useState<string | null>(null);
  const [shopifyConnected, setShopifyConnected] = useState<boolean>(false);
  const [hasPushedDeposit, setHasPushedDeposit] = useState<boolean>(false);

  // Track original values for change detection
  const [originalMode, setOriginalMode] = useState<string>('estimates');
  const [originalDeposit, setOriginalDeposit] = useState<number>(0);

  useEffect(() => {
    if (!clientId) return;
    loadPreferences();
  }, [clientId]);

  const loadPreferences = async () => {
    const [{ data: prefs }, { data: clientRow }] = await Promise.all([
      supabase
        .from('client_onboarding_preferences')
        .select('widget_pricing_mode, widget_deposit_amount, widget_shopify_product_id, widget_shopify_variant_id')
        .eq('client_id', clientId)
        .maybeSingle(),
      supabase.from('clients').select('shopify_store_url').eq('id', clientId).maybeSingle(),
    ]);

    if (prefs) {
      const mode = (prefs.widget_pricing_mode as WidgetPricingMode) || 'estimates';
      const deposit = Number(prefs.widget_deposit_amount) || 0;
      setPricingMode(mode);
      setDepositAmount(deposit);
      setOriginalMode(mode);
      setOriginalDeposit(deposit);
      setHasPushedDeposit(!!(prefs as any).widget_shopify_variant_id);
    }
    setShopifyConnected(!!clientRow?.shopify_store_url);
    setLoaded(true);
  };

  const handleModeChange = (value: string) => {
    const mode = value as WidgetPricingMode;
    setPricingMode(mode);
    setHasUnsavedChanges(mode !== originalMode || depositAmount !== originalDeposit);
  };

  const handleDepositChange = (value: string) => {
    const num = parseFloat(value) || 0;
    setDepositAmount(num);
    setHasUnsavedChanges(pricingMode !== originalMode || num !== originalDeposit);
  };

  const pushDepositWithRetry = async (amount: number): Promise<boolean> => {
    setPushStatus('pushing');
    setPushError(null);

    for (let attempt = 1; attempt <= MAX_AUTO_RETRIES; attempt++) {
      setPushAttempt(attempt);
      try {
        const { data: pushData, error: pushErr } = await supabase.functions.invoke(
          'shopify-push-widget-deposit',
          { body: { clientId, depositAmount: amount } }
        );

        if (!pushErr && !pushData?.error && pushData?.success) {
          setPushStatus('success');
          setHasPushedDeposit(true);
          setPushError(null);
          toast.success(
            `Deposit pushed to Shopify (${getCurrencySymbol(currency)}${amount.toLocaleString()})`
          );
          return true;
        }

        const message = pushData?.error || pushErr?.message || 'Unknown error';
        console.warn(`Push attempt ${attempt}/${MAX_AUTO_RETRIES} failed:`, message);
        setPushError(message);

        if (attempt < MAX_AUTO_RETRIES) {
          toast.message(`Push failed (attempt ${attempt}/${MAX_AUTO_RETRIES}). Retrying…`);
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
        }
      } catch (err: any) {
        console.error(`Push attempt ${attempt} threw:`, err);
        setPushError(err?.message || 'Network error');
        if (attempt < MAX_AUTO_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
        }
      }
    }

    setPushStatus('failed');
    toast.error(
      `Failed to push deposit after ${MAX_AUTO_RETRIES} attempts. Use the Retry button.`
    );
    return false;
  };

  const handleSave = async () => {
    if (pricingMode === 'estimates' && (!Number.isFinite(depositAmount) || depositAmount < 0)) {
      toast.error('Please enter a valid deposit amount (0 or more)');
      return;
    }


    setSaving(true);
    try {
      const { data: updated, error } = await supabase
        .from('client_onboarding_preferences')
        .update({
          widget_pricing_mode: pricingMode,
          widget_deposit_amount: depositAmount,
        })
        .eq('client_id', clientId)
        .select('client_id');

      if (error) throw error;
      if (!updated || updated.length === 0) {
        toast.error(
          "Couldn't save deposit — your account doesn't have permission to update this client. Please refresh and try again."
        );
        return;
      }

      const { error: ringResetError } = await supabase
        .from('client_ring_catalog')
        .update({ shopify_sync_status: 'pending' })
        .eq('client_id', clientId)
        .eq('shopify_sync_status', 'synced');

      if (ringResetError) console.warn('Failed to reset ring sync status:', ringResetError);

      setOriginalMode(pricingMode);
      setOriginalDeposit(depositAmount);
      setHasUnsavedChanges(false);

      if (pricingMode === 'estimates' && depositAmount >= 0) {
        if (!shopifyConnected) {
          toast.success('Deposit saved. Connect Shopify to push the deposit product.');
          return;
        }
        toast.message('Pushing deposit product to Shopify…');
        await pushDepositWithRetry(depositAmount);
      } else {
        toast.success('Widget pricing mode saved.');
      }
    } catch (error: any) {
      console.error('Error saving pricing mode:', error);
      toast.error('Failed to save pricing mode');
    } finally {
      setSaving(false);
    }
  };

  const handleManualRetry = async () => {
    if (!Number.isFinite(depositAmount) || depositAmount < 0) {
      toast.error('Enter a valid deposit amount first');
      return;
    }

    if (!shopifyConnected) {
      toast.error('Shopify is not connected');
      return;
    }
    await pushDepositWithRetry(depositAmount);
  };

  if (!loaded) return null;

  const currencySymbol = getCurrencySymbol(currency);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          Widget Pricing Mode
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Choose how your widget prices are displayed to customers on Shopify
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={pricingMode}
          onValueChange={handleModeChange}
          className="space-y-3"
        >
          {/* Estimates Option */}
          <div
            className={`relative flex items-start gap-3 rounded-lg border p-4 transition-all cursor-pointer ${
              pricingMode === 'estimates'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border hover:border-muted-foreground/30'
            }`}
            onClick={() => handleModeChange('estimates')}
          >
            <RadioGroupItem value="estimates" id="estimates" className="mt-0.5" />
            <div className="flex-1 space-y-1">
              <Label htmlFor="estimates" className="text-sm font-medium cursor-pointer">
                Estimates (Deposit-Based)
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                All products on Shopify will be priced at a fixed deposit amount. Your internal catalog prices remain unchanged for your records.
              </p>
            </div>
          </div>

          {/* No-Deposit Option — lead capture instead of checkout */}
          <div
            className={`relative flex items-start gap-3 rounded-lg border p-4 transition-all cursor-pointer ${
              pricingMode === 'no_deposit'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border hover:border-muted-foreground/30'
            }`}
            onClick={() => handleModeChange('no_deposit')}
          >
            <RadioGroupItem value="no_deposit" id="no_deposit" className="mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="no_deposit" className="text-sm font-medium cursor-pointer">
                  No-Deposit
                </Label>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  <UserPlus className="w-2.5 h-2.5 mr-0.5" />
                  Lead Capture
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Customers see their estimate and then submit a short contact form instead of checking out. No Shopify checkout and no deposit — you receive the full ring configuration as a lead, and it syncs to your CRM just like a saved design.
              </p>
            </div>
          </div>

          {/* Custom Pricing Option (Locked) */}
          <div
            className="relative flex items-start gap-3 rounded-lg border border-border p-4 opacity-60 cursor-not-allowed"
            onClick={() => toast.info('This feature is coming soon. Please contact support for more information.')}
          >
            <RadioGroupItem value="custom_pricing" id="custom_pricing" className="mt-0.5" disabled />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="custom_pricing" className="text-sm font-medium cursor-not-allowed">
                  Custom Pricing
                </Label>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  <Lock className="w-2.5 h-2.5 mr-0.5" />
                  Coming Soon
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect your diamond marketplace API and set custom pricing for each product. Full dynamic pricing control.
              </p>
            </div>
          </div>
        </RadioGroup>

        {/* Deposit Amount Input — only when estimates mode is selected */}
        {pricingMode === 'estimates' && (
          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs font-medium text-muted-foreground">
              Deposit Amount ({currency})
            </Label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currencySymbol}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={Number.isFinite(depositAmount) ? String(depositAmount) : ''}
                  onChange={(e) => handleDepositChange(e.target.value)}
                  className="pl-7 h-9 text-sm"
                  placeholder="e.g. 501"
                />
              </div>
              {(() => {
                const validAmount = Number.isFinite(depositAmount) && depositAmount >= 0;
                const pushPending =
                  !hasUnsavedChanges &&
                  !hasPushedDeposit &&
                  shopifyConnected &&
                  validAmount;
                const disabled =
                  saving ||
                  (!hasUnsavedChanges &&
                    (hasPushedDeposit || !shopifyConnected || !validAmount));
                return (
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={disabled}
                    className="h-9 gap-1.5"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {pushPending ? 'Push to Shopify' : 'Save'}
                  </Button>
                );
              })()}
            </div>
            {depositAmount >= 0 && (
              <p className="text-[11px] text-muted-foreground">
                <Sparkles className="w-3 h-3 inline mr-1" />
                {depositAmount > 0
                  ? `On Save, a single "Ring OS Widget Deposit" product priced at ${currencySymbol}${depositAmount.toLocaleString()} will be created/updated in your Shopify store.`
                  : `No deposit: on Save, the "Ring OS Widget Deposit" product is set to ${currencySymbol}0 so customers can complete checkout for free — you still receive the full ring configuration as an order.`}
              </p>
            )}


            {/* Push status banner */}
            {pushStatus === 'pushing' && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Pushing to Shopify… (attempt {pushAttempt}/{MAX_AUTO_RETRIES})</span>
              </div>
            )}
            {/* Persistent live status (also shown after fresh load / impersonation) */}
            {pushStatus !== 'pushing' && pushStatus !== 'failed' && hasPushedDeposit && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  <span>
                    Deposit product is live on Shopify — {currencySymbol}
                    {originalDeposit.toLocaleString()}
                  </span>
                </div>
                {shopifyConnected && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleManualRetry}
                    className="h-7 gap-1 shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Re-push
                  </Button>
                )}
              </div>
            )}
            {pushStatus !== 'pushing' && pushStatus !== 'failed' && hasPushedDeposit && depositAmount !== originalDeposit && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Amount changed — Save to update the Shopify product.</span>
              </div>
            )}
            {pushStatus !== 'pushing' && pushStatus !== 'failed' && !hasPushedDeposit && shopifyConnected && depositAmount >= 0 && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Not pushed to Shopify yet. Save to publish the deposit product.</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleManualRetry}
                  className="h-7 gap-1 shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  Push to Shopify
                </Button>
              </div>
            )}
            {pushStatus === 'failed' && (
              <div className="flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5" />
                  <div>
                    <div className="font-medium text-destructive">Push to Shopify failed</div>
                    <div className="text-muted-foreground mt-0.5 break-all">{pushError || 'Unknown error'}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleManualRetry}
                  className="h-7 gap-1 shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </Button>
              </div>
            )}
          </div>
        )}

        {/* No-Deposit mode — nothing to configure, just persist the choice */}
        {pricingMode === 'no_deposit' && (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground">
              <Sparkles className="w-3 h-3 inline mr-1" />
              On Save, the widget's last step replaces "Add to Cart" with a contact form. Submissions land in Leads &amp; Bookings and are pushed to your CRM automatically.
            </p>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
              className="h-9 gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
};
