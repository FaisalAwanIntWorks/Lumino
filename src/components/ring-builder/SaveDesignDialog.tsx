import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { trackLeadConversion } from '@/lib/conversion-tracking';
import { trackMetaEvent } from '@/lib/meta-pixel';
import { trackMetaLead } from '@/lib/meta-lead';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CountryPhoneInput } from '@/components/ui/country-phone-input';
import { checkPhone } from '@/lib/phone-quality';
import { supabase } from '@/integrations/supabase/client';
import { insertLeadRow } from '@/lib/lead-device';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { RingConfiguration } from '@/types/ring-builder';
import {
  saveDesignSchema,
  formatPhoneE164,
  getValidationErrors,
} from '@/lib/form-validation';
import { useWidgetTheme, type WidgetTheme } from '@/contexts/WidgetThemeContext';

// All colors come from the widget's CSS custom properties (set per theme in
// index.css under [data-theme=...] and overridden per client from
// branding_config.themeColors). The dialog is portaled to <body>, so it
// re-applies data-theme + the client overrides on its own root — never
// hard-code a theme's stock palette here or per-client colors are ignored.
const getThemeStyles = (theme: WidgetTheme) => {
  const is24k = theme === 'twentyfourk';
  return {
    dialogBg: 'bg-background text-foreground',
    inputBg: 'bg-card border-border text-foreground placeholder:text-muted-foreground',
    focusRing: 'focus-visible:ring-ring',
    labelColor: 'text-foreground',
    descColor: 'text-muted-foreground',
    outline: 'border-[hsl(var(--client-accent)/0.4)] text-foreground hover:bg-muted',
    buttonStyle: (is24k
      ? { background: 'hsl(var(--accent-gold))', color: 'hsl(var(--accent-gold-foreground, 0 0% 0%))' }
      : {
          background: 'hsl(var(--cta-bg, var(--primary)))',
          color: 'hsl(var(--cta-text, var(--primary-foreground)))',
        }) as CSSProperties,
    buttonClass: 'hover:opacity-90',
  };
};

interface SaveDesignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configuration: RingConfiguration;
  clientId: string;
  catalogOptions?: {
    styles?: Array<{ id: string; name: string }>;
    shanks?: Array<{ id: string; name: string }>;
    metals?: Array<{ id: string; name: string }>;
    shapes?: Array<{ id: string; name: string }>;
    caratOptions?: Array<{ value: number; displayName: string }>;
  };
}

// Helper function to generate a descriptive product name from configuration
export const generateProductName = (
  configuration: RingConfiguration,
  catalogOptions?: SaveDesignDialogProps['catalogOptions']
): string => {
  const parts: string[] = [];
  
  // Get style name
  if (configuration.style && catalogOptions?.styles) {
    const style = catalogOptions.styles.find(s => s.id === configuration.style);
    if (style) parts.push(style.name);
  }
  
  // Get shank name
  if (configuration.shank && catalogOptions?.shanks) {
    const shank = catalogOptions.shanks.find(s => s.id === configuration.shank);
    if (shank) parts.push(shank.name);
  }
  
  // Get metal name
  if (configuration.metal && catalogOptions?.metals) {
    const metal = catalogOptions.metals.find(m => m.id === configuration.metal);
    if (metal) parts.push(metal.name);
  }
  
  // Get shape name
  if (configuration.shape && catalogOptions?.shapes) {
    const shape = catalogOptions.shapes.find(s => s.id === configuration.shape);
    if (shape) parts.push(shape.name);
  }
  
  // Add carat if available
  if (configuration.caratRange) {
    parts.push(`${configuration.caratRange}ct`);
  }
  
  return parts.length > 0 ? parts.join(' ') : 'Custom Ring';
};

export const SaveDesignDialog = ({
  open,
  onOpenChange,
  configuration,
  clientId,
  catalogOptions,
}: SaveDesignDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    countryCode: '+1',
    phoneNumber: '',
    notes: '',
  });
  const [countryIso, setCountryIso] = useState('US');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { theme, styleOverrides } = useWidgetTheme();
  const styles = getThemeStyles(theme);

  // Fire Contact event when dialog opens
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      trackMetaEvent('Contact');
    }
    prevOpen.current = open;
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = saveDesignSchema.safeParse(formData);
    
    if (!result.success) {
      const validationErrors = getValidationErrors(result.error);
      setErrors(validationErrors);
      toast({
        title: 'Validation Error',
        description: 'Please fix the errors in the form.',
        variant: 'destructive',
      });
      return;
    }

    // Real numbering-plan + junk-pattern check (offline, no API cost).
    const phoneCheck = checkPhone(formData.countryCode, formData.phoneNumber, countryIso);
    if (!phoneCheck.valid) {
      setErrors({ phoneNumber: phoneCheck.error || 'Please enter a valid phone number' });
      toast({
        title: 'Validation Error',
        description: phoneCheck.error || 'Please enter a valid phone number.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // Use validated and sanitized data
      const validatedData = result.data;
      
      // Format phone number to E.164 format
      const formattedPhone = phoneCheck.e164 || formatPhoneE164(
        validatedData.countryCode,
        validatedData.phoneNumber
      );
      
      // Generate product name from configuration
      const productName = generateProductName(configuration, catalogOptions);
      
      const { error } = await insertLeadRow('saved_designs', {
        client_id: clientId,
        product_id: null,
        product_name: productName,
        configuration: configuration as any,
        customer_name: validatedData.name,
        customer_email: validatedData.email,
        customer_phone: formattedPhone,
        notes: validatedData.notes,
        follow_up_status: 'new',
      });

      if (error) throw error;

      // Send lead notification email to the client (fire and forget)
      supabase.functions.invoke('notify-new-lead', {
        body: {
          client_id: clientId,
          customer_name: validatedData.name,
          customer_email: validatedData.email,
          customer_phone: formattedPhone,
          product_name: productName,
          configuration: {
            style: catalogOptions?.styles?.find(s => s.id === configuration.style)?.name,
            shank: catalogOptions?.shanks?.find(s => s.id === configuration.shank)?.name,
            metal: catalogOptions?.metals?.find(m => m.id === configuration.metal)?.name,
            shape: catalogOptions?.shapes?.find(s => s.id === configuration.shape)?.name,
            caratRange: configuration.caratRange,
            stone: configuration.stone,
            size: configuration.size,
            engraving: configuration.engraving,
          },
          notes: validatedData.notes,
        },
      }).catch(err => {
        console.error('Failed to send lead notification:', err);
      });

      // Fire-and-forget customer confirmation email
      const widgetDetails: Record<string, string> = {};
      const styleName = catalogOptions?.styles?.find(s => s.id === configuration.style)?.name;
      const shankName = catalogOptions?.shanks?.find(s => s.id === configuration.shank)?.name;
      const metalName = catalogOptions?.metals?.find(m => m.id === configuration.metal)?.name;
      const shapeName = catalogOptions?.shapes?.find(s => s.id === configuration.shape)?.name;
      if (styleName) widgetDetails['Style'] = styleName;
      if (shankName) widgetDetails['Shank'] = shankName;
      if (metalName) widgetDetails['Metal'] = metalName;
      if (shapeName) widgetDetails['Shape'] = shapeName;
      if (configuration.caratRange) widgetDetails['Carat'] = String(configuration.caratRange);
      if (configuration.size) widgetDetails['Size'] = configuration.size;
      if (configuration.engraving?.enabled && configuration.engraving?.text) widgetDetails['Engraving'] = configuration.engraving.text;
      if (validatedData.notes) widgetDetails['Notes'] = validatedData.notes;
      supabase.functions.invoke('notify-customer-confirmation', {
        body: {
          client_id: clientId,
          form_type: 'widget',
          customer_name: validatedData.name,
          customer_email: validatedData.email,
          details: widgetDetails,
        },
      }).catch(err => console.error('Customer confirmation error:', err));

      trackMetaLead({
        clientId,
        userData: {
          email: validatedData.email,
          phone: `${validatedData.countryCode}${validatedData.phoneNumber}`,
          firstName: validatedData.name,
          externalId: validatedData.email,
        },
        customData: { content_name: 'Ring Configurator', content_category: 'widget' },
      });
      trackLeadConversion('ring_builder', { email: validatedData.email, phone: validatedData.phoneNumber });

      toast({
        title: 'Design saved!',
        description: "We'll contact you soon about your custom ring.",
      });

      setFormData({ name: '', email: '', countryCode: '+1', phoneNumber: '', notes: '' });
      setErrors({});
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving design:', error);
      toast({
        title: 'Error saving design',
        description: 'Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-theme={theme}
        style={styleOverrides as CSSProperties}
        className={`sm:max-w-[500px] ${styles.dialogBg} border-none`}
      >
        <DialogHeader>
          <DialogTitle>Save Your Design</DialogTitle>
          <DialogDescription className={styles.descColor}>
            Save your custom ring design and we'll reach out to help you bring it to life.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name" className={styles.labelColor}>Name *</Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              autoCapitalize="words"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Your full name"
              className={`${styles.inputBg} ${styles.focusRing} ${errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              disabled={loading}
              maxLength={100}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email" className={styles.labelColor}>Email *</Label>
            <Input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="off"
              spellCheck={false}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="your@email.com"
              className={`${styles.inputBg} ${styles.focusRing} ${errors.email ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              disabled={loading}
              maxLength={255}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label className={styles.labelColor}>Phone *</Label>
            <CountryPhoneInput
              countryCode={formData.countryCode}
              phoneNumber={formData.phoneNumber}
              onCountryCodeChange={(code) => setFormData({ ...formData, countryCode: code })}
              onPhoneNumberChange={(number) => setFormData({ ...formData, phoneNumber: number })}
              countryIso={countryIso}
              onCountryIsoChange={setCountryIso}
              onBlur={() => {
                if (!formData.phoneNumber.replace(/\D/g, '')) return;
                const res = checkPhone(formData.countryCode, formData.phoneNumber, countryIso);
                setErrors((prev) => ({ ...prev, phoneNumber: res.valid ? '' : (res.error || 'Please enter a valid phone number') }));
              }}
              error={errors.countryCode || errors.phoneNumber}
              disabled={loading}
              inputClassName={`${styles.inputBg} ${styles.focusRing}`}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes" className={styles.labelColor}>Notes *</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Tell us about your preferences, questions, or special requests"
              rows={3}
              className={`${styles.inputBg} ${styles.focusRing} ${errors.notes ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              disabled={loading}
              maxLength={1000}
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes}</p>
            )}
            <p className={`text-xs ${styles.descColor}`}>
              {formData.notes.length}/1000 characters
            </p>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className={`flex-1 ${styles.outline}`}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" className={`flex-1 ${styles.buttonClass}`} style={styles.buttonStyle} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Design'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
