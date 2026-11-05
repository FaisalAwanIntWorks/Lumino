import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Mail, Bell, UserPlus, Trash2, ShoppingBag, AlertTriangle, BarChart3 } from 'lucide-react';

interface NotificationType {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  mandatory?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split free text (commas, semicolons, spaces, new lines) into unique emails. */
function parseEmailList(text: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const email = part.trim();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      invalid.push(email);
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(email);
  }
  return { valid, invalid };
}

const NOTIFICATION_TYPES: NotificationType[] = [
  {
    key: 'new_lead',
    label: 'New Lead Notifications',
    description: 'Get notified when a customer submits a lead or books an appointment from your widgets and forms.',
    icon: UserPlus,
  },
  {
    key: 'lead_deleted',
    label: 'Lead Deletion Alerts',
    description: 'Receive an alert when a lead (saved design) is deleted by you or your staff.',
    icon: Trash2,
  },
  {
    key: 'order_updates',
    label: 'Order Updates',
    description: 'Notifications for new orders, status changes, and fulfillment updates.',
    icon: ShoppingBag,
  },
  {
    key: 'ai_render_email',
    label: 'AI Render Email to Customers',
    description: 'Automatically email AI-generated design previews to customers after they submit a form.',
    icon: Mail,
  },
  {
    key: 'customer_confirmation_email',
    label: 'Customer Confirmation Emails',
    description: 'Send your customer a branded confirmation with their selections and quote estimate after they submit a form. Turn this off if your CRM already emails them.',
    icon: Mail,
  },
  {
    key: 'staff_activity',
    label: 'Staff Activity Alerts',
    description: 'Get notified about important actions performed by your staff members.',
    icon: Bell,
  },
  {
    key: 'monthly_report',
    label: 'Monthly Account Report',
    description: 'A summary of your views, leads, AI generations and revenue, emailed on the 1st of each month.',
    icon: BarChart3,
  },
  {
    key: 'system_announcements',
    label: 'System Announcements',
    description: 'Platform updates, new features, and maintenance notifications from Aurezo.',
    icon: AlertTriangle,
  },
  {
    key: 'account_security',
    label: 'Account & Security',
    description: 'Password resets, login alerts, and account verification emails.',
    icon: Mail,
    mandatory: true,
  },
];

// Per-form switches nested under the master 'customer_confirmation_email' toggle.
// Keys mirror the form_type sent to the notify-customer-confirmation function.
const CONFIRMATION_FORM_TYPES: NotificationType[] = [
  {
    key: 'customer_confirmation_instant_quote',
    label: 'Quote Estimator',
    description: 'Confirmation with the quote estimate after a Quote Estimator submission.',
    icon: Mail,
  },
  {
    key: 'customer_confirmation_grillz',
    label: 'Grillz Builder',
    description: 'Confirmation after a Grillz Builder submission.',
    icon: Mail,
  },
  {
    key: 'customer_confirmation_ring_builder',
    label: 'Ring Builder',
    description: 'Confirmation after a Ring Builder submission.',
    icon: Mail,
  },
  {
    key: 'customer_confirmation_custom_enquiry',
    label: 'Custom Enquiry',
    description: 'Confirmation after a Custom Enquiry submission.',
    icon: Mail,
  },
  {
    key: 'customer_confirmation_widget',
    label: 'Ring OS Widget',
    description: 'Confirmation when a customer saves a design from the Ring OS widget.',
    icon: Mail,
  },
];

export function NotificationPreferencesTab() {
  const { user } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // Extra recipients for new-lead emails (client_notification_preferences.recipient_emails on the new_lead row).
  const [extraEmailsText, setExtraEmailsText] = useState('');
  const [savedExtraEmails, setSavedExtraEmails] = useState<string[]>([]);
  const [savingExtraEmails, setSavingExtraEmails] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, [user, isImpersonating, impersonatedClientId]);

  const fetchPreferences = async () => {
    try {
      // Get client ID
      let cId: string | null = null;
      if (isImpersonating && impersonatedClientId) {
        cId = impersonatedClientId;
      } else if (user?.id) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        cId = data?.id || null;
      }
      setClientId(cId);

      if (!cId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('client_notification_preferences')
        .select('notification_type, is_enabled')
        .eq('client_id', cId);

      if (error) throw error;

      // Build preferences map — default to true for types not yet in DB
      const prefs: Record<string, boolean> = {};
      [...NOTIFICATION_TYPES, ...CONFIRMATION_FORM_TYPES].forEach((nt) => {
        const found = data?.find((d: any) => d.notification_type === nt.key);
        prefs[nt.key] = found ? found.is_enabled : true;
      });
      setPreferences(prefs);

      // Loaded separately so the toggles still work if this column is unavailable.
      const { data: leadRow, error: leadRowError } = await supabase
        .from('client_notification_preferences')
        .select('recipient_emails' as any)
        .eq('client_id', cId)
        .eq('notification_type', 'new_lead')
        .maybeSingle();
      if (!leadRowError) {
        const emails = Array.isArray((leadRow as any)?.recipient_emails) ? (leadRow as any).recipient_emails as string[] : [];
        setSavedExtraEmails(emails);
        setExtraEmailsText(emails.join('\n'));
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const togglePreference = async (notifKey: string, checked: boolean) => {
    if (!clientId) return;
    setSaving(notifKey);

    // Optimistic update
    setPreferences((prev) => ({ ...prev, [notifKey]: checked }));

    try {
      const { error } = await supabase
        .from('client_notification_preferences')
        .upsert(
          {
            client_id: clientId,
            notification_type: notifKey,
            is_enabled: checked,
          } as any,
          { onConflict: 'client_id,notification_type' }
        );

      if (error) throw error;
      toast.success(`${checked ? 'Enabled' : 'Disabled'} ${[...NOTIFICATION_TYPES, ...CONFIRMATION_FORM_TYPES].find((n) => n.key === notifKey)?.label}`);
    } catch (err) {
      // Rollback
      setPreferences((prev) => ({ ...prev, [notifKey]: !checked }));
      toast.error('Failed to update preference');
    } finally {
      setSaving(null);
    }
  };

  const saveExtraEmails = async () => {
    if (!clientId) return;
    const { valid, invalid } = parseEmailList(extraEmailsText);
    if (invalid.length > 0) {
      toast.error(`Invalid email${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}`);
      return;
    }
    setSavingExtraEmails(true);
    try {
      const { error } = await supabase
        .from('client_notification_preferences')
        .upsert(
          {
            client_id: clientId,
            notification_type: 'new_lead',
            is_enabled: preferences.new_lead ?? true,
            recipient_emails: valid,
          } as any,
          { onConflict: 'client_id,notification_type' }
        );
      if (error) throw error;
      setSavedExtraEmails(valid);
      setExtraEmailsText(valid.join('\n'));
      toast.success('Lead notification emails saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save lead notification emails');
    } finally {
      setSavingExtraEmails(false);
    }
  };

  const extraEmailsDirty = (() => {
    const { valid, invalid } = parseEmailList(extraEmailsText);
    if (invalid.length > 0) return true;
    return valid.join('\n').toLowerCase() !== savedExtraEmails.join('\n').toLowerCase();
  })();

  if (loading) {
    return (
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg sm:text-xl">Email Notifications</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Choose which email notifications you'd like to receive. Mandatory notifications cannot be disabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="divide-y divide-border rounded-lg border">
          {NOTIFICATION_TYPES.map((notif) => {
            const Icon = notif.icon;
            const isEnabled = preferences[notif.key] ?? true;
            const isMandatory = notif.mandatory;

            return (
              <div key={notif.key}>
              <div
                className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id={`notif-${notif.key}`}
                  checked={isEnabled}
                  onCheckedChange={(checked) => togglePreference(notif.key, !!checked)}
                  disabled={isMandatory || saving === notif.key}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={`notif-${notif.key}`}
                    className="text-sm font-medium cursor-pointer flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    {notif.label}
                    {isMandatory && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Required
                      </span>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {notif.description}
                  </p>
                </div>
              </div>
              {notif.key === 'new_lead' && isEnabled && (
                <div className="ml-8 sm:ml-12 border-l border-border p-3 sm:px-4 space-y-2">
                  <Label htmlFor="lead-extra-emails" className="text-sm font-medium">
                    Additional lead notification emails
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    New lead and appointment booking emails also go to these addresses. Add one per line or separate with commas.
                    Staff members with Lead Email Notifications switched on are included automatically,
                    and every address receives each email only once.
                  </p>
                  <Textarea
                    id="lead-extra-emails"
                    value={extraEmailsText}
                    onChange={(e) => setExtraEmailsText(e.target.value)}
                    placeholder={'sales@yourstore.com\nmanager@yourstore.com'}
                    rows={3}
                    className="text-sm"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={saveExtraEmails}
                      disabled={savingExtraEmails || !extraEmailsDirty}
                    >
                      {savingExtraEmails ? 'Saving...' : 'Save Emails'}
                    </Button>
                  </div>
                </div>
              )}
              {notif.key === 'customer_confirmation_email' && isEnabled && (
                <div className="ml-8 sm:ml-12 border-l border-border">
                  {CONFIRMATION_FORM_TYPES.map((formNotif) => {
                    const formEnabled = preferences[formNotif.key] ?? true;
                    return (
                      <div
                        key={formNotif.key}
                        className="flex items-start gap-3 p-3 sm:px-4 hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={`notif-${formNotif.key}`}
                          checked={formEnabled}
                          onCheckedChange={(checked) => togglePreference(formNotif.key, !!checked)}
                          disabled={saving === formNotif.key}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <Label
                            htmlFor={`notif-${formNotif.key}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {formNotif.label}
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formNotif.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
