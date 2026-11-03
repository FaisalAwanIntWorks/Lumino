import { useEffect, useState, useCallback, useRef } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreditCard, RefreshCw } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { formatDistanceToNow } from 'date-fns';
import {
  THRESHOLD_PRESETS,
  RECHARGE_PRESETS,
  formatCredits,
} from '@/lib/credit-utils';

interface AutoRechargeSettingsProps {
  clientId: string;
  isImpersonating?: boolean;
  /** Total spendable credit in dollars (free monthly credit + purchased balance). */
  availableDollars?: number;
}

interface Settings {
  enabled: boolean;
  threshold_amount: number;
  recharge_amount: number;
  stripe_payment_method_id: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  last_recharged_at: string | null;
}

interface StripePaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month?: number;
  exp_year?: number;
  isDefault: boolean;
}

export function AutoRechargeSettings({ clientId, isImpersonating, availableDollars }: AutoRechargeSettingsProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const autoSyncAttempted = useRef(false);

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('client_auto_recharge_settings')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (data) {
        setSettings(data as unknown as Settings);
      } else {
        // Recommended starting point for a fresh setup. Auto-recharge stays OFF
        // until the client turns it on themselves — we never opt anyone in.
        setSettings({
          enabled: false,
          threshold_amount: 5,
          recharge_amount: 25,
          stripe_payment_method_id: null,
          payment_method_brand: null,
          payment_method_last4: null,
          last_recharged_at: null,
        });
      }
    } catch {
      toast.error('Failed to load auto-recharge settings');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (clientId) loadSettings();
  }, [clientId, loadSettings]);

  // Link an already-saved card on mount so the client only has to flip the
  // switch. Linking the card does NOT switch auto-recharge on.
  useEffect(() => {
    if (!settings || settings.stripe_payment_method_id || autoSyncAttempted.current || isImpersonating) return;
    autoSyncAttempted.current = true;
    (async () => {
      setSyncing(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-payment-methods');
        if (error) throw error;
        const methods: StripePaymentMethod[] = data?.paymentMethods ?? [];
        if (methods.length === 0) { setSyncing(false); return; }
        const card = methods.find(m => m.isDefault) || methods[0];
        await saveCard(card, true);
      } catch {
        // Silent fail on auto-sync
      } finally {
        setSyncing(false);
      }
    })();
  }, [settings, isImpersonating]);


  const saveSettings = async (updates: Partial<Settings>) => {
    setSaving(true);
    try {
      const newSettings = { ...settings!, ...updates };
      const { error } = await supabase
        .from('client_auto_recharge_settings')
        .upsert(
          {
            client_id: clientId,
            enabled: newSettings.enabled,
            threshold_amount: newSettings.threshold_amount,
            recharge_amount: newSettings.recharge_amount,
            // Turning it back on is a fresh start — drop any previous decline
            // so the account isn't held in the retry cool-off.
            ...(newSettings.enabled ? { last_failed_at: null, last_failure_reason: null } : {}),
          },
          { onConflict: 'client_id' }
        );
      if (error) throw error;
      setSettings(newSettings);
      toast.success('Auto-recharge settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const saveCard = async (pm: StripePaymentMethod, silent = false) => {
    setSaving(true);
    try {
      // Persist the currently shown threshold/amount alongside the card so a
      // freshly created row matches what the client sees. `enabled` is carried
      // over untouched — linking a card never switches auto-recharge on.
      const { error } = await supabase
        .from('client_auto_recharge_settings')
        .upsert(
          {
            client_id: clientId,
            stripe_payment_method_id: pm.id,
            payment_method_brand: pm.brand,
            payment_method_last4: pm.last4,
            enabled: settings?.enabled ?? false,
            threshold_amount: settings?.threshold_amount ?? 5,
            recharge_amount: settings?.recharge_amount ?? 25,
            // A new/changed card clears the previous decline cool-off.
            last_failed_at: null,
            last_failure_reason: null,
          },
          { onConflict: 'client_id' }
        );
      if (error) throw error;
      setSettings(prev => prev ? {
        ...prev,
        stripe_payment_method_id: pm.id,
        payment_method_brand: pm.brand,
        payment_method_last4: pm.last4,
      } : null);
      if (!silent) {
        toast.success(`Card ${pm.brand} •••• ${pm.last4} linked for auto-recharge`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save card');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeCard = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-payment-methods');
      if (error) throw error;
      const methods: StripePaymentMethod[] = data?.paymentMethods ?? [];
      if (methods.length === 0) {
        toast.error('No payment methods found. Purchase a credit pack first.');
        return;
      }
      const card = methods.find(m => m.isDefault) || methods[0];
      await saveCard(card);
    } catch (err: any) {
      toast.error(err.message || 'Failed to sync payment methods');
    } finally {
      setSyncing(false);
    }
  };

  const handleAddCard = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-card-setup');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast.error(err.message || 'Could not open the card page');
      setSaving(false);
    }
  };

  const handleRemoveCard = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('client_auto_recharge_settings')
        .update({
          stripe_payment_method_id: null,
          payment_method_brand: null,
          payment_method_last4: null,
          enabled: false,
        })
        .eq('client_id', clientId);
      if (error) throw error;
      setSettings(prev => prev ? {
        ...prev,
        stripe_payment_method_id: null,
        payment_method_brand: null,
        payment_method_last4: null,
        enabled: false,
      } : null);
      toast.success('Payment method removed and auto-recharge disabled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove card');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) return null;

  const hasCard = !!settings.stripe_payment_method_id;
  const canEnable = hasCard;
  // Without a saved card nothing can actually be charged, so never present the
  // switch as active — the stored value is left untouched.
  const switchOn = settings.enabled && hasCard;
  const cardLabel = hasCard
    ? `your ${settings.payment_method_brand ?? 'card'} •••• ${settings.payment_method_last4 ?? ''}`.trim()
    : 'your card';
  const showLowCreditNudge =
    !switchOn &&
    typeof availableDollars === 'number' &&
    availableDollars < settings.threshold_amount;


  return (
    <div className="space-y-4">
      <Separator />
      <div>
        <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
          Auto-Recharge
          <InfoTooltip text="Automatically top up credits when your balance gets low. 1 credit = $0.0005 (2,000 credits = $1)" />
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          We'll automatically charge your card and add credits when your balance runs low.
        </p>
      </div>

      {showLowCreditNudge && (
        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <p className="text-xs text-foreground">
            {hasCard
              ? "You're low on AI credit — turn on automatic top-up so image generation doesn't stop."
              : "You're low on AI credit. Add a card (no charge) to make automatic top-up available."}
          </p>
        </div>
      )}

      {/* On / off */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor="auto-recharge-toggle" className="text-sm">
            Automatic top-up
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {canEnable
              ? `When your credit falls below ${formatCredits(settings.threshold_amount)} credits we'll charge ${cardLabel} $${settings.recharge_amount} and add the credit automatically. Turn this off any time to stop all automatic charges.`
              : 'Add a card to switch this on — no charge until your credit runs low. Cards used for credit packs are saved automatically.'}
          </p>
          {!canEnable && !isImpersonating && (
            <Button variant="outline" size="sm" className="mt-2" onClick={handleAddCard} disabled={saving}>
              Add card
            </Button>
          )}
        </div>
        <Switch
          id="auto-recharge-toggle"
          checked={switchOn}
          disabled={!canEnable || isImpersonating || saving}
          onCheckedChange={(checked) => saveSettings({ enabled: checked })}
        />
      </div>





      {/* Payment Method — auto-synced */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Payment Method</p>
        {syncing ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Detecting payment method…</span>
          </div>
        ) : hasCard ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm capitalize">
                {settings.payment_method_brand} •••• {settings.payment_method_last4}
              </span>
            </div>
            {!isImpersonating && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={handleChangeCard} disabled={syncing || saving}>
                  Change card
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              No card saved yet. Add one (no charge) or buy a credit pack and it's saved automatically.
            </p>
            {!isImpersonating && (
              <Button variant="outline" size="sm" onClick={handleAddCard} disabled={saving}>
                Add card
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Threshold */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          When balance falls below
          <InfoTooltip text="We'll trigger a recharge when your credit balance drops below this threshold" />
        </p>
        <p className="text-xs text-muted-foreground">
          This counts your free monthly credit plus any credit you've purchased, so you're only
          charged once the free monthly credit is genuinely used up.
        </p>
        <div className="flex gap-2 flex-wrap">
          {THRESHOLD_PRESETS.map((preset) => (
            <button
              key={preset.credits}
              onClick={() => saveSettings({ threshold_amount: preset.dollars })}
              disabled={isImpersonating || saving}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                settings.threshold_amount === preset.dollars
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              {preset.label} credits
            </button>
          ))}
        </div>
      </div>

      {/* Recharge Amount */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Top up with
        </p>
        <div className="flex gap-2 flex-wrap">
          {RECHARGE_PRESETS.map((preset) => (
            <button
              key={preset.credits}
              onClick={() => saveSettings({ recharge_amount: preset.dollars })}
              disabled={isImpersonating || saving}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                settings.recharge_amount === preset.dollars
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              {preset.label} credits <span className="ml-1 opacity-60">• ${preset.dollars}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Last Recharge */}
      {settings.last_recharged_at && (
        <p className="text-xs text-muted-foreground">
          Last auto-recharge: {formatDistanceToNow(new Date(settings.last_recharged_at), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}
