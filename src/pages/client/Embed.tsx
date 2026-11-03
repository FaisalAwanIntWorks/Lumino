import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Code2, Eye, Palette, Copy, Check, Layout, Monitor, Smartphone, ListOrdered, GripVertical } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { generateEmbedCode, generatePreviewUrl, generateThemeTestUrls, copyToClipboard as clipboardCopy } from '@/lib/embed-utils';
import { normalizeStepOrder, RING_STEP_LABELS, RingStepKey, DEFAULT_RING_STEP_ORDER } from '@/lib/ring-step-order';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ThemeColorEditor } from '@/components/client/ThemeColorEditor';
import { ThemeColorSet, ThemeColorMap, THEME_COLOR_DEFAULTS } from '@/lib/theme-color-defaults';
import { canView } from '@/lib/staff-permissions';
import { AccessDenied } from '@/components/access/AccessDenied';
import { isTwentyFourKClient, TWENTYFOURK_THEME_KEY } from '@/lib/twentyfourk-theme';

function SortableStepRow({ id, idx, label, disabled }: { id: string; idx: number; label: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-card ${isDragging ? 'shadow-lg' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        disabled={disabled}
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="w-6 h-6 rounded-full bg-muted text-foreground text-xs font-semibold flex items-center justify-center">
        {idx + 1}
      </div>
      <span className="flex-1 text-sm font-medium uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function Embed() {
  const { user, role, staffInfo } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const { toast } = useToast();
  const [clientId, setClientId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#50c878');
  const [secondaryColor, setSecondaryColor] = useState('#0b6e4f');
  const [showChatAssistant, setShowChatAssistant] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [showSaveDesign, setShowSaveDesign] = useState(true);
  const [includeSettingsInEmbed, setIncludeSettingsInEmbed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('ui-options');
  const [previewNonce, setPreviewNonce] = useState(Date.now());
  const [isPreviewLoading, setIsPreviewLoading] = useState(true);
  const [frozenPreviewUrl, setFrozenPreviewUrl] = useState('');
  const [iframeKey, setIframeKey] = useState('');
  const [widgetTheme, setWidgetTheme] = useState('luxury');
  const [savingTheme, setSavingTheme] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  
  const [themeColors, setThemeColors] = useState<ThemeColorMap>({ ...THEME_COLOR_DEFAULTS });
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [stepOrder, setStepOrder] = useState<RingStepKey[]>(DEFAULT_RING_STEP_ORDER);
  const [videoFirst, setVideoFirst] = useState(false);
  const [clickToContinue, setClickToContinue] = useState(true);

  useEffect(() => {
    document.title = 'Client • Embed | Jewlx';
    if (isImpersonating && !impersonatedClientId) return;
    loadClient();
  }, [user, role, staffInfo, isImpersonating, impersonatedClientId]);

  const effectiveClientId = useMemo(() => {
    if (isImpersonating) return impersonatedClientId;
    if (role === 'staff' && staffInfo?.clientId) return staffInfo.clientId;
    return clientId;
  }, [isImpersonating, impersonatedClientId, clientId, role, staffInfo]);

  // Select only non-sensitive columns to prevent exposure of encrypted tokens
  const EMBED_SAFE_COLUMNS = 'id, company_name, branding_config, allowed_domains, widget_theme';

  const loadClient = async () => {
    if (!user) return;

    let query;
    if (isImpersonating && impersonatedClientId) {
      query = supabase.from('clients').select(EMBED_SAFE_COLUMNS).eq('id', impersonatedClientId).maybeSingle();
    } else if (role === 'staff' && staffInfo?.clientId) {
      query = supabase.from('clients').select(EMBED_SAFE_COLUMNS).eq('id', staffInfo.clientId).maybeSingle();
    } else {
      query = supabase.from('clients').select(EMBED_SAFE_COLUMNS).eq('user_id', user.id).maybeSingle();
    }

    const { data: client, error } = await query;

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading client:', error);
      return;
    }

    if (client) {
      setClientId(client.id);
      setCompanyName(client.company_name);
      const config = (client.branding_config || {}) as any;
      setPrimaryColor(config.primaryColor || '#50c878');
      setSecondaryColor(config.secondaryColor || '#0b6e4f');
      setShowChatAssistant(config.showChatAssistant ?? true);
      setShowComparison(config.showComparison ?? true);
      setShowSaveDesign(config.showSaveDesign ?? true);
      setWidgetTheme(client.widget_theme || 'luxury');
      setAllowedDomains((client as any).allowed_domains || []);
      // Load per-theme colors
      if (config.themeColors) {
        setThemeColors(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(config.themeColors as ThemeColorMap).map(([k, v]) => [
              k,
              { ...THEME_COLOR_DEFAULTS[k], ...v },
            ])
          ),
        }));
      }
      setStepOrder(normalizeStepOrder(config.stepOrder));
      setVideoFirst(Boolean(config.videoFirst));
      // Default ON for every client; only an explicit false turns it off.
      setClickToContinue(config.clickToContinue !== false);
    }
  };

  // Ensure preview is available as soon as we have a client id (fixes blank UI Options + Preview tab)
  useEffect(() => {
    if (!effectiveClientId) return;
    freezePreviewUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveClientId]);

  const saveTheme = async () => {
    if (!effectiveClientId) return;
    setSavingTheme(true);
    
    const { error } = await supabase
      .from('clients')
      .update({ 
        widget_theme: widgetTheme,
        branding_config: { primaryColor, secondaryColor, showChatAssistant, showComparison, showSaveDesign, themeColors, stepOrder, videoFirst, clickToContinue } as any
      })
      .eq('id', effectiveClientId);

    setSavingTheme(false);
    
    if (error) {
      toast({ title: 'Error', description: 'Failed to save theme', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'UI theme saved' });
      freezePreviewUrl();
    }
  };

  const freezePreviewUrl = (themeOverride?: string) => {
    if (!effectiveClientId) return;
    
    const branding = {
      primaryColor,
      secondaryColor,
      showChatAssistant,
      showComparison,
      showSaveDesign,
      theme: themeOverride ?? widgetTheme,
    };
    
    const ts = Date.now();
    const url = generatePreviewUrl(effectiveClientId, branding);
    setFrozenPreviewUrl(`${url}&ts=${ts}`);
    setIframeKey(`${effectiveClientId}-${ts}`);
    setIsPreviewLoading(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stepOrder.indexOf(active.id as RingStepKey);
    const newIndex = stepOrder.indexOf(over.id as RingStepKey);
    if (oldIndex < 0 || newIndex < 0) return;
    setStepOrder(normalizeStepOrder(arrayMove(stepOrder, oldIndex, newIndex)));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const resetStepOrder = () => setStepOrder(DEFAULT_RING_STEP_ORDER);

  const saveSettings = async () => {
    if (!effectiveClientId) return;

    const brandingConfig = {
      primaryColor,
      secondaryColor,
      showChatAssistant,
      showComparison,
      showSaveDesign,
      themeColors: themeColors as unknown as Record<string, Record<string, string>>,
      stepOrder,
      videoFirst,
      clickToContinue,
    };

    const { error } = await supabase
      .from('clients')
      .update({ branding_config: brandingConfig as any, widget_theme: widgetTheme })
      .eq('id', effectiveClientId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Branding settings saved' });
      freezePreviewUrl();
      setActiveTab('preview');
    }
  };

  // Staff permission: 'edit' can save, 'view' is read-only
  const canEdit = role !== 'staff' || 
    (staffInfo?.permissions?.catalog_access && 
     String(staffInfo.permissions.catalog_access).toLowerCase() === 'edit');

  const embedCode = generateEmbedCode(
    effectiveClientId || '',
    '100%',
    '800px',
    includeSettingsInEmbed ? {
      primaryColor,
      secondaryColor,
      showChatAssistant,
      showComparison,
      showSaveDesign,
      theme: widgetTheme,
    } : undefined,
    allowedDomains
  );

  const basePreviewUrl = generatePreviewUrl(effectiveClientId || '', {
    primaryColor,
    secondaryColor,
    showChatAssistant,
    showComparison,
    showSaveDesign,
    theme: widgetTheme,
  });
  
  const previewUrl = effectiveClientId ? `${basePreviewUrl}&ts=${previewNonce}` : '';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast({ title: 'Copied!', description: 'Embed code copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };


  // Staff guard: Ring OS access (catalog_access) — disabled hides this page entirely
  if (role === 'staff' && !canView(staffInfo?.permissions?.catalog_access)) {
    return <AccessDenied feature="Ring OS Widget" />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Code2 className="h-6 w-6 sm:h-8 sm:w-8" />
          Embed Configurator
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">Customize and embed the ring configurator on your website</p>
      </div>

      <Tabs 
        value={activeTab} 
        onValueChange={(v) => {
          setActiveTab(v);
          if (v === 'preview') {
            freezePreviewUrl();
          }
        }} 
        className="w-full"
      >
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-px">
          <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="ui-options" className="relative rounded-none border-b-2 border-transparent bg-transparent gap-1.5 sm:gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              <Layout className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">UI </span>Options
            </TabsTrigger>
            <TabsTrigger value="steps" className="relative rounded-none border-b-2 border-transparent bg-transparent gap-1.5 sm:gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              <ListOrdered className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Steps</span>
            </TabsTrigger>
            <TabsTrigger value="branding" className="relative rounded-none border-b-2 border-transparent bg-transparent gap-1.5 sm:gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              <Palette className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Branding</span>
            </TabsTrigger>
            <TabsTrigger value="preview" className="relative rounded-none border-b-2 border-transparent bg-transparent gap-1.5 sm:gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Preview</span>
            </TabsTrigger>
            <TabsTrigger value="embed" className="relative rounded-none border-b-2 border-transparent bg-transparent gap-1.5 sm:gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              <Code2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Embed </span>Code
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="steps" className="space-y-4 sm:space-y-6">
          <Card className="p-4 sm:p-6 space-y-4">
            <h3 className="text-base sm:text-lg font-semibold">Step Sequence</h3>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={stepOrder} strategy={verticalListSortingStrategy}>
                <div className="rounded-lg border border-border divide-y divide-border">
                  {stepOrder.map((key, idx) => (
                    <SortableStepRow key={key} id={key} idx={idx} label={RING_STEP_LABELS[key]} disabled={!canEdit} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="rounded-lg border border-border p-3 sm:p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-medium">Show Video First in Carousel</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, the product video appears as the first slide in the Ring OS widget carousel; other images shift by one position. Default keeps the video at the end.
                </p>
              </div>
              <Switch checked={videoFirst} onCheckedChange={setVideoFirst} disabled={!canEdit} />
            </div>

            <div className="rounded-lg border border-border p-3 sm:p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-medium">Click to Continue</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, selecting an option on any Ring OS step moves straight to the next step and the "Next" label is removed from the bottom button. On by default for every account; turn off to restore the Next button flow.
                </p>
              </div>
              <Switch checked={clickToContinue} onCheckedChange={setClickToContinue} disabled={!canEdit} />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={saveSettings} className="flex-1" disabled={!canEdit}>
                {!canEdit ? 'View Only — Contact Admin to Edit' : 'Save Step Sequence'}
              </Button>
              <Button variant="outline" onClick={resetStepOrder} disabled={!canEdit}>
                Reset to Default
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4 sm:space-y-6">
          <Card className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Per-Theme Color Editor */}
            <ThemeColorEditor
              theme={widgetTheme}
              colors={themeColors[widgetTheme] || THEME_COLOR_DEFAULTS[widgetTheme]}
              onChange={(newColors) => setThemeColors(prev => ({ ...prev, [widgetTheme]: newColors }))}
            />

            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Features</h3>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm flex-1">Enable JewlX Agent Button</Label>
                  <Switch checked={showChatAssistant} onCheckedChange={setShowChatAssistant} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm flex-1">Enable Save Design Button</Label>
                  <Switch checked={showSaveDesign} onCheckedChange={setShowSaveDesign} />
                </div>
              </div>
            </div>

            <Button onClick={saveSettings} className="w-full" disabled={!canEdit}>
              {!canEdit ? 'View Only — Contact Admin to Edit' : 'Save Settings'}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="ui-options" className="space-y-4 sm:space-y-6">
          <Card className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-2">Widget UI Theme</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">
                Choose how your ring configurator looks to your customers
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* 24k Carat Jewelers — exclusive theme, ONLY visible to that client */}
                {isTwentyFourKClient(effectiveClientId) && (
                  <div
                    onClick={() => {
                      setWidgetTheme(TWENTYFOURK_THEME_KEY);
                      freezePreviewUrl(TWENTYFOURK_THEME_KEY);
                    }}
                    className={`cursor-pointer rounded-xl border-2 p-3 sm:p-4 transition-all hover:shadow-lg ${
                      widgetTheme === TWENTYFOURK_THEME_KEY
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="aspect-video rounded-lg mb-3 sm:mb-4 flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0A0A0A, #1a1a1a)' }}>
                      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 60%, rgba(212,175,55,0.25), transparent 60%)' }} />
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full shadow-xl" style={{ background: 'linear-gradient(135deg, #D4AF37, #F5EFE0)' }} />
                      <div className="absolute bottom-1.5 sm:bottom-2 left-1.5 right-1.5 sm:left-2 sm:right-2 h-6 sm:h-8 rounded flex items-center justify-center" style={{ background: '#D4AF37' }}>
                        <div className="w-14 sm:w-20 h-1.5 sm:h-2 rounded" style={{ background: '#0A0A0A' }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm sm:text-base">24k Signature</h4>
                        <p className="text-xs text-muted-foreground truncate">Exclusive theme</p>
                      </div>
                      {widgetTheme === TWENTYFOURK_THEME_KEY && (
                        <div className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Standard themes — hidden for the 24k client */}
                {!isTwentyFourKClient(effectiveClientId) && (<>
                {/* UI Option 1 - Luxury */}
                <div
                  onClick={() => {
                    setWidgetTheme('luxury');
                    freezePreviewUrl('luxury');
                  }}
                  className={`cursor-pointer rounded-xl border-2 p-3 sm:p-4 transition-all hover:shadow-lg ${
                    widgetTheme === 'luxury'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="aspect-video rounded-lg bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 mb-3 sm:mb-4 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-amber-500/20 to-transparent" />
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 shadow-xl" />
                    <div className="absolute bottom-1.5 sm:bottom-2 left-1.5 right-1.5 sm:left-2 sm:right-2 h-6 sm:h-8 bg-zinc-800/80 rounded flex items-center justify-center">
                      <div className="w-14 sm:w-20 h-1.5 sm:h-2 bg-amber-500/60 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm sm:text-base">UI Option 1</h4>
                      <p className="text-xs text-muted-foreground truncate">Default luxury theme</p>
                    </div>
                    {widgetTheme === 'luxury' && (
                      <div className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </div>

                {/* UI Option 2 - Modern */}
                <div
                  onClick={() => {
                    setWidgetTheme('modern');
                    freezePreviewUrl('modern');
                  }}
                  className={`cursor-pointer rounded-xl border-2 p-3 sm:p-4 transition-all hover:shadow-lg ${
                    widgetTheme === 'modern'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="aspect-video rounded-lg bg-gradient-to-br from-slate-100 via-white to-slate-50 mb-3 sm:mb-4 flex items-center justify-center relative overflow-hidden border border-slate-200">
                    <div className="absolute inset-0 bg-gradient-to-t from-blue-500/10 to-transparent" />
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 shadow-lg border-2 border-white" />
                    <div className="absolute bottom-1.5 sm:bottom-2 left-1.5 right-1.5 sm:left-2 sm:right-2 h-6 sm:h-8 bg-white/90 rounded shadow-sm flex items-center justify-center">
                      <div className="w-14 sm:w-20 h-1.5 sm:h-2 bg-slate-300 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm sm:text-base">UI Option 2</h4>
                      <p className="text-xs text-muted-foreground truncate">Modern clean theme</p>
                    </div>
                    {widgetTheme === 'modern' && (
                      <div className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </div>

                {/* UI Option 3 - Chat-First */}
                <div
                  onClick={() => {
                    setWidgetTheme('chat');
                    freezePreviewUrl('chat');
                  }}
                  className={`cursor-pointer rounded-xl border-2 p-3 sm:p-4 transition-all hover:shadow-lg ${
                    widgetTheme === 'chat'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="aspect-video rounded-lg bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 mb-3 sm:mb-4 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-blue-500/20 to-transparent" />
                    {/* Chat bubble visual */}
                    <div className="flex flex-col gap-1.5 items-end w-3/4">
                      <div className="w-3/4 h-3 sm:h-4 bg-blue-500/40 rounded-xl rounded-br-sm" />
                      <div className="w-1/2 h-3 sm:h-4 bg-zinc-600/60 rounded-xl rounded-bl-sm self-start" />
                      <div className="w-2/3 h-3 sm:h-4 bg-blue-500/40 rounded-xl rounded-br-sm" />
                    </div>
                    <div className="absolute bottom-1.5 sm:bottom-2 left-1.5 right-1.5 sm:left-2 sm:right-2 h-6 sm:h-8 bg-zinc-800/80 rounded flex items-center px-2">
                      <div className="w-full h-1.5 sm:h-2 bg-zinc-600/40 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm sm:text-base">UI Option 3</h4>
                      <p className="text-xs text-muted-foreground truncate">Chat-first AI builder</p>
                    </div>
                    {widgetTheme === 'chat' && (
                      <div className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </div>

                {/* UI Option 4 - Elegant Gold */}
                <div
                  onClick={() => {
                    setWidgetTheme('elegant');
                    freezePreviewUrl('elegant');
                  }}
                  className={`cursor-pointer rounded-xl border-2 p-3 sm:p-4 transition-all hover:shadow-lg ${
                    widgetTheme === 'elegant'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="aspect-video rounded-lg mb-3 sm:mb-4 flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #FDF8F0, #FAF5ED)' }}>
                    <div className="absolute top-2 left-0 right-0 flex justify-center gap-2">
                      {[1,2,3,4,5].map(n => (
                        <div key={n} className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          n <= 2 ? 'bg-gradient-to-br from-[#C5A55A] to-[#E8D48B] text-white' : 'border border-gray-300 text-gray-400'
                        }`}>{n}</div>
                      ))}
                    </div>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#C5A55A] to-[#E8D48B] shadow-lg mt-2" />
                    <div className="absolute bottom-1.5 sm:bottom-2 left-1.5 right-1.5 sm:left-2 sm:right-2 h-6 sm:h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(to right, #C5A55A, #E8D48B)' }}>
                      <div className="w-14 sm:w-20 h-1.5 sm:h-2 bg-white/60 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm sm:text-base">UI Option 4</h4>
                      <p className="text-xs text-muted-foreground truncate">Elegant gold theme</p>
                    </div>
                    {widgetTheme === 'elegant' && (
                      <div className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </div>
                </>)}
              </div>
            </div>

            {/* Inline Preview */}
            <div>
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold">Preview</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">See how your selected theme looks</p>
                </div>
                <div className="flex items-center gap-1 border rounded-lg p-1">
                  <Button
                    variant={previewMode === 'desktop' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setPreviewMode('desktop')}
                    className="h-8 w-8 p-0"
                  >
                    <Monitor className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={previewMode === 'mobile' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setPreviewMode('mobile')}
                    className="h-8 w-8 p-0"
                  >
                    <Smartphone className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className={`relative rounded-xl border overflow-hidden bg-muted/20 h-[400px] sm:h-[600px] lg:h-[700px] ${previewMode === 'mobile' ? 'flex items-start justify-center bg-muted/40 p-4' : ''}`}>
                {frozenPreviewUrl ? (
                  <>
                    {isPreviewLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                        <div className="animate-spin w-6 h-6 sm:w-8 sm:h-8 border-4 border-primary border-t-transparent rounded-full" />
                      </div>
                    )}
                    <div className={previewMode === 'mobile' ? 'w-[375px] h-full rounded-2xl border-4 border-zinc-800 overflow-hidden shadow-xl' : 'w-full h-full'}>
                      <iframe
                        key={iframeKey}
                        src={frozenPreviewUrl}
                        className="w-full h-full border-0"
                        title="Theme Preview"
                        onLoad={() => setIsPreviewLoading(false)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p className="text-sm">Select a theme to see preview</p>
                  </div>
                )}
              </div>
            </div>

            <Button onClick={saveTheme} disabled={savingTheme || !canEdit} className="w-full">
              {!canEdit ? 'View Only — Contact Admin to Edit' : savingTheme ? 'Saving...' : 'Save Theme'}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="embed" className="space-y-4">
          <Card className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-base sm:text-lg font-semibold">Embed Code</h3>
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    const urlToOpen = frozenPreviewUrl || generatePreviewUrl(effectiveClientId || '', {
                      primaryColor,
                      secondaryColor,
                      showChatAssistant,
                      showComparison,
                      showSaveDesign,
                      theme: widgetTheme,
                    });
                    window.open(urlToOpen, '_blank');
                  }} 
                  variant="outline" 
                  size="sm"
                  className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-none"
                  disabled={!effectiveClientId}
                >
                  <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Test in </span>New Tab
                </Button>
                <Button onClick={copyToClipboard} variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-none">
                  {copied ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>
            
            <div className="space-y-1.5 sm:space-y-2 p-3 sm:p-4 bg-muted/50 rounded-lg border">
              <h4 className="font-semibold text-xs sm:text-sm">✅ Real-Time Sync Enabled</h4>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Your embed automatically syncs with any branding changes you make. No need to update the embed code!
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch checked={includeSettingsInEmbed} onCheckedChange={setIncludeSettingsInEmbed} />
              <Label className="text-xs sm:text-sm">Include current preview settings in embed code</Label>
            </div>
            <Textarea value={embedCode} readOnly rows={6} className="font-mono text-xs sm:text-sm" />



            
            <div className="space-y-2 sm:space-y-3 pt-2">
              <h4 className="font-semibold text-xs sm:text-sm">How to Use:</h4>
              <ol className="text-xs sm:text-sm text-muted-foreground space-y-1.5 sm:space-y-2 list-decimal list-inside">
                <li>Click "Test in New Tab" to verify the configurator works</li>
                <li>Copy the embed code above</li>
                <li>Paste it into your Shopify theme</li>
                <li>Ensure your Shopify store URL and access tokens are configured</li>
                <li>Test the "Add to Cart" button to confirm Shopify integration</li>
              </ol>
            </div>
            
            <div className="space-y-1.5 sm:space-y-2 p-3 sm:p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <h4 className="font-semibold text-xs sm:text-sm text-amber-700 dark:text-amber-400">⚠️ Important Setup Notes</h4>
              <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Your embed works 24/7 without requiring login</li>
                <li>Make sure Shopify integration is configured in Settings</li>
                <li>The "Add to Cart" button redirects to your Shopify checkout</li>
                <li>All branding changes sync in real-time</li>
              </ul>
            </div>
          </Card>

        </TabsContent>

        <TabsContent value="preview" className="space-y-4">
          <Card className="p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Live Preview of Selected Theme</h3>
            <div className="w-full rounded-lg overflow-hidden border-2 border-border relative">
              {activeTab === 'preview' && effectiveClientId && frozenPreviewUrl ? (
                <>
                  {isPreviewLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
                      <p className="text-sm text-muted-foreground">Loading preview...</p>
                    </div>
                  )}
                  <iframe
                    key={iframeKey}
                    src={frozenPreviewUrl}
                    width="100%"
                    className="h-[400px] sm:h-[600px] lg:h-[700px]"
                    style={{ border: 'none' }}
                    title="AI Builder"
                    loading="lazy"
                    onLoad={() => setIsPreviewLoading(false)}
                  />
                </>
              ) : (
                <div className="flex items-center justify-center h-[400px] sm:h-[600px] lg:h-[700px] bg-muted">
                  <p className="text-sm text-muted-foreground text-center px-4">Switch to Preview tab to see your configurator</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
