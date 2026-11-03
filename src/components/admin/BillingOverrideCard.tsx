import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { ShieldCheck } from 'lucide-react';

interface BillingOverrideCardProps {
  clientId: string;
  clientName?: string;
  overrideUntil: string | null;
  overrideReason: string | null;
  onChanged: () => void;
}

/**
 * Manual billing override — keeps a client's widgets live even when their
 * cached Stripe subscription says cancelled/past due. Used for comp accounts
 * and while a billing issue is being sorted out. The gate function
 * `get_client_subscription_active` honours an unexpired override.
 */
export function BillingOverrideCard({
  clientId,
  clientName,
  overrideUntil,
  overrideReason,
  onChanged,
}: BillingOverrideCardProps) {
  const active = !!overrideUntil && new Date(overrideUntil) > new Date();
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const log = async (description: string) => {
    const { data: auth } = await supabase.auth.getUser();
    await supabase.from('client_activity_logs').insert([{
      client_id: clientId,
      action_type: 'billing_override',
      action_category: 'billing',
      description,
      user_email: auth?.user?.email ?? 'admin',
      user_id: auth?.user?.id ?? '',
      user_type: 'admin',
    }]);
  };

  const apply = async () => {
    const n = parseInt(days, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a valid number of days');
      return;
    }
    setSaving(true);
    try {
      const until = addDays(new Date(), n).toISOString();
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('clients')
        .update({
          billing_override_until: until,
          billing_override_reason: reason || null,
          billing_override_by: auth?.user?.id ?? null,
        } as any)
        .eq('id', clientId);
      if (error) throw error;
      await log(
        `Billing override set for ${n} day(s) until ${format(new Date(until), 'MMM d, yyyy')}${reason ? ` — ${reason}` : ''}`,
      );
      toast.success('Billing override active — widgets are live');
      setReason('');
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to set override');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!confirm(`Clear the billing override for ${clientName || 'this client'}? Their widgets will follow Stripe again.`)) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          billing_override_until: null,
          billing_override_reason: null,
          billing_override_by: null,
        } as any)
        .eq('id', clientId);
      if (error) throw error;
      await log('Billing override cleared');
      toast.success('Billing override cleared');
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to clear override');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Billing Override
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          {active ? (
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              Active until {format(new Date(overrideUntil!), 'MMM d, yyyy')}
            </Badge>
          ) : (
            <Badge variant="secondary">Not set</Badge>
          )}
        </div>
        {active && overrideReason && (
          <p className="text-xs text-muted-foreground">Reason: {overrideReason}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Keeps every widget live regardless of the Stripe subscription state. Billing data itself is unchanged.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="number"
            min={1}
            value={days}
            onChange={e => setDays(e.target.value)}
            className="sm:w-24"
            placeholder="Days"
          />
          <Input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional)"
          />
          <Button onClick={apply} disabled={saving}>
            {active ? 'Extend' : 'Enable'}
          </Button>
          {active && (
            <Button variant="outline" onClick={clear} disabled={saving}>
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
