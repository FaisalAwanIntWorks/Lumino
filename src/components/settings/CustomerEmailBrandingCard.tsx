import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Save, Upload, Trash2, Mail } from 'lucide-react';

type EmailHeaderAppearance = 'dark' | 'light';

/**
 * Customer Email Branding
 * Logo + Contact CTA (label + URL) shown ONLY in emails sent to the client's customers.
 * Emails sent to the client themselves are not affected.
 */
export function CustomerEmailBrandingCard() {
  const { user } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emailLogoUrl, setEmailLogoUrl] = useState('');
  const [headerAppearance, setHeaderAppearance] = useState<EmailHeaderAppearance>('dark');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');

  useEffect(() => {
    if (!user) return;
    if (isImpersonating && !impersonatedClientId) return;
    load();
  }, [user, isImpersonating, impersonatedClientId]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const query = supabase
      .from('clients')
      .select('id, email_logo_url, customer_email_header_appearance, customer_email_cta_label, customer_email_cta_url');
    const { data } = isImpersonating && impersonatedClientId
      ? await query.eq('id', impersonatedClientId).maybeSingle()
      : await query.eq('user_id', user.id).maybeSingle();
    if (data) {
      setClientId(data.id);
      setEmailLogoUrl(data.email_logo_url || '');
      setHeaderAppearance(data.customer_email_header_appearance === 'light' ? 'light' : 'dark');
      setCtaLabel(data.customer_email_cta_label || '');
      setCtaUrl(data.customer_email_cta_url || '');
    }
    setLoading(false);
  };

  const isValidCtaUrl = (u: string) => !u || /^(https?:\/\/|mailto:|tel:)/i.test(u.trim());

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Max 2MB allowed.' });
      return;
    }
    setUploading(true);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${clientId}/email-logo.${ext}`;
    const { error } = await supabase.storage.from('client-branding').upload(path, file, { upsert: true });
    if (error) {
      toast({ variant: 'destructive', title: 'Upload failed', description: error.message });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('client-branding').getPublicUrl(path);
    setEmailLogoUrl(`${urlData.publicUrl}?t=${Date.now()}`);
    setUploading(false);
    toast({ title: 'Logo uploaded', description: 'Click Save Changes to apply.' });
  };

  const handleRemoveLogo = () => setEmailLogoUrl('');

  const handleSave = async () => {
    if (!clientId) return;
    if (!isValidCtaUrl(ctaUrl)) {
      toast({ variant: 'destructive', title: 'Invalid CTA URL', description: 'Use https://, mailto: or tel:' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({
        email_logo_url: emailLogoUrl.trim() || null,
        customer_email_header_appearance: headerAppearance,
        customer_email_cta_label: ctaLabel.trim() || null,
        customer_email_cta_url: ctaUrl.trim() || null,
      })
      .eq('id', clientId);
    setSaving(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Save failed', description: error.message });
    } else {
      toast({ title: 'Saved', description: 'Customer email branding updated.' });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!clientId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-4 w-4" /> Customer Email Branding
        </CardTitle>
        <CardDescription>
          These show up only in emails sent to your customers (form confirmations, AI previews, quotes, CAD delivery). Emails sent to you are unchanged. A "Powered by Aurezo" line is always appended.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo */}
        <div className="space-y-2">
          <Label>Email Logo</Label>
          <div className="flex items-center gap-4">
            <div className={`w-32 h-20 rounded-md border border-border flex items-center justify-center overflow-hidden ${headerAppearance === 'light' ? 'bg-[hsl(var(--email-header-preview-light))]' : 'bg-[hsl(var(--email-header-preview-dark))]'}`}>
              {emailLogoUrl ? (
                <img src={emailLogoUrl} alt="Logo preview" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">No logo</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {emailLogoUrl ? 'Replace logo' : 'Upload logo'}
              </Button>
              {emailLogoUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={handleRemoveLogo}>
                  <Trash2 className="h-4 w-4 mr-2" /> Remove
                </Button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={handleUpload} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG or SVG up to 2MB. Falls back to Aurezo logo if empty.</p>
        </div>

        <div className="space-y-3">
          <Label>Email Header Appearance</Label>
          <RadioGroup
            value={headerAppearance}
            onValueChange={(value) => setHeaderAppearance(value === 'light' ? 'light' : 'dark')}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Label htmlFor="email-header-dark" className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-4">
              <RadioGroupItem value="dark" id="email-header-dark" className="mt-0.5" />
              <span>
                <span className="block font-medium text-foreground">Dark header</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">Best for white or light logos.</span>
              </span>
            </Label>
            <Label htmlFor="email-header-light" className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-4">
              <RadioGroupItem value="light" id="email-header-light" className="mt-0.5" />
              <span>
                <span className="block font-medium text-foreground">Light header</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">Best for black or dark logos.</span>
              </span>
            </Label>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">Choose the background that gives your logo the clearest contrast in customer emails.</p>
        </div>

        {/* CTA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cta_label">CTA Button Label</Label>
            <Input id="cta_label" maxLength={40} placeholder="Contact Us" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta_url">CTA URL</Label>
            <Input id="cta_url" placeholder="https://yourbrand.com/contact or mailto:hello@..." value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">Leave both empty to hide the button. URL must start with https://, mailto: or tel:</p>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
