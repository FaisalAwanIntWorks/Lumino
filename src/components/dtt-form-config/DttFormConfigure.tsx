import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useClientDttFormConfig } from '@/hooks/useClientDttFormConfig';
import { useAllDiamondFormOptions, type AllDiamondFormOptions } from '@/hooks/useAllDiamondFormOptions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_DTT_FORM_CONTENT, type ClientDttFormConfig, type DttFormContent } from '@/hooks/useClientDttFormConfig';
import { DEFAULT_DTT_STEP_HEADINGS } from '@/components/diamonds-form/step-headings';
import { getDiamondFormImageUrl } from '@/lib/diamond-form-cdn';
import { mergeStepOrder } from '@/components/diamonds-form/step-order';
import {
  cleanMetalKaratsConfig,
  cleanTwoToneCombosConfig,
  getMetalKaratVariants,
  getTwoToneCombos,
  toMetalPriceMap,
  type MetalKaratsConfig,
  type TwoToneCombosConfig,
} from '@/lib/dtt-metal-karats';
import {
  cleanTimelineOptionsConfig,
  DEFAULT_DTT_TIMELINE_OPTIONS,
  MAX_DTT_TIMELINE_OPTIONS,
  type DttTimelineOption,
} from '@/lib/dtt-timeline-options';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Loader2, Save, ChevronUp, ChevronDown, ImagePlus, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
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
import { isGlassQuoteEstimator, QUOTE_ESTIMATOR_THEME_DEFAULTS, QUOTE_THEMES, QUOTE_THEME_META, DEFAULT_QUOTE_THEME, type QuoteTheme } from '@/lib/quote-estimator-theme';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QuoteEstimatorDesignWorkspace, QuoteEstimatorThankYouPreview } from './QuoteEstimatorDesignWorkspace';
import { getQuoteStorage, QUOTE_VERSION_META, type QuoteVersion } from '@/lib/quote-estimator-version';
import { quoteV3StockImageUrl, usesV3StockImages } from '@/lib/quote-v3-assets';
import { QuoteEstimatorBasicsColors } from './QuoteEstimatorBasicsColors';
import { QuoteDiamondConfigurationTab } from './QuoteDiamondConfigurationTab';
import { QuoteGemstonePickerCard } from './QuoteGemstonePickerCard';
import { isQuoteDiamondPickerClient } from '@/lib/quote-estimator-diamonds';
import { DEFAULT_CLAIM_COPY, defaultClaimFooterNote } from '@/components/diamonds-form/ClaimStep';

/**
 * Editable summary / thank-you / Design Credit lines and their built-in wording. The Configure box shows
 * the built-in text as real text when nothing is stored; saving keeps three
 * states — unset (built-in), empty (line hidden) and custom.
 */
const claimCopyDefaults = (creditHoldDays: number): Array<[keyof DttFormContent, string]> => [
  // Content tab: estimate summary + thank-you screen wording.
  ['summaryTitle', DEFAULT_DTT_FORM_CONTENT.summaryTitle],
  ['summaryDisclaimer', DEFAULT_DTT_FORM_CONTENT.summaryDisclaimer],
  ['thankYouTitle', DEFAULT_DTT_FORM_CONTENT.thankYouTitle],
  ['thankYouMessage', DEFAULT_DTT_FORM_CONTENT.thankYouMessage],
  ['thankYouNaturalNote', DEFAULT_DTT_FORM_CONTENT.thankYouNaturalNote],
  ['thankYouLabNote', DEFAULT_DTT_FORM_CONTENT.thankYouLabNote],
  ['incentiveText', DEFAULT_DTT_FORM_CONTENT.incentiveText],
  // Design Credit tab.
  ['claimCreditEyebrow', DEFAULT_CLAIM_COPY.creditEyebrow],
  ['claimCreditHeadline', DEFAULT_CLAIM_COPY.creditHeadline],
  ['claimCreditHoldLine', DEFAULT_CLAIM_COPY.creditHoldLine],
  ['claimPhoneLabel', DEFAULT_CLAIM_COPY.phoneLabel],
  ['claimButtonLabel', DEFAULT_CLAIM_COPY.buttonLabel],
  ['claimPhoneConfirmNote', DEFAULT_CLAIM_COPY.phoneConfirmNote],
  ['claimReassuranceNote', DEFAULT_CLAIM_COPY.reassuranceNote],
  ['claimFollowUpNote', DEFAULT_CLAIM_COPY.followUpNote],
  ['claimSmsDisclaimer', DEFAULT_CLAIM_COPY.smsDisclaimer],
  ['claimFooterNote', defaultClaimFooterNote(creditHoldDays)],
];

/** Per-option, per-client override row as the editor holds it (mirrors the override tables). */
interface OptionOverride {
  is_enabled: boolean;
  custom_image_url: string | null;
  custom_price: number | null;
  /** Client's own display name for the option; null = stock name. */
  custom_name: string | null;
}
const EMPTY_OVERRIDE: OptionOverride = { is_enabled: true, custom_image_url: null, custom_price: null, custom_name: null };
/** Merge one field into an option's override without dropping the others. */
const withOverride = (existing: OptionOverride | undefined, patch: Partial<OptionOverride>): OptionOverride => ({ ...EMPTY_OVERRIDE, ...existing, ...patch });
/** Longest option display name the editor accepts. */
const OPTION_NAME_MAX = 80;

interface Props {
  clientId: string | null;
  /**
   * Which Quote Estimator version this panel edits. Every ordinary account is
   * a V2-storage account; the Sandbox lab mounts one panel per version (see
   * QuoteEstimatorVersionPanels), which also owns switching the live version.
   */
  version?: QuoteVersion;
  /** Reports unsaved edits so the surrounding panel can guard version switches. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Fired after a successful "Save Configuration" (the docked preview reloads). */
  onSaved?: () => void;
  /** `split` = a live preview sits beside this panel, so inline previews stack instead of splitting again. */
  layout?: 'full' | 'split';
}

/** Configure tabs each version actually uses. V1 · Classic has no claim screen, so no glass design / credit tabs. */
const VERSION_SECTIONS: Record<QuoteVersion, string[]> = {
  v1: ['basics', 'steps', 'options', 'diamonds', 'content'],
  v2: ['basics', 'steps', 'options', 'diamonds', 'content', 'design', 'credit'],
  v3: ['basics', 'steps', 'options', 'diamonds', 'content', 'design', 'credit'],
};
const SECTION_LABELS: Record<string, string> = {
  basics: 'Basics',
  steps: 'Steps',
  options: 'Options & Pricing',
  // Allowlisted accounts only (see isQuoteDiamondPickerClient): the "mini Nivoda" stone picker.
  diamonds: 'Diamond Configuration',
  content: 'Content',
  design: 'Thank-you Design',
  credit: 'Design Credit',
};

// Steps the client can toggle/reorder (welcome/contact/summary are always on)
const CONFIGURABLE_STEPS: { key: string; label: string }[] = [
  { key: 'nature', label: 'Diamond Nature' },
  { key: 'shape', label: 'Diamond Shape' },
  { key: 'size', label: 'Diamond Size' },
  { key: 'quality', label: 'Diamond Quality' },
  { key: 'setting', label: 'Setting Style' },
  { key: 'holder', label: 'Diamond Holder' },
  { key: 'band', label: 'Band Type' },
  { key: 'band_width', label: 'Band Width' },
  { key: 'metal', label: 'Ring Metal' },
  { key: 'personalization', label: 'Personalization' },
  { key: 'inspiration', label: 'Inspiration & Details' },
  { key: 'ring_size', label: 'Ring Size' },
  { key: 'timeline', label: 'Timeline' },
];

// Step key → option table, for the built-in CDN image fallback (same lookup
// the public form uses when a DB row carries no image_url).
const STEP_TO_TABLE: Record<string, string> = {
  nature: 'diamond_nature_options',
  shape: 'diamond_shape_options',
  size: 'diamond_size_options',
  quality: 'diamond_quality_options',
  setting: 'ring_setting_options',
  holder: 'diamond_holder_options',
  band: 'band_type_options',
  band_width: 'band_width_options',
  metal: 'ring_metal_options',
  personalization: 'personalization_options',
};

/** Everything "Save Configuration" writes, as the editable draft. */
interface ConfigDraft {
  colors: { background: string; tabBorder: string; fontColor: string; imageBg: string; submitButtonBg: string; submitButtonText: string; highlight: string };
  enabledSteps: Record<string, boolean>;
  stepOrder: string[];
  submissionMode: 'deposit' | 'contact';
  depositAmount: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  content: DttFormContent;
  qualityScoring: boolean;
  blockDisposable: boolean;
  dedupeWindow: string;
}

/**
 * The draft a saved row hydrates to (defaults when there is no row yet). Used
 * both to fill the editor and as the clean reference for unsaved-edit tracking,
 * so the two can never disagree.
 */
function draftFromConfig(config: ClientDttFormConfig | null | undefined): ConfigDraft {
  const c = config?.form_colors || {};
  const enabledSteps: Record<string, boolean> = {};
  CONFIGURABLE_STEPS.forEach(s => { enabledSteps[s.key] = config ? config.enabled_steps?.[s.key] !== false : true; });
  const defaultOrder = CONFIGURABLE_STEPS.map(s => s.key);
  return {
    colors: {
      background: c.background || '', tabBorder: c.tabBorder || '', fontColor: c.fontColor || '',
      imageBg: c.imageBg || '', submitButtonBg: c.submitButtonBg || '', submitButtonText: c.submitButtonText || '',
      highlight: c.highlight || '',
    },
    enabledSteps,
    // Steps added since the client last saved slot in at their default
    // position rather than at the end (see mergeStepOrder).
    stepOrder: config && Array.isArray(config.step_order) && config.step_order.length
      ? mergeStepOrder(config.step_order, defaultOrder)
      : defaultOrder,
    submissionMode: config?.submission_mode || 'contact',
    depositAmount: config?.deposit_amount != null ? String(config.deposit_amount) : '',
    welcomeTitle: config?.welcome_title ?? '',
    welcomeSubtitle: config?.welcome_subtitle ?? '',
    content: (config?.form_content as DttFormContent) || {},
    qualityScoring: config ? config.enable_lead_quality_scoring !== false : true,
    blockDisposable: config?.block_disposable_email === true,
    dedupeWindow: String(config?.dedupe_window_minutes ?? 10),
  };
}

const serializeDraft = (d: ConfigDraft) =>
  JSON.stringify([d.colors, d.enabledSteps, d.stepOrder, d.submissionMode, d.depositAmount, d.welcomeTitle, d.welcomeSubtitle, d.content, d.qualityScoring, d.blockDisposable, d.dedupeWindow]);

// Option-editor mapping — only steps backed by option tables
const OPTION_STEPS: { key: string; label: string }[] = CONFIGURABLE_STEPS.filter(s =>
  ['nature','shape','size','quality','setting','holder','band','band_width','metal','personalization'].includes(s.key)
);

function ColorField({ label, tooltip, value, onChange, placeholder }: { label: string; tooltip: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm">{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="inline-flex text-muted-foreground hover:text-foreground"><Info className="h-3.5 w-3.5" /></button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex gap-2 items-center">
        <Input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-10 h-10 p-1 cursor-pointer" />
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="flex-1" />
      </div>
    </div>
  );
}

// A single draggable + reorderable step row (drag handle, up/down, enable toggle).
function SortableStepRow({ stepKey, label, index, total, enabled, onToggle, onMove }: {
  stepKey: string;
  label: string;
  index: number;
  total: number;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stepKey });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between py-2.5 bg-card">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Drag to reorder ${label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-xs w-6 text-muted-foreground">{index + 1}.</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === total - 1} onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></Button>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}

export function DttFormConfigure({ clientId, version: versionProp, onDirtyChange, onSaved, layout = 'full' }: Props) {
  const sandbox = isGlassQuoteEstimator(clientId);
  // Only the Sandbox lab has separate V1 / V3 storage; everyone else always edits V2 storage.
  const version: QuoteVersion = sandbox && versionProp ? versionProp : 'v2';
  const split = layout === 'split';
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: config, isLoading: configLoading } = useClientDttFormConfig(clientId, version);
  const { data: allOptions, isLoading: optionsLoading } = useAllDiamondFormOptions(clientId ?? undefined, version);
  // Stock names without any per-client override: the name box falls back to
  // these when cleared and skips the write when the client retypes the default.
  const { data: defaultOptions } = useAllDiamondFormOptions(undefined, version);
  const { config: configTable, overrides: overrideTable } = getQuoteStorage(clientId, version);

  const [colors, setColors] = useState({ background: '', tabBorder: '', fontColor: '', imageBg: '', submitButtonBg: '', submitButtonText: '', highlight: '' });
  const [enabledSteps, setEnabledSteps] = useState<Record<string, boolean>>({});
  const [stepOrder, setStepOrder] = useState<string[]>(CONFIGURABLE_STEPS.map(s => s.key));
  const [submissionMode, setSubmissionMode] = useState<'deposit' | 'contact'>('contact');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [welcomeTitle, setWelcomeTitle] = useState('');
  const [welcomeSubtitle, setWelcomeSubtitle] = useState('');
  // Editable Summary + Thank-You copy (empty field = use built-in default).
  const [content, setContent] = useState<DttFormContent>({});
  const [saving, setSaving] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState('basics');

  // Per-option overrides state — indexed by `${step_type}:${option_id}`
  const [overrides, setOverrides] = useState<Record<string, OptionOverride>>({});
  // Per-option price input drafts (raw strings while typing) — same key shape
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  // Per-option name input drafts (raw strings while typing) — same key shape
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  // Lead quality gate (zero-cost: offline validation, no SMS/OTP).
  const [qualityScoring, setQualityScoring] = useState(true);
  const [blockDisposable, setBlockDisposable] = useState(false);
  const [dedupeWindow, setDedupeWindow] = useState('10');

  const invalidateOptionQueries = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['all-diamond-form-options', clientId, version] }),
      qc.invalidateQueries({ queryKey: ['diamond-form-client-options', clientId, version] }),
    ]);
  };

  // Hydrate the draft from the saved row (or the defaults when no row exists yet).
  useEffect(() => {
    if (configLoading) return;
    const d = draftFromConfig(config);
    setColors(d.colors);
    setEnabledSteps(d.enabledSteps);
    setStepOrder(d.stepOrder);
    setSubmissionMode(d.submissionMode);
    setDepositAmount(d.depositAmount);
    setWelcomeTitle(d.welcomeTitle);
    setWelcomeSubtitle(d.welcomeSubtitle);
    setContent(d.content);
    setQualityScoring(d.qualityScoring);
    setBlockDisposable(d.blockDisposable);
    setDedupeWindow(d.dedupeWindow);
    setSavedSnapshot(null);
  }, [config, configLoading, version]);

  // Unsaved-edit tracking: the draft is dirty when it differs from what the
  // saved row hydrates to. Derived (not captured in an effect) so it can never
  // compare against a pre-hydration snapshot and flag edits that were not made.
  const snapshot = serializeDraft({ colors, enabledSteps, stepOrder, submissionMode, depositAmount, welcomeTitle, welcomeSubtitle, content, qualityScoring, blockDisposable, dedupeWindow });
  const configSnapshot = useMemo(() => serializeDraft(draftFromConfig(config)), [config]);
  // What "Save Configuration" last wrote: keeps the panel clean until the row refetches.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const isDirty = !configLoading && snapshot !== configSnapshot && snapshot !== savedSnapshot;
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // Load existing overrides for this client (once options are known)
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    setOverrides({});
    (async () => {
      const { data } = await (supabase as any)
        .from(overrideTable)
        .select('step_type, option_id, is_enabled, custom_image_url, custom_price, custom_name')
        .eq('client_id', clientId);
      const map: Record<string, OptionOverride> = {};
      (data || []).forEach((r: any) => {
        map[`${r.step_type}:${r.option_id}`] = {
          is_enabled: r.is_enabled ?? true,
          custom_image_url: r.custom_image_url ?? null,
          custom_price: r.custom_price != null ? Number(r.custom_price) : null,
          custom_name: typeof r.custom_name === 'string' && r.custom_name.trim() ? r.custom_name.trim() : null,
        };
      });
      if (active) { setOverrides(map); setPriceDrafts({}); setNameDrafts({}); }
    })();
    return () => { active = false; };
  }, [clientId, overrideTable]);

  const moveStep = (key: string, dir: -1 | 1) => {
    setStepOrder(prev => {
      const idx = prev.indexOf(key);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleStepDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setStepOrder(prev => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const saveConfig = async () => {
    if (!clientId) return;
    setSaving(true);
    try {
      const cleanColors: Record<string, string> = {};
      Object.entries(colors).forEach(([k, v]) => { if (v) cleanColors[k] = v; });
      // Only persist copy the client actually filled in — empty fields fall
      // back to the built-in wording at render time.
      const cleanContent: Record<string, any> = {};
      Object.entries(content).forEach(([k, v]) => {
        if (k === 'stepHeadings' || k === 'metalKarats' || k === 'twoToneCombos' || k === 'timelineOptions') return; // objects — handled separately below
        if (k === 'coloredDiamondColors') return; // retired V3 colour screen: a list saved earlier is dropped on the next save
        if (v === undefined || v === null || v === '') return;
        // Numbers and objects (theme tokens, contact tiles) must be stored as
        // they are — stringifying them used to save "[object Object]".
        if (typeof v === 'number') { if (Number.isFinite(v)) cleanContent[k] = v; return; }
        // Switches are stored as real booleans — a stringified "false" would read as on.
        if (typeof v === 'boolean') { cleanContent[k] = v; return; }
        if (typeof v === 'object') {
          const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) => val !== undefined && val !== '');
          if (entries.length) cleanContent[k] = Object.fromEntries(entries);
          return;
        }
        if (String(v).trim()) cleanContent[k] = String(v).trim();
      });
      // Theme 1 is the default, so only Theme 2 is written down.
      if (cleanContent.quoteTheme !== 'glass') delete cleanContent.quoteTheme;
      // The strike-through is on by default, so only "off" is written down.
      if (cleanContent.claimStrikeThroughTotal !== false) delete cleanContent.claimStrikeThroughTotal;
      // The "With your credit" price is on by default, so only "off" is written down.
      if (cleanContent.claimShowCreditPrice !== false) delete cleanContent.claimShowCreditPrice;
      // Design Credit card lines keep three states: unset → built-in wording,
      // "" → that line is hidden, anything else → shown as typed. Text equal to
      // the built-in wording is stored as unset so it keeps following the default.
      claimCopyDefaults(content.creditHoldDays ?? 7).forEach(([key, builtIn]) => {
        const raw = content[key];
        if (raw === undefined || raw === null) { delete cleanContent[key]; return; }
        const text = String(raw).trim();
        if (text === builtIn.trim()) { delete cleanContent[key]; return; }
        cleanContent[key] = text;
      });
      // Per-step heading overrides: keep only non-empty title/subtitle per step.
      if (content.stepHeadings) {
        const sh: Record<string, { title?: string; subtitle?: string }> = {};
        Object.entries(content.stepHeadings).forEach(([key, val]) => {
          // The timeline step always uses its built-in wording (no editor).
          if (key === 'timeline') return;
          const entry: { title?: string; subtitle?: string } = {};
          const t = val?.title?.trim();
          const s = val?.subtitle?.trim();
          if (t) entry.title = t;
          if (s) entry.subtitle = s;
          if (Object.keys(entry).length) sh[key] = entry;
        });
        if (Object.keys(sh).length) cleanContent.stepHeadings = sh;
      }
      // Ring Metal karat variants: persist only what differs from the defaults.
      const mk = cleanMetalKaratsConfig(content.metalKarats);
      if (mk) cleanContent.metalKarats = mk;
      // Two Tone metal combinations: same rule.
      const tt = cleanTwoToneCombosConfig(content.twoToneCombos, metalPrices);
      if (tt) cleanContent.twoToneCombos = tt;
      // Timeline choices: stored only when they differ from the built-ins.
      const tl = cleanTimelineOptionsConfig(content.timelineOptions);
      if (tl) cleanContent.timelineOptions = tl;
      const payload = {
        client_id: clientId,
        form_colors: Object.keys(cleanColors).length ? cleanColors : null,
        form_content: Object.keys(cleanContent).length ? cleanContent : null,
        enabled_steps: enabledSteps,
        step_order: stepOrder,
        submission_mode: submissionMode,
        deposit_amount: submissionMode === 'deposit' && depositAmount ? Number(depositAmount) : null,
        welcome_title: welcomeTitle.trim() || null,
        welcome_subtitle: welcomeSubtitle.trim() || null,
        onboarding_completed: true,
        enable_lead_quality_scoring: qualityScoring,
        block_disposable_email: blockDisposable,
        dedupe_window_minutes: Math.max(0, Math.min(1440, Number(dedupeWindow) || 0)),
      };
      const { error } = await (supabase as any)
        .from(configTable)
        .upsert(payload, { onConflict: 'client_id' });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['client-dtt-form-config', clientId, version] });
      setSavedSnapshot(snapshot);
      onSaved?.();
      toast({ title: 'Saved!', description: 'Quote Estimator Form configuration updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleOption = async (stepType: string, optionId: string, isEnabled: boolean) => {
    if (!clientId) return;
    const key = `${stepType}:${optionId}`;
    const existing = overrides[key];
    setOverrides(p => ({ ...p, [key]: withOverride(existing, { is_enabled: isEnabled }) }));
    const { error } = await (supabase as any)
      .from(overrideTable)
      .upsert(
        { client_id: clientId, step_type: stepType, option_id: optionId, is_enabled: isEnabled },
        { onConflict: 'client_id,step_type,option_id' },
      );
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else invalidateOptionQueries();
  };

  const bulkToggleStep = async (stepType: string, opts: any[], isEnabled: boolean) => {
    if (!clientId || !opts.length) return;
    setOverrides(p => {
      const next = { ...p };
      opts.forEach(o => {
        const k = `${stepType}:${o.id}`;
        next[k] = withOverride(next[k], { is_enabled: isEnabled });
      });
      return next;
    });
    const rows = opts.map(o => ({ client_id: clientId, step_type: stepType, option_id: o.id, is_enabled: isEnabled }));
    const { error } = await (supabase as any)
      .from(overrideTable)
      .upsert(rows, { onConflict: 'client_id,step_type,option_id' });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      invalidateOptionQueries();
      toast({ title: isEnabled ? 'All selected' : 'All cleared', description: `${opts.length} options updated.` });
    }
  };

  const uploadOptionImage = async (stepType: string, optionId: string, file: File) => {
    if (!clientId) return;
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `dtt-overrides/${clientId}/${version}/${stepType}/${optionId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('diamond-form-assets').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('diamond-form-assets').getPublicUrl(path);
      const url = pub.publicUrl;
      const key = `${stepType}:${optionId}`;
      const existing = overrides[key];
      setOverrides(p => ({ ...p, [key]: withOverride(existing, { custom_image_url: url }) }));
      const { error } = await (supabase as any)
        .from(overrideTable)
        .upsert(
          { client_id: clientId, step_type: stepType, option_id: optionId, custom_image_url: url },
          { onConflict: 'client_id,step_type,option_id' },
        );
      if (error) throw error;
      invalidateOptionQueries();
      toast({ title: 'Uploaded!', description: 'Image override saved.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Upload failed', variant: 'destructive' });
    }
  };

  // Save a per-client price for one option. Empty input clears the override,
  // reverting the option to its default (DTT) price. Saves immediately on blur.
  const savePrice = async (stepType: string, optionId: string, raw: string) => {
    if (!clientId) return;
    const key = `${stepType}:${optionId}`;
    const trimmed = raw.trim();
    const num = trimmed === '' ? null : Number(trimmed);
    if (num !== null && (!Number.isFinite(num) || num < 0)) {
      toast({ title: 'Invalid price', description: 'Enter a number of 0 or more.', variant: 'destructive' });
      return;
    }
    const existing = overrides[key];
    // No change — skip the write (avoids a needless row + cache invalidation on tab-out).
    if ((existing?.custom_price ?? null) === num) return;
    setOverrides(p => ({ ...p, [key]: withOverride(existing, { custom_price: num }) }));
    // Drop the draft when cleared so the field re-derives the default price.
    if (num === null) setPriceDrafts(p => { const n = { ...p }; delete n[key]; return n; });
    const { error } = await (supabase as any)
      .from(overrideTable)
      .upsert(
        { client_id: clientId, step_type: stepType, option_id: optionId, custom_price: num },
        { onConflict: 'client_id,step_type,option_id' },
      );
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else invalidateOptionQueries();
  };

  // Save a per-client display name for one option. Empty input (or the stock
  // name typed back in) clears the override so the option shows its default
  // name again. Only the label changes: the option's stable `option_value`
  // (what leads, CRM sync and emails key on) is never touched.
  const saveName = async (stepType: string, optionId: string, raw: string, defaultName: string) => {
    if (!clientId) return;
    const key = `${stepType}:${optionId}`;
    const trimmed = raw.trim().slice(0, OPTION_NAME_MAX);
    const next = trimmed === '' || trimmed === defaultName ? null : trimmed;
    const existing = overrides[key];
    // Drop the draft either way so the field re-derives from saved state.
    setNameDrafts(p => { const n = { ...p }; delete n[key]; return n; });
    if ((existing?.custom_name ?? null) === next) return;
    setOverrides(p => ({ ...p, [key]: withOverride(existing, { custom_name: next }) }));
    const { error } = await (supabase as any)
      .from(overrideTable)
      .upsert(
        { client_id: clientId, step_type: stepType, option_id: optionId, custom_name: next },
        { onConflict: 'client_id,step_type,option_id' },
      );
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else invalidateOptionQueries();
  };

  // Update a per-step heading/sub-heading override in local content state.
  const setStepHeading = (stepKey: string, field: 'title' | 'subtitle', value: string) => {
    setContent(p => ({
      ...p,
      stepHeadings: {
        ...(p.stepHeadings || {}),
        [stepKey]: { ...(p.stepHeadings?.[stepKey] || {}), [field]: value },
      },
    }));
  };

  // Heading + sub-heading inputs for one step (placeholders show the built-in wording).
  const stepHeadingFields = (stepKey: string) => (
    <div className="grid grid-cols-1 gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Step Heading</Label>
        <Input
          value={content.stepHeadings?.[stepKey]?.title ?? ''}
          onChange={e => setStepHeading(stepKey, 'title', e.target.value)}
          placeholder={DEFAULT_DTT_STEP_HEADINGS[stepKey]?.title || 'Heading'}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Step Sub-heading</Label>
        <Input
          value={content.stepHeadings?.[stepKey]?.subtitle ?? ''}
          onChange={e => setStepHeading(stepKey, 'subtitle', e.target.value)}
          placeholder={DEFAULT_DTT_STEP_HEADINGS[stepKey]?.subtitle || 'Optional sub-heading'}
          className="h-8 text-sm"
        />
      </div>
    </div>
  );

  // Ring Metal karat variants — toggle / price live in `content.metalKarats`
  // and are persisted with "Save Configuration".
  const setKaratOverride = (metal: string, karat: string, patch: { enabled?: boolean; price?: number }) => {
    setContent(p => {
      const mk: MetalKaratsConfig = { ...(p.metalKarats || {}) };
      mk[metal] = { ...(mk[metal] || {}), [karat]: { ...(mk[metal]?.[karat] || {}), ...patch } };
      return { ...p, metalKarats: mk };
    });
  };
  const bulkToggleKarats = (metal: string, enabled: boolean) => {
    setContent(p => {
      const mk: MetalKaratsConfig = { ...(p.metalKarats || {}) };
      const row = { ...(mk[metal] || {}) };
      getMetalKaratVariants(metal).forEach(v => { row[v.value] = { ...(row[v.value] || {}), enabled }; });
      mk[metal] = row;
      return { ...p, metalKarats: mk };
    });
  };
  // Raw text while typing a karat price — keyed `${metal}:${karat}`.
  const [karatPriceDrafts, setKaratPriceDrafts] = useState<Record<string, string>>({});
  const commitKaratPrice = (metal: string, karat: string, raw: string) => {
    const key = `${metal}:${karat}`;
    setKaratPriceDrafts(p => { const n = { ...p }; delete n[key]; return n; });
    const trimmed = raw.trim();
    if (trimmed === '') {
      // Cleared → back to the default price.
      setContent(p => {
        const mk: MetalKaratsConfig = { ...(p.metalKarats || {}) };
        if (mk[metal]?.[karat]) {
          const { price: _drop, ...rest } = mk[metal][karat];
          mk[metal] = { ...mk[metal], [karat]: rest };
        }
        return { ...p, metalKarats: mk };
      });
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      toast({ title: 'Invalid price', description: 'Enter a number of 0 or more.', variant: 'destructive' });
      return;
    }
    setKaratOverride(metal, karat, { price: num });
  };

  // Two Tone metal combinations — same storage rules as the karats above.
  const setComboOverride = (combo: string, patch: { enabled?: boolean; price?: number }) => {
    setContent(p => {
      const tt: TwoToneCombosConfig = { ...(p.twoToneCombos || {}) };
      tt[combo] = { ...(tt[combo] || {}), ...patch };
      return { ...p, twoToneCombos: tt };
    });
  };
  const bulkToggleCombos = (enabled: boolean) => {
    setContent(p => {
      const tt: TwoToneCombosConfig = { ...(p.twoToneCombos || {}) };
      getTwoToneCombos().forEach(c => { tt[c.value] = { ...(tt[c.value] || {}), enabled }; });
      return { ...p, twoToneCombos: tt };
    });
  };
  const [comboPriceDrafts, setComboPriceDrafts] = useState<Record<string, string>>({});
  const commitComboPrice = (combo: string, raw: string) => {
    setComboPriceDrafts(p => { const n = { ...p }; delete n[combo]; return n; });
    const trimmed = raw.trim();
    if (trimmed === '') {
      setContent(p => {
        const tt: TwoToneCombosConfig = { ...(p.twoToneCombos || {}) };
        if (tt[combo]) {
          const { price: _drop, ...rest } = tt[combo];
          tt[combo] = rest;
        }
        return { ...p, twoToneCombos: tt };
      });
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      toast({ title: 'Invalid price', description: 'Enter a number of 0 or more.', variant: 'destructive' });
      return;
    }
    setComboOverride(combo, { price: num });
  };

  // Timeline choices — the step has no option table, so the whole list (label,
  // price, on/off, order) lives in `content.timelineOptions` and is persisted
  // with "Save Configuration". No saved list means the built-in choices.
  const timelineRows: DttTimelineOption[] = Array.isArray(content.timelineOptions)
    ? content.timelineOptions
    : DEFAULT_DTT_TIMELINE_OPTIONS;
  // Raw text while typing a timeline price — keyed by row index.
  const [timelinePriceDrafts, setTimelinePriceDrafts] = useState<Record<number, string>>({});
  const updateTimelineRows = (fn: (rows: DttTimelineOption[]) => DttTimelineOption[]) => {
    setContent(p => ({
      ...p,
      timelineOptions: fn((Array.isArray(p.timelineOptions) ? p.timelineOptions : DEFAULT_DTT_TIMELINE_OPTIONS).map(o => ({ ...o }))),
    }));
  };
  const patchTimelineRow = (idx: number, patch: Partial<DttTimelineOption>) =>
    updateTimelineRows(rows => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addTimelineRow = () => {
    setTimelinePriceDrafts({});
    updateTimelineRows(rows => [...rows, { value: '', label: '', price: 0 }]);
  };
  const removeTimelineRow = (idx: number) => {
    setTimelinePriceDrafts({});
    updateTimelineRows(rows => rows.filter((_, i) => i !== idx));
  };
  const resetTimelineRows = () => {
    setTimelinePriceDrafts({});
    setContent(p => {
      const { timelineOptions: _drop, ...rest } = p;
      return rest;
    });
  };
  const commitTimelinePrice = (idx: number, raw: string) => {
    setTimelinePriceDrafts(p => { const n = { ...p }; delete n[idx]; return n; });
    const trimmed = raw.trim();
    const num = trimmed === '' ? 0 : Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      toast({ title: 'Invalid price', description: 'Enter a number of 0 or more.', variant: 'destructive' });
      return;
    }
    patchTimelineRow(idx, { price: num });
  };

  const optionsByStep = useMemo(() => allOptions || ({} as any), [allOptions]);

  // Effective (default or client-overridden) price per metal — the Two Tone
  // combinations default to the sum of their two metals' prices.
  const metalPrices = useMemo(() => {
    const metals: any[] = (optionsByStep as any).metal || [];
    return toMetalPriceMap(metals.map(o => {
      const ov = overrides[`metal:${o.id}`];
      return { option_value: o.option_value, price: ov?.custom_price != null ? ov.custom_price : (o.price ?? 0) };
    }));
  }, [optionsByStep, overrides]);

  // Only configurable keys, in the current saved order — drives both the
  // sortable id list and the rendered rows so they always stay in sync.
  const orderedStepKeys = useMemo(
    () => stepOrder.filter(k => CONFIGURABLE_STEPS.some(s => s.key === k)),
    [stepOrder],
  );

  // Tabbed workspace (Basics / Steps / Options & Pricing / Content /
  // Thank-you Design / Design Credit) for every account. Each Sandbox version
  // only lists the tabs its form actually uses (see VERSION_SECTIONS).
  const workspace = true;
  const sections = VERSION_SECTIONS[version].filter(s => s !== 'diamonds' || isQuoteDiamondPickerClient(clientId));
  const showSection = (section: string) => sections.includes(section) && workspaceTab === section;
  // Theme 1 · Classic / Theme 2 · Glass. Saved with "Save Configuration" and
  // live on the website straight away. The Sandbox lab keeps its version
  // buttons instead (its V2 is always the glass skin).
  const editorTheme: QuoteTheme = content.quoteTheme === 'glass' ? 'glass' : DEFAULT_QUOTE_THEME;
  const liveTheme: QuoteTheme = config?.form_content?.quoteTheme === 'glass' ? 'glass' : DEFAULT_QUOTE_THEME;
  // Glass design cards live on the "Thank-you Design" tab. They only affect
  // Theme 2, so a Theme 1 account can set them up before switching.
  const showGlassDesign = workspace && showSection('design');
  // Design Credit card wording has its own tab, gated like the glass design.
  const showCreditTab = workspace && showSection('credit');

  return (
    <div className={`${split ? 'w-full min-w-0' : 'max-w-7xl mx-auto'} space-y-6`}>
      {(configLoading || optionsLoading) ? <p className="text-sm text-muted-foreground">Loading {sandbox ? `${QUOTE_VERSION_META[version].label} ` : ''}settings…</p> : <>
      <Tabs value={workspaceTab} onValueChange={setWorkspaceTab} className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max justify-start">
            {sections.map(s => <TabsTrigger key={s} value={s}>{SECTION_LABELS[s]}</TabsTrigger>)}
          </TabsList>
        </div>
      </Tabs>
      {!sandbox && showSection('basics') && (
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Form Theme</h3>
            <p className="text-xs text-muted-foreground">
              Live on your website: {QUOTE_THEME_META[liveTheme].label} · {QUOTE_THEME_META[liveTheme].title}.
              Pick a theme and press "Save Configuration" — your embed URL switches to it automatically, no code changes needed. Theme 2's own look, credit and contact tiles are on the "Thank-you Design" tab.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QUOTE_THEMES.map(t => {
              const meta = QUOTE_THEME_META[t];
              const selected = editorTheme === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setContent(p => ({ ...p, quoteTheme: t }))}
                  aria-pressed={selected}
                  className={`rounded-lg border p-4 text-left transition-colors ${selected ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{meta.label} · {meta.title}</span>
                    {liveTheme === t && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">Live</span>}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{meta.description}</span>
                </button>
              );
            })}
          </div>
          {editorTheme === 'glass' && (
            <p className="text-xs text-muted-foreground">
              Theme 2 uses the same steps, options, prices and content as Theme 1. Its own appearance, credit and contact-tile settings are on the "Thank-you Design" tab.
            </p>
          )}
          {editorTheme !== liveTheme && <p className="text-xs font-medium text-amber-600">Unsaved theme change — press "Save Configuration" to make it live.</p>}
        </Card>
      )}
      {/* Colors */}
      {showSection('basics') && <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Form Colors</h3>
          <p className="text-xs text-muted-foreground">Customize the appearance of your public Quote Estimator Form.</p>
        </div>
        <QuoteEstimatorBasicsColors
          version={version}
          stack={split}
          colors={colors as any}
          content={content}
          onColorsChange={patch => setColors(p => ({ ...p, ...patch }))}
          onContentChange={patch => setContent(p => ({ ...p, ...patch }))}
        />
      </Card>}

      {/* Welcome screen copy (V3 · Atelier opens straight on its first stage, so it has no welcome screen) */}
      {showSection('basics') && version !== 'v3' && <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Welcome Screen</h3>
          <p className="text-xs text-muted-foreground">The headline and tagline customers see before they start. Leave a field empty to use the default wording.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Headline</Label>
            <Input
              value={welcomeTitle}
              onChange={e => setWelcomeTitle(e.target.value)}
              placeholder="Let's build your Ring!"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Tagline</Label>
            <Input
              value={welcomeSubtitle}
              onChange={e => setWelcomeSubtitle(e.target.value)}
              placeholder="Get An Instant Quote"
              maxLength={120}
            />
          </div>
        </div>
      </Card>}

      {/* Summary + Thank-You copy */}
      {showSection('content') && <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Summary &amp; Thank-You Content</h3>
          <p className="text-xs text-muted-foreground">Customize the wording on the estimate summary and the confirmation (thank-you) screen. Each box starts with the built-in wording — change it to use your own, or clear it to hide that line.</p>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimate Summary</p>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Summary Heading</Label>
              <Input
                value={content.summaryTitle ?? DEFAULT_DTT_FORM_CONTENT.summaryTitle}
                onChange={e => setContent(p => ({ ...p, summaryTitle: e.target.value }))}
                placeholder="Leave empty to hide this line"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Summary Disclaimer</Label>
              <Textarea
                value={content.summaryDisclaimer ?? DEFAULT_DTT_FORM_CONTENT.summaryDisclaimer}
                onChange={e => setContent(p => ({ ...p, summaryDisclaimer: e.target.value }))}
                placeholder="Leave empty to hide this line"
                rows={2}
                maxLength={300}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Thank-You Screen</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Heading</Label>
              <Input
                value={content.thankYouTitle ?? DEFAULT_DTT_FORM_CONTENT.thankYouTitle}
                onChange={e => setContent(p => ({ ...p, thankYouTitle: e.target.value }))}
                placeholder="Leave empty to hide this line"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Confirmation Message</Label>
              <Input
                value={content.thankYouMessage ?? DEFAULT_DTT_FORM_CONTENT.thankYouMessage}
                onChange={e => setContent(p => ({ ...p, thankYouMessage: e.target.value }))}
                placeholder="Leave empty to hide this line"
                maxLength={160}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Note — Natural Diamond flow</Label>
            <Textarea
              value={content.thankYouNaturalNote ?? DEFAULT_DTT_FORM_CONTENT.thankYouNaturalNote}
              onChange={e => setContent(p => ({ ...p, thankYouNaturalNote: e.target.value }))}
              placeholder="Leave empty to hide this line"
              rows={2}
              maxLength={300}
            />
            <p className="text-[11px] text-muted-foreground">Shown at the end of the Natural Diamonds chain.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Note — Lab Diamond flow</Label>
            <Textarea
              value={content.thankYouLabNote ?? DEFAULT_DTT_FORM_CONTENT.thankYouLabNote}
              onChange={e => setContent(p => ({ ...p, thankYouLabNote: e.target.value }))}
              placeholder="Leave empty to hide this line"
              rows={2}
              maxLength={300}
            />
            <p className="text-[11px] text-muted-foreground">Shown at the end of the Lab Diamonds chain.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Incentive Banner</Label>
            <Textarea
              value={content.incentiveText ?? DEFAULT_DTT_FORM_CONTENT.incentiveText}
              onChange={e => setContent(p => ({ ...p, incentiveText: e.target.value }))}
              placeholder="Leave empty to hide this line"
              rows={2}
              maxLength={300}
            />
            <p className="text-xs text-muted-foreground">
              Use <code>{'{amount}'}</code> where the incentive figure should appear — it is replaced with the
              amount below, formatted in your account currency.
            </p>
          </div>
          <div className="space-y-1.5 max-w-xs">
            <Label className="text-sm">Incentive Amount</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={content.incentiveAmount ?? ''}
              onChange={e => {
                const raw = e.target.value;
                setContent(p => ({
                  ...p,
                  incentiveAmount: raw === '' ? undefined : Math.max(0, Math.floor(Number(raw) || 0)),
                }));
              }}
              placeholder={String(DEFAULT_DTT_FORM_CONTENT.incentiveAmount)}
            />
            <p className="text-xs text-muted-foreground">
              Defaults to {DEFAULT_DTT_FORM_CONTENT.incentiveAmount}. Currency follows your Account Settings.
              On Theme 2 this is also the Design Credit amount subtracted from the estimated total ("With your credit") — editable on the "Design Credit" tab too.
            </p>
          </div>
          <TooltipProvider delayDuration={200}>
            <div className="max-w-xs">
              <ColorField
                label="Incentive Amount Color"
                tooltip="Font color for the money amount (e.g. $1,000) in the incentive banner. The rest of the text keeps its normal color."
                value={content.incentiveHighlightColor || DEFAULT_DTT_FORM_CONTENT.incentiveHighlightColor}
                onChange={v => setContent(p => ({ ...p, incentiveHighlightColor: v }))}
                placeholder={DEFAULT_DTT_FORM_CONTENT.incentiveHighlightColor}
              />
            </div>
          </TooltipProvider>
          <div className="space-y-1.5">
            <Label className="text-sm">Consultation Booking URL</Label>
            <Input
              value={content.bookingUrl ?? ''}
              onChange={e => setContent(p => ({ ...p, bookingUrl: e.target.value }))}
              placeholder="https://calendly.com/your-store/consultation"
            />
            <p className="text-[11px] text-muted-foreground">Calendar embedded on the thank-you screen. Leave empty to show no calendar.</p>
          </div>
        </div>
      </Card>}

      {/* Glass skin — only for accounts opted in to the new design */}
      {showGlassDesign && !sandbox && editorTheme !== 'glass' && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3 border-amber-500/40">
          <p className="text-sm text-muted-foreground">These settings shape <span className="font-medium text-foreground">Theme 2 · Glass</span>. You are currently on Theme 1 · Classic — you can set everything up here first, then switch under Basics → Form Theme.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => { setContent(p => ({ ...p, quoteTheme: 'glass' })); }}>Select Theme 2</Button>
        </Card>
      )}
      {showGlassDesign && (
        <QuoteEstimatorDesignWorkspace
          colors={colors}
          content={content}
          savedContent={config?.form_content}
          onChange={setContent}
        />
      )}
      {showGlassDesign && (
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Thank-You Page Appearance</h3>
            <p className="text-xs text-muted-foreground">
              Colours, corners and finish of the thank-you page. Leave the finish values at zero for plain solid cards — blur, hairline and glow are only drawn when you raise them above zero.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setContent(p => ({ ...p, theme: undefined }))}
            >
              Reset to default
            </Button>
          </div>
          <TooltipProvider delayDuration={200}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ColorField
                label="Muted Text Color"
                tooltip="Secondary lines: helper text, sub-notes, the second receipt row."
                value={content.theme?.mutedTextColor || QUOTE_ESTIMATOR_THEME_DEFAULTS.mutedTextColor}
                onChange={v => setContent(p => ({ ...p, theme: { ...(p.theme || {}), mutedTextColor: v } }))}
                placeholder={QUOTE_ESTIMATOR_THEME_DEFAULTS.mutedTextColor}
              />
              <ColorField
                label="Card Surface Color"
                tooltip="Base colour of every card before opacity is applied."
                value={content.theme?.surfaceColor || QUOTE_ESTIMATOR_THEME_DEFAULTS.surfaceColor}
                onChange={v => setContent(p => ({ ...p, theme: { ...(p.theme || {}), surfaceColor: v } }))}
                placeholder={QUOTE_ESTIMATOR_THEME_DEFAULTS.surfaceColor}
              />
              <ColorField
                label="Hairline Color"
                tooltip="Thin edge drawn around cards. Only visible when Hairline Strength is above zero."
                value={content.theme?.borderColor || QUOTE_ESTIMATOR_THEME_DEFAULTS.borderColor}
                onChange={v => setContent(p => ({ ...p, theme: { ...(p.theme || {}), borderColor: v } }))}
                placeholder={QUOTE_ESTIMATOR_THEME_DEFAULTS.borderColor}
              />
              <ColorField
                label="Glow Color"
                tooltip="Halo behind the credit block and the main button."
                value={content.theme?.glowColor || QUOTE_ESTIMATOR_THEME_DEFAULTS.glowColor}
                onChange={v => setContent(p => ({ ...p, theme: { ...(p.theme || {}), glowColor: v } }))}
                placeholder={QUOTE_ESTIMATOR_THEME_DEFAULTS.glowColor}
              />
              <ColorField
                label="Secondary Highlight"
                tooltip="Used for the discounted line under the estimated total."
                value={content.theme?.highlightMutedColor || QUOTE_ESTIMATOR_THEME_DEFAULTS.highlightMutedColor}
                onChange={v => setContent(p => ({ ...p, theme: { ...(p.theme || {}), highlightMutedColor: v } }))}
                placeholder={QUOTE_ESTIMATOR_THEME_DEFAULTS.highlightMutedColor}
              />
              <ColorField
                label="Error Color"
                tooltip="Inline validation messages, e.g. an unreachable phone number."
                value={content.theme?.errorColor || QUOTE_ESTIMATOR_THEME_DEFAULTS.errorColor}
                onChange={v => setContent(p => ({ ...p, theme: { ...(p.theme || {}), errorColor: v } }))}
                placeholder={QUOTE_ESTIMATOR_THEME_DEFAULTS.errorColor}
              />
              <ColorField
                label="Success Color"
                tooltip="Confirmation state once the customer has claimed their credit."
                value={content.theme?.successColor || QUOTE_ESTIMATOR_THEME_DEFAULTS.successColor}
                onChange={v => setContent(p => ({ ...p, theme: { ...(p.theme || {}), successColor: v } }))}
                placeholder={QUOTE_ESTIMATOR_THEME_DEFAULTS.successColor}
              />
            </div>
          </TooltipProvider>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              ['surfaceOpacity', 'Card Fill (0-1)', 0.05],
              ['surfaceBlur', 'Blur (px)', 1],
              ['borderOpacity', 'Hairline Strength (0-1)', 0.05],
              ['glowIntensity', 'Glow Strength (0-1)', 0.05],
              ['borderRadius', 'Corner Radius (px)', 1],
              ['buttonBorderRadius', 'Button Radius (px)', 1],
            ] as const).map(([key, label, step]) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-sm">{label}</Label>
                <Input
                  type="number"
                  step={step}
                  min={0}
                  value={content.theme?.[key] ?? ''}
                  onChange={e => {
                    const raw = e.target.value;
                    setContent(p => ({
                      ...p,
                      theme: { ...(p.theme || {}), [key]: raw === '' ? undefined : Math.max(0, Number(raw) || 0) },
                    }));
                  }}
                  placeholder={String(QUOTE_ESTIMATOR_THEME_DEFAULTS[key])}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label className="text-sm">Credit Held For (days)</Label>
              <Input
                type="number"
                min={1}
                value={content.creditHoldDays ?? ''}
                onChange={e => {
                  const raw = e.target.value;
                  setContent(p => ({ ...p, creditHoldDays: raw === '' ? undefined : Math.max(1, Math.floor(Number(raw) || 0)) }));
                }}
                placeholder="7"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Heading Font</Label>
              <Input
                value={content.theme?.fontFamilyDisplay ?? ''}
                onChange={e => setContent(p => ({ ...p, theme: { ...(p.theme || {}), fontFamilyDisplay: e.target.value || undefined } }))}
                placeholder={QUOTE_ESTIMATOR_THEME_DEFAULTS.fontFamilyDisplay}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Body Font</Label>
              <Input
                value={content.theme?.fontFamilyBody ?? ''}
                onChange={e => setContent(p => ({ ...p, theme: { ...(p.theme || {}), fontFamilyBody: e.target.value || undefined } }))}
                placeholder={QUOTE_ESTIMATOR_THEME_DEFAULTS.fontFamilyBody}
              />
            </div>
          </div>

          {/* Contact tiles on the thank-you page */}
          <div className="space-y-3 pt-4 border-t">
            <div>
              <p className="text-sm font-semibold text-foreground">Ways To Reach You</p>
              <p className="text-xs text-muted-foreground">
                Tiles shown under the credit block. A tile only appears when it is switched on and has a destination.
              </p>
            </div>
            {([
              ['whatsapp', 'WhatsApp', 'WhatsApp number, e.g. +1 555 555 0123'],
              ['call', 'Call the studio', 'Phone number, e.g. +1 555 555 0123'],
              ['email', 'Message us', 'Email address'],
              ['booking', 'Book a visit', 'Booking calendar URL (defaults to your Consultation Booking URL)'],
            ] as const).map(([key, defaultLabel, placeholder]) => {
              const tile = content.contactTiles?.[key] || {};
              const setTile = (patch: Record<string, unknown>) =>
                setContent(p => ({
                  ...p,
                  contactTiles: { ...(p.contactTiles || {}), [key]: { ...(p.contactTiles?.[key] || {}), ...patch } },
                }));
              return (
                <div key={key} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-3 items-center">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={key === 'booking' ? tile.enabled !== false : tile.enabled === true}
                      onCheckedChange={v => setTile({ enabled: v })}
                    />
                    <span className="text-sm text-foreground">{defaultLabel}</span>
                  </div>
                  <Input
                    value={tile.value ?? ''}
                    onChange={e => setTile({ value: e.target.value })}
                    placeholder={placeholder}
                  />
                  <Input
                    value={tile.label ?? ''}
                    onChange={e => setTile({ label: e.target.value })}
                    placeholder={`Label (default: ${defaultLabel})`}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Design Credit card wording — its own tab so the whole card is editable in one place */}
      {showCreditTab && (
        <div className={`grid items-start gap-6 ${split ? '' : 'xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]'}`}>
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Design Credit</h3>
            <p className="text-xs text-muted-foreground">
              Wording of the Design Credit card on the Theme 2 thank-you page. Each box starts with the built-in wording — change it to use your own, or clear it to hide that line.
              You can use <code>{'{amount}'}</code> (credit figure), <code>{'{store}'}</code> (your store name) and <code>{'{date}'}</code> (credit hold date).
              The hold period is "Credit Held For" on the "Thank-you Design" tab.
            </p>
          </div>

          {/* The credit figure. Same stored value as the Content tab's Incentive
              Amount, so Theme 1's incentive banner and Theme 2's claim card never
              disagree. "With your credit" = estimated total − this amount. */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5">
            <Label className="text-sm font-semibold">Design credit amount</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                step={1}
                value={content.incentiveAmount ?? ''}
                onChange={e => {
                  const raw = e.target.value;
                  setContent(p => ({
                    ...p,
                    incentiveAmount: raw === '' ? undefined : Math.max(0, Math.floor(Number(raw) || 0)),
                  }));
                }}
                placeholder={String(DEFAULT_DTT_FORM_CONTENT.incentiveAmount)}
                className="max-w-[160px]"
                aria-label="Design credit amount"
              />
              <p className="text-xs text-muted-foreground">
                Currency follows your Account Settings. Defaults to {DEFAULT_DTT_FORM_CONTENT.incentiveAmount}.
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              This figure replaces <code>{'{amount}'}</code> in every line below and is subtracted from the estimated total to show the
              "With your credit" price (for example, an estimate of 600 with a 100 credit shows 500). It is the same value as the
              Incentive Amount on the "Content" tab.
            </p>
          </div>

          {/* "With your credit" price under the "Estimated total". On by default; only "off" is stored.
              Off suits stores whose credit is a gift with purchase rather than money off the estimate. */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Show the "With your credit" price</Label>
              <p className="text-xs text-muted-foreground">
                Under the "Estimated total", show the price after the credit is subtracted (estimated total − credit amount).
                Turn off if your credit is a gift with purchase rather than money off — the thank-you page then shows only the
                "Estimated total" at full size, with no line through it.
              </p>
            </div>
            <Switch
              checked={content.claimShowCreditPrice !== false}
              onCheckedChange={v => setContent(p => ({ ...p, claimShowCreditPrice: v ? undefined : false }))}
              aria-label='Show the "With your credit" price'
            />
          </div>

          {/* Strike-through on the pre-credit "Estimated total". On by default; only "off" is stored. */}
          <div
            className="rounded-lg border border-border bg-muted/30 p-4 flex items-start justify-between gap-4"
            style={content.claimShowCreditPrice === false ? { opacity: 0.55 } : undefined}
          >
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Strike through the estimated total</Label>
              <p className="text-xs text-muted-foreground">
                When the "With your credit" price is shown, draw a line through the original "Estimated total" above it.
                Turn off to show the original figure without the line.
              </p>
            </div>
            <Switch
              checked={content.claimStrikeThroughTotal !== false}
              disabled={content.claimShowCreditPrice === false}
              onCheckedChange={v => setContent(p => ({ ...p, claimStrikeThroughTotal: v ? undefined : false }))}
              aria-label="Strike through the estimated total"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Small label above the headline</Label>
              <Input
                value={content.claimCreditEyebrow ?? DEFAULT_CLAIM_COPY.creditEyebrow}
                onChange={e => setContent(p => ({ ...p, claimCreditEyebrow: e.target.value }))}
                placeholder="Leave empty to hide this line"
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Headline</Label>
              <Input
                value={content.claimCreditHeadline ?? DEFAULT_CLAIM_COPY.creditHeadline}
                onChange={e => setContent(p => ({ ...p, claimCreditHeadline: e.target.value }))}
                placeholder="Leave empty to hide this line"
                maxLength={80}
              />
              <p className="text-[11px] text-muted-foreground">Put <code>{'{amount}'}</code> where the credit figure should appear — it is shown in your highlight colour. Typing a number here is plain text; change the figure with "Design credit amount" above.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Line under the headline</Label>
              <Input
                value={content.claimCreditHoldLine ?? DEFAULT_CLAIM_COPY.creditHoldLine}
                onChange={e => setContent(p => ({ ...p, claimCreditHoldLine: e.target.value }))}
                placeholder="Leave empty to hide this line"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Phone field label</Label>
              <Input
                value={content.claimPhoneLabel ?? DEFAULT_CLAIM_COPY.phoneLabel}
                onChange={e => setContent(p => ({ ...p, claimPhoneLabel: e.target.value }))}
                placeholder="Leave empty to hide this line"
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">Claim button text</Label>
              <Input
                value={content.claimButtonLabel ?? DEFAULT_CLAIM_COPY.buttonLabel}
                onChange={e => setContent(p => ({ ...p, claimButtonLabel: e.target.value }))}
                placeholder="Leave empty to hide this line"
                maxLength={60}
              />
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <p className="text-sm font-semibold text-foreground">Notes around the button</p>
            <div className="space-y-1.5">
              <Label className="text-sm">Under the phone field</Label>
              <Input
                value={content.claimPhoneConfirmNote ?? DEFAULT_CLAIM_COPY.phoneConfirmNote}
                onChange={e => setContent(p => ({ ...p, claimPhoneConfirmNote: e.target.value }))}
                placeholder="Leave empty to hide this line"
                maxLength={160}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Under the claim button</Label>
              <Textarea
                value={content.claimReassuranceNote ?? DEFAULT_CLAIM_COPY.reassuranceNote}
                onChange={e => setContent(p => ({ ...p, claimReassuranceNote: e.target.value }))}
                placeholder="Leave empty to hide this line"
                rows={2}
                maxLength={220}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Personal follow-up line</Label>
              <Textarea
                value={content.claimFollowUpNote ?? DEFAULT_CLAIM_COPY.followUpNote}
                onChange={e => setContent(p => ({ ...p, claimFollowUpNote: e.target.value }))}
                placeholder="Leave empty to hide this line"
                rows={2}
                maxLength={260}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Message &amp; data rates line</Label>
              <Textarea
                value={content.claimSmsDisclaimer ?? DEFAULT_CLAIM_COPY.smsDisclaimer}
                onChange={e => setContent(p => ({ ...p, claimSmsDisclaimer: e.target.value }))}
                placeholder="Leave empty to hide this line"
                rows={2}
                maxLength={260}
              />
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <div>
              <p className="text-sm font-semibold text-foreground">Below the credit card</p>
              <p className="text-xs text-muted-foreground">
                The closing line at the bottom of the thank-you page. The built-in line uses the "Credit Held For" days from the "Thank-you Design" tab; clear the box to hide it.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Footer line</Label>
              <Textarea
                value={content.claimFooterNote ?? defaultClaimFooterNote(content.creditHoldDays ?? 7)}
                onChange={e => setContent(p => ({ ...p, claimFooterNote: e.target.value }))}
                placeholder="Leave empty to hide this line"
                rows={2}
                maxLength={260}
              />
            </div>
          </div>
        </Card>
        <QuoteEstimatorThankYouPreview colors={colors} content={content} />
        </div>
      )}

      {/* Lead quality gate */}
      {showSection('basics') && <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Lead Quality</h3>
          <p className="text-xs text-muted-foreground">
            Filters out bogus phone numbers without SMS verification, so there is no cost and no extra step for the customer.
            Numbers are validated against real numbering plans as they are typed, and every lead is scored High / Medium / Low in your leads list.
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Score lead quality</p>
            <p className="text-xs text-muted-foreground">Adds a High / Medium / Low badge to each lead. Never blocks a submission.</p>
          </div>
          <Switch checked={qualityScoring} onCheckedChange={setQualityScoring} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Block temporary email addresses</p>
            <p className="text-xs text-muted-foreground">Rejects known throwaway inbox domains on the contact step.</p>
          </div>
          <Switch checked={blockDisposable} onCheckedChange={setBlockDisposable} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Duplicate window (minutes)</p>
            <p className="text-xs text-muted-foreground">Repeat submissions from the same phone inside this window update the existing lead instead of creating a new one. Set 0 to disable.</p>
          </div>
          <Input
            type="number"
            min={0}
            max={1440}
            value={dedupeWindow}
            onChange={e => setDedupeWindow(e.target.value)}
            className="w-24"
          />
        </div>
      </Card>}

      {/* Steps enable/reorder */}
      {showSection('steps') && <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Steps</h3>
          <p className="text-xs text-muted-foreground">{version === 'v3'
            ? 'Toggle steps off to skip them. V3 · Atelier keeps its own fixed stage order, so the drag order here is not applied; Contact and Summary are always shown.'
            : 'Drag the handle to reorder, use the arrows, or toggle steps off. Welcome, Contact, and Summary steps are always shown.'}</p>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStepDragEnd}>
          <SortableContext items={orderedStepKeys} strategy={verticalListSortingStrategy}>
            <div className="divide-y">
              {orderedStepKeys.map((key, idx) => {
                const step = CONFIGURABLE_STEPS.find(s => s.key === key);
                if (!step) return null;
                return (
                  <SortableStepRow
                    key={key}
                    stepKey={key}
                    label={step.label}
                    index={idx}
                    total={orderedStepKeys.length}
                    enabled={enabledSteps[key] !== false}
                    onToggle={v => setEnabledSteps(p => ({ ...p, [key]: v }))}
                    onMove={dir => moveStep(key, dir)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </Card>}

      {/* Submission mode */}
      {showSection('basics') && <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Submission</h3>
          <p className="text-xs text-muted-foreground">Choose how leads finalize their inquiry.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant={submissionMode === 'contact' ? 'default' : 'outline'} size="sm" onClick={() => setSubmissionMode('contact')}>Contact Info</Button>
          <Button variant={submissionMode === 'deposit' ? 'default' : 'outline'} size="sm" onClick={() => setSubmissionMode('deposit')}>Deposit</Button>
        </div>
        {submissionMode === 'deposit' && (
          <div className="space-y-1.5 max-w-xs">
            <Label className="text-sm">Deposit Amount (USD)</Label>
            <Input type="number" min="0" step="0.01" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="e.g. 250" />
          </div>
        )}
      </Card>}

      {/* Allowlisted accounts only (Sandbox + fsl): "mini Nivoda" diamond picker — its own tab. */}
      {showSection('diamonds') && (
        <QuoteDiamondConfigurationTab
          clientId={clientId}
          value={content.diamondPicker}
          onChange={next => setContent(p => ({ ...p, diamondPicker: next }))}
        />
      )}

      {/* V3 only: the gemstone list after the "Pick your gemstone" card (stones from Admin → Gemstone Pool). */}
      {showSection('diamonds') && version === 'v3' && (
        <QuoteGemstonePickerCard
          value={content.gemstonePicker}
          onChange={next => setContent(p => ({ ...p, gemstonePicker: next }))}
        />
      )}

      {/* Options editor */}
      {showSection('options') && <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Options</h3>
          <p className="text-xs text-muted-foreground">Enable/disable individual options, rename them, set your prices and replace their images. Changes take effect immediately on the widget.</p>
        </div>
        <Accordion type="multiple" className="w-full">
          {OPTION_STEPS.map(step => {
            const opts = (optionsByStep as any)[step.key] || [];
            return (
              <AccordionItem key={step.key} value={step.key}>
                <AccordionTrigger className="text-sm">{step.label} <span className="ml-2 text-xs text-muted-foreground">({opts.length})</span></AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {/* Per-step heading + sub-heading shown above the options on the public form. */}
                    <div className="pb-3 mb-1 border-b">{stepHeadingFields(step.key)}</div>
                    {opts.length > 0 && (
                      <div className="flex items-center justify-end gap-2 pb-2 border-b">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bulkToggleStep(step.key, opts, true)}>Select All</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bulkToggleStep(step.key, opts, false)}>Clear All</Button>
                      </div>
                    )}
                    {opts.map((o: any) => {
                      const k = `${step.key}:${o.id}`;
                      const ov = overrides[k];
                      const isEnabled = ov ? ov.is_enabled : true;
                      const img = ov?.custom_image_url
                        || (version === 'v3' || (version === 'v2' && usesV3StockImages(clientId)) ? quoteV3StockImageUrl(step.key, o.option_value) : null)
                        || o.image_url
                        || (STEP_TO_TABLE[step.key] ? getDiamondFormImageUrl(STEP_TO_TABLE[step.key], o.option_value) : '');
                      const effectivePrice = ov?.custom_price != null ? ov.custom_price : (o.price ?? 0);
                      const priceValue = priceDrafts[k] !== undefined ? priceDrafts[k] : String(effectivePrice);
                      // Stock name (no override) — what clearing the box returns to.
                      const defaultName = defaultOptions?.[step.key as keyof AllDiamondFormOptions]?.find(d => d.id === o.id)?.name ?? o.name;
                      const effectiveName = ov?.custom_name ?? o.name;
                      const nameValue = nameDrafts[k] !== undefined ? nameDrafts[k] : effectiveName;
                      // Ring Metal only: karat / purity variants shown beneath an
                      // enabled metal so the client can pick which ones to offer.
                      const karats = step.key === 'metal' && isEnabled
                        ? getMetalKaratVariants(o.option_value, content.metalKarats)
                        : [];
                      // Two Tone only: which two metals can be combined — asked on
                      // the public form before the karat.
                      const combos = step.key === 'metal' && isEnabled && o.option_value === 'two-tone'
                        ? getTwoToneCombos(content.twoToneCombos, metalPrices)
                        : [];
                      return (
                        <div key={o.id} className="border-b last:border-0">
                        <div className="flex items-center gap-3 py-2">
                          {img ? (
                            <img src={img} alt={effectiveName} className="w-10 h-10 object-cover rounded border" />
                          ) : (
                            <div className="w-10 h-10 rounded border bg-muted" />
                          )}
                          {/* Per-client display name. Blur saves; blank restores the stock name. */}
                          <Input
                            type="text"
                            maxLength={OPTION_NAME_MAX}
                            value={nameValue}
                            onChange={e => setNameDrafts(p => ({ ...p, [k]: e.target.value }))}
                            onBlur={e => saveName(step.key, o.id, e.target.value, defaultName)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            placeholder={defaultName}
                            title={ov?.custom_name ? `Default: ${defaultName}` : undefined}
                            className={`h-8 flex-1 min-w-0 text-sm${ov?.custom_name ? ' font-medium' : ''}`}
                            aria-label={`Display name for ${defaultName}`}
                          />
                          {/* Diamond Nature has no price of its own — the choice only
                              branches the flow, so no price input is shown for it. */}
                          {step.key !== 'nature' && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs text-muted-foreground">$</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={priceValue}
                                onChange={e => setPriceDrafts(p => ({ ...p, [k]: e.target.value }))}
                                onBlur={e => savePrice(step.key, o.id, e.target.value)}
                                placeholder={String(o.price ?? 0)}
                                className="h-8 w-20 text-sm"
                                aria-label={`Price for ${o.name}`}
                              />
                            </div>
                          )}
                          <label className="cursor-pointer text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                            <ImagePlus className="h-4 w-4" />
                            <span className="hidden sm:inline">Replace</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) uploadOptionImage(step.key, o.id, f);
                              e.target.value = '';
                            }} />
                          </label>
                          <Switch checked={isEnabled} onCheckedChange={v => toggleOption(step.key, o.id, v)} />
                        </div>
                        {combos.length > 0 && (
                          <div className="ml-4 sm:ml-[52px] mb-2 rounded-md border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Metal combinations
                                <span className="font-normal"> (asked first, then the karat)</span>
                              </p>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => bulkToggleCombos(true)}>All</Button>
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => bulkToggleCombos(false)}>None</Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                              {combos.map(c => {
                                const priceValue = comboPriceDrafts[c.value] !== undefined ? comboPriceDrafts[c.value] : String(c.price);
                                return (
                                  <div key={c.value} className={`flex items-center gap-2 ${c.enabled ? '' : 'opacity-60'}`}>
                                    <Switch
                                      className="scale-90"
                                      checked={c.enabled}
                                      onCheckedChange={en => setComboOverride(c.value, { enabled: en })}
                                      aria-label={`${c.enabled ? 'Disable' : 'Enable'} ${c.name}`}
                                    />
                                    <span className="text-sm flex-1 min-w-0 truncate">{c.name}</span>
                                    <span className="text-xs text-muted-foreground">$</span>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={priceValue}
                                      disabled={!c.enabled}
                                      onChange={e => setComboPriceDrafts(p => ({ ...p, [c.value]: e.target.value }))}
                                      onBlur={e => commitComboPrice(c.value, e.target.value)}
                                      className="h-7 w-20 text-sm"
                                      aria-label={`Price for ${c.name}`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-muted-foreground">Defaults to the two metals' prices added together; type a price to override, clear it to go back to the default. Saved with "Save Configuration".</p>
                          </div>
                        )}
                        {karats.length > 0 && (
                          <div className="ml-4 sm:ml-[52px] mb-3 rounded-md border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                {o.option_value === 'silver' ? 'Silver types' : o.option_value === 'platinum' ? 'Platinum purities' : 'Karats'}
                                {o.option_value === 'two-tone' && <span className="font-normal"> (applies to both gold parts)</span>}
                              </p>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => bulkToggleKarats(o.option_value, true)}>All</Button>
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => bulkToggleKarats(o.option_value, false)}>None</Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                              {karats.map(v => {
                                const dk = `${o.option_value}:${v.value}`;
                                const priceValue = karatPriceDrafts[dk] !== undefined ? karatPriceDrafts[dk] : String(v.price);
                                return (
                                  <div key={v.value} className={`flex items-center gap-2 ${v.enabled ? '' : 'opacity-60'}`}>
                                    <Switch
                                      className="scale-90"
                                      checked={v.enabled}
                                      onCheckedChange={en => setKaratOverride(o.option_value, v.value, { enabled: en })}
                                      aria-label={`${v.enabled ? 'Disable' : 'Enable'} ${v.name} for ${o.name}`}
                                    />
                                    <span className="text-sm flex-1 min-w-0 truncate">{v.name}</span>
                                    <span className="text-xs text-muted-foreground">$</span>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={priceValue}
                                      disabled={!v.enabled}
                                      onChange={e => setKaratPriceDrafts(p => ({ ...p, [dk]: e.target.value }))}
                                      onBlur={e => commitKaratPrice(o.option_value, v.value, e.target.value)}
                                      className="h-7 w-20 text-sm"
                                      aria-label={`Price for ${o.name} ${v.name}`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-muted-foreground">Added on top of the metal price. Saved with "Save Configuration".</p>
                          </div>
                        )}
                        </div>
                      );
                    })}
                    {opts.length === 0 && <p className="text-xs text-muted-foreground py-2">No options available.</p>}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
          {/* Timeline: no option table, so choices are added / edited / removed here. */}
          <AccordionItem value="timeline">
            <AccordionTrigger className="text-sm">Timeline <span className="ml-2 text-xs text-muted-foreground">({timelineRows.length})</span></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {timelineRows.map((row, idx) => {
                  const isEnabled = row.enabled !== false;
                  const priceValue = timelinePriceDrafts[idx] !== undefined ? timelinePriceDrafts[idx] : String(row.price ?? 0);
                  return (
                    <div key={idx} className={`flex items-center gap-2 sm:gap-3 py-1 ${isEnabled ? '' : 'opacity-60'}`}>
                      <Input
                        value={row.label}
                        onChange={e => patchTimelineRow(idx, { label: e.target.value })}
                        placeholder="e.g. 3 Weeks"
                        maxLength={40}
                        className="h-8 text-sm flex-1 min-w-0"
                        aria-label={`Timeline option ${idx + 1} label`}
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={priceValue}
                          onChange={e => setTimelinePriceDrafts(p => ({ ...p, [idx]: e.target.value }))}
                          onBlur={e => commitTimelinePrice(idx, e.target.value)}
                          className="h-8 w-20 text-sm"
                          aria-label={`Price for ${row.label || `timeline option ${idx + 1}`}`}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeTimelineRow(idx)}
                        disabled={timelineRows.length <= 1}
                        aria-label={`Remove ${row.label || `timeline option ${idx + 1}`}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={v => patchTimelineRow(idx, { enabled: v })}
                        aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${row.label || `timeline option ${idx + 1}`}`}
                      />
                    </div>
                  );
                })}
                <div className="flex items-center justify-between gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addTimelineRow}
                    disabled={timelineRows.length >= MAX_DTT_TIMELINE_OPTIONS}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add option
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetTimelineRows}>Reset to defaults</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The price is added to the estimate when a customer picks that option. A row with an empty name is not saved, and if every option is switched off the default options are shown. Saved with "Save Configuration".
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>}

      {/* Sticky save bar — pinned to the bottom edge and padded for the mobile
          browser chrome (safe-area inset) so it stays reachable & tappable on
          phone/tablet. Full-width button on small screens for an easy tap target. */}
      <div className="sticky bottom-0 z-30 mt-2 flex justify-end rounded-t-xl border-t border-border/50 bg-background/95 px-2 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button onClick={saveConfig} disabled={saving} size="lg" className="w-full sm:w-auto shadow-lg">
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save Configuration</>}
        </Button>
      </div>
      </>}
    </div>
  );
}
