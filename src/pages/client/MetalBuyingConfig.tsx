import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { MetalBuyingConfigurator } from '@/components/metal-buying-config/MetalBuyingConfigurator';
import { MetalBuyingForm } from '@/components/metal-buying/MetalBuyingForm';
import { useClientMetalBuyingConfig } from '@/hooks/useClientMetalBuyingConfig';
import { generateMetalBuyingEmbedCode } from '@/lib/metal-buying-embed';
import { isProductionDomain, PRODUCTION_DOMAINS } from '@/lib/domain-config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Coins, Monitor, Smartphone, RefreshCw, Copy, Check, ExternalLink, Eye, Settings2, Code2 } from 'lucide-react';
import { toast } from 'sonner';
import { canView, canEdit } from '@/lib/staff-permissions';
import { AccessDenied } from '@/components/access/AccessDenied';
import { METAL_IQ_DEFAULT_COLORS } from '@/lib/metal-iq-defaults';

export default function MetalBuyingConfig() {
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const [effectiveClientId, setEffectiveClientId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewKey, setPreviewKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const { config, isLoading, defaultMetalsConfig } = useClientMetalBuyingConfig();

  useEffect(() => {
    async function getClientId() {
      if (isImpersonating && impersonatedClientId) {
        setEffectiveClientId(impersonatedClientId);
        return;
      }
      if (!user) return;
      const { data } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle();
      setEffectiveClientId(data?.id ?? null);
    }
    getClientId();
  }, [user, isImpersonating, impersonatedClientId]);

  const embedCode = effectiveClientId ? generateMetalBuyingEmbedCode(effectiveClientId) : '';
  const previewConfig = config ?? {
    metals_config: defaultMetalsConfig,
    dont_know_enabled: true,
  };
  const formColors = (config?.form_colors as Record<string, string> | undefined) ?? {};
  const previewAccent = formColors.tabBorder || METAL_IQ_DEFAULT_COLORS.tabBorder;
  const previewFont = formColors.fontColor || METAL_IQ_DEFAULT_COLORS.fontColor;
  const previewBackground = formColors.background || METAL_IQ_DEFAULT_COLORS.background;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      toast.success('Embed code copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Failed to copy'); }
  };

  const handleTestInNewTab = () => {
    if (!effectiveClientId) return;
    const hostname = window.location.hostname;
    const url = isProductionDomain(hostname)
      ? `https://${PRODUCTION_DOMAINS.builder}/metal-buying/${effectiveClientId}`
      : `${window.location.origin}/embed-metal-buying/${effectiveClientId}`;
    window.open(url, '_blank');
  };

  const tabTriggerClass = "relative rounded-none border-b-2 border-transparent bg-transparent gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap";

  // Staff guard: Metal IQ access — disabled hides Widget + Leads entirely
  if (role === 'staff' && !canView(staffInfo?.permissions?.metal_buying_access)) {
    return <AccessDenied feature="Metal IQ" />;
  }

  const isReadOnly = role === 'staff' && !canEdit(staffInfo?.permissions?.metal_buying_access);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Coins className="h-6 w-6 text-primary" />
          Metal IQ — Embed Configurator
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure rates, preview your form, and get your embed code
        </p>
      </div>

      <Tabs defaultValue="preview" className="w-full">
        <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0 mb-4">
          <TabsTrigger value="preview" className={tabTriggerClass}>
            <Eye className="h-3.5 w-3.5" /> Preview
          </TabsTrigger>
          <TabsTrigger value="configure" className={tabTriggerClass}>
            <Settings2 className="h-3.5 w-3.5" /> Configure
          </TabsTrigger>
          <TabsTrigger value="embed" className={tabTriggerClass}>
            <Code2 className="h-3.5 w-3.5" /> Embed Code
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center border rounded-lg p-1 gap-0.5">
                <Button variant={previewMode === 'desktop' ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0"
                  onClick={() => setPreviewMode('desktop')}>
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button variant={previewMode === 'mobile' ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0"
                  onClick={() => setPreviewMode('mobile')}>
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => setPreviewKey(k => k + 1)}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>

            {previewMode === 'mobile' ? (
              <div className="flex justify-center bg-muted/40 p-4 rounded-lg">
                <div className="w-[375px] h-[700px] border-4 border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <iframe
                    key={previewKey}
                    src={effectiveClientId ? `/embed-metal-buying/${effectiveClientId}` : undefined}
                    className="w-full h-full border-0"
                    title="Metal IQ Mobile Preview"
                  />
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center rounded-xl border border-border bg-card py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <div className="rounded-xl">
                <MetalBuyingForm
                  key={`desktop-${previewKey}`}
                  clientId="preview"
                  bookingClientId={effectiveClientId ?? undefined}
                  config={previewConfig}
                  accentColor={previewAccent}
                  fontColor={previewFont}
                  backgroundColor={previewBackground}
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="configure">
          <MetalBuyingConfigurator />
        </TabsContent>

        <TabsContent value="embed">
          <Card className="p-6 sm:p-8 max-w-2xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <Code2 className="h-10 w-10 mx-auto text-muted-foreground" />
              <h3 className="text-xl font-semibold text-foreground">Metal IQ Embed Code</h3>
              <p className="text-muted-foreground text-sm">
                Copy this code and paste it into your website to embed the Metal IQ buying form.
              </p>
            </div>

            <div className="relative">
              <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto max-h-[300px] overflow-y-auto">
                <code>{embedCode || 'Loading...'}</code>
              </pre>
            </div>

            <div className="flex gap-3 justify-center">
              <Button onClick={handleCopy} disabled={!embedCode} className="gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Code'}
              </Button>
              <Button variant="outline" onClick={handleTestInNewTab} disabled={!effectiveClientId} className="gap-2">
                <ExternalLink className="h-4 w-4" /> Test in New Tab
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
