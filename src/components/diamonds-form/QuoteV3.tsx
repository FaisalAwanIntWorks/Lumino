import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Check, ArrowDown, HelpCircle, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAllDiamondFormOptions, type AllDiamondFormOptions } from '@/hooks/useAllDiamondFormOptions';
import type { ClientDttFormConfig } from '@/hooks/useClientDttFormConfig';
import type { DiamondFormData } from '@/pages/client/DiamondsForm';
import { getEnabledMetalKaratVariants, getEnabledTwoToneCombos, toMetalPriceMap } from '@/lib/dtt-metal-karats';
import { getEnabledTimelineOptions } from '@/lib/dtt-timeline-options';
import { quoteV3Breakdown } from '@/lib/quote-v3-pricing';
import { quoteV3ImageUrl, quoteV3StockImageScale } from '@/lib/quote-v3-assets';
import { useQuoteTestPreview } from '@/lib/quote-estimator-version';
import { quoteV3ThemeStyle } from '@/lib/quote-v3-theme';
import { buildQuoteEstimatorVars, resolveQuoteEstimatorTheme } from '@/lib/quote-estimator-theme';
import { DiamondPickerStep } from './DiamondPickerStep';
import { GemstonePickerStep } from './GemstonePickerStep';
import { filterV3ShapeTiles } from '@/lib/quote-v3-shapes';
import { resolveQuoteGemstonePickerConfig, type QuoteSelectedGemstone } from '@/lib/quote-estimator-gemstones';
import { isQuoteDiamondPickerEnabled, quoteDiamondQualityValue, resolveQuoteDiamondPickerConfig, type QuoteSelectedDiamond } from '@/lib/quote-estimator-diamonds';
import { DiamondContactStep, type ContactFormData } from './DiamondContactStep';
import { DiamondEstimateSummary } from './DiamondEstimateSummary';
import { COLORED_DIAMOND_SHAPE_VALUE, GEMSTONE_SHAPE_VALUE, QUOTE_GEMSTONES, quoteGemstoneImageUrl, quoteGemstoneLabel } from '@/lib/quote-v3-gemstones';
import './quote-v3.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';

type Stage = 'nature' | 'shape' | 'colored_shape' | 'gemstone' | 'gemstone_pick' | 'size' | 'quality' | 'setting' | 'holder' | 'band' | 'band_width' | 'metal' | 'two_tone' | 'metal_karat' | 'personalization' | 'engraving' | 'timeline' | 'inspiration' | 'details' | 'ring_size' | 'review';
const LEGACY_STAGES: Stage[] = ['nature', 'shape', 'size', 'setting', 'holder', 'band', 'band_width', 'metal', 'personalization', 'timeline', 'inspiration', 'review'];
const REVIEW_GROUPS: { label: string; stages: Stage[] }[] = [
  { label: 'Diamond', stages: ['nature', 'shape', 'colored_shape', 'gemstone', 'gemstone_pick', 'size', 'quality'] },
  { label: 'Setting', stages: ['setting', 'holder'] },
  { label: 'Band & metal', stages: ['band', 'band_width', 'metal', 'two_tone', 'metal_karat'] },
  { label: 'Personal details', stages: ['personalization', 'engraving'] },
  { label: 'Preferred timing', stages: ['timeline'] },
  { label: 'Inspiration & size', stages: ['inspiration', 'details', 'ring_size'] },
];
const STAGES: { key: Stage; category: number; title: string; subtitle: string; label: string; keys: string[] }[] = [
  { key: 'nature', category: 0, title: 'Your diamond, your way.', subtitle: 'Start with the origin that feels right for you.', label: 'Diamond origin', keys: ['nature'] },
  { key: 'shape', category: 0, title: 'Find your shape.', subtitle: 'Choose the silhouette that speaks to you.', label: 'Diamond shape', keys: ['shape'] },
  // Opens only after the Colored Diamond card is picked: the same shape cards minus Colored Diamond and Gemstone.
  { key: 'colored_shape', category: 0, title: 'Choose your colored diamond shape.', subtitle: 'Pick the silhouette for your colored stone.', label: 'Colored diamond shape', keys: [] },
  // Opens only after the Gemstone shape card is picked (conditional stage, no option table of its own). The carat size follows; quality is skipped on this path.
  { key: 'gemstone', category: 0, title: 'Pick your gemstone now.', subtitle: 'Choose the stone that brings colour to your ring.', label: 'Gemstone', keys: [] },
  // Shared by the diamond and gemstone paths (the gemstone path reads 'gemstone size'); on the gemstone path it sets the carat window of the stone list.
  { key: 'size', category: 0, title: 'Choose your diamond size.', subtitle: 'Carat measures weight. Shape affects how large a diamond looks.', label: 'Diamond size', keys: ['size'] },
  // Follows the carat size when the gemstone picker is on: the pool stones of that gemstone inside the chosen carat window (sorted, paged).
  { key: 'gemstone_pick', category: 0, title: 'Choose your gemstone.', subtitle: 'Sort by price and pick the exact stone for your ring.', label: 'Gemstone stone', keys: [] },
  { key: 'quality', category: 0, title: 'Choose your diamond quality.', subtitle: 'Choose the grade you prefer.', label: 'Diamond quality', keys: ['quality'] },
  { key: 'setting', category: 1, title: 'Choose your setting.', subtitle: 'Find the silhouette that feels like you.', label: 'Ring setting', keys: ['setting'] },
  { key: 'holder', category: 1, title: 'Frame your diamond.', subtitle: 'Choose how your centre stone is held.', label: 'Diamond head', keys: ['holder'] },
  { key: 'band', category: 2, title: 'Choose your band style.', subtitle: 'A simple finish or a little more detail.', label: 'Band style', keys: ['band'] },
  { key: 'band_width', category: 2, title: 'Find your balance.', subtitle: 'Choose a finer line or a bolder band.', label: 'Band width', keys: ['band_width'] },
  { key: 'metal', category: 2, title: 'Choose your metal.', subtitle: 'Find the tone that brings your design together.', label: 'Metal', keys: ['metal'] },
  { key: 'two_tone', category: 2, title: 'Choose your two-tone combination.', subtitle: 'Bring two metal tones together.', label: 'Two-tone combination', keys: [] },
  { key: 'metal_karat', category: 2, title: 'Choose your metal purity.', subtitle: 'Select your preferred karat.', label: 'Metal purity', keys: [] },
  { key: 'personalization', category: 3, title: 'Make it personal.', subtitle: 'Choose any details you love, or keep it simple.', label: 'Personal details', keys: ['personalization'] },
  { key: 'engraving', category: 3, title: 'Add your engraving.', subtitle: 'Enter the text you would like engraved.', label: 'Engraving text', keys: [] },
  { key: 'timeline', category: 3, title: 'When do you have in mind?', subtitle: 'Tell us your preferred timing.', label: 'Timing', keys: ['timeline'] },
  { key: 'inspiration', category: 3, title: 'Share your inspiration.', subtitle: 'Add references or a meaningful detail.', label: 'Inspiration images', keys: ['inspiration'] },
  { key: 'details', category: 3, title: 'Anything else to share?', subtitle: 'Add any other details about your design.', label: 'Other details', keys: [] },
  { key: 'ring_size', category: 3, title: 'What is your ring size?', subtitle: 'Not sure? You can leave this blank.', label: 'Ring size', keys: ['ring_size'] },
  { key: 'review', category: 4, title: 'Review your selections.', subtitle: 'Check each detail before requesting your quote.', label: 'Review', keys: [] },
];
const CATEGORIES = ['Diamond', 'Setting', 'Band', 'Details', 'Review'];
const IMAGE_STAGES = new Set<Stage>(['nature', 'shape', 'colored_shape', 'gemstone', 'size', 'quality', 'setting', 'holder', 'band', 'band_width', 'metal', 'personalization']);
// Stock pictures whose stone fills more (or less) of the canvas than the rest of the set get a per-picture scale; the card CSS reads it (hover zoom included).
const stockImageFitStyle = (url: string): CSSProperties | undefined => { const fit = quoteV3StockImageScale(url); return fit === 1 ? undefined : ({ '--v3-fit': fit } as CSSProperties); };
const FIELDS: Record<Exclude<Stage, 'inspiration' | 'review' | 'colored_shape' | 'gemstone' | 'gemstone_pick' | 'two_tone' | 'metal_karat' | 'engraving' | 'details' | 'ring_size'>, keyof DiamondFormData> = {
  nature: 'diamondType', shape: 'diamondShape', size: 'diamondSize', quality: 'diamondQuality', setting: 'diamondSetting', holder: 'diamondHolder',
  band: 'diamondBand', band_width: 'diamondBandWidth', metal: 'diamondMetal', personalization: 'diamondPersonalization', timeline: 'diamondTimeline',
};
const OPTION_FIELDS: Record<keyof AllDiamondFormOptions, keyof DiamondFormData> = { nature: 'diamondType', shape: 'diamondShape', size: 'diamondSize', quality: 'diamondQuality', setting: 'diamondSetting', holder: 'diamondHolder', band: 'diamondBand', band_width: 'diamondBandWidth', metal: 'diamondMetal', personalization: 'diamondPersonalization' };
const ELONGATED_SHAPES = ['oval','radiant','emerald','marquise','pear','dutch-marquise','moval'];
const EMPTY: DiamondFormData = { diamondType: null, diamondShape: null, diamondSize: null, diamondQuality: null, diamondSetting: null, diamondHolder: null, diamondBand: null, diamondBandWidth: [], diamondMetal: null, diamondMetalKarat: null, diamondTwoToneMetals: null, diamondPersonalization: [], inspirationImages: [], ringSize: '', otherDetails: '', diamondTimeline: null, contactInfo: null };
const hasAnswer = (field: keyof DiamondFormData, data: DiamondFormData) => {
  const value = data[field];
  return Array.isArray(value) ? value.length > 0 : !!value;
};

export function QuoteV3({ clientId, config, currency }: { clientId: string; config: ClientDttFormConfig; currency: string }) {
  const palette = useMemo(() => quoteV3ThemeStyle(config.form_colors), [config.form_colors]);
  // Completion screen: the same claim screen Sandbox V2 shows, resolved from
  // V3's own saved palette and theme group (never V2's record).
  const claimTheme = useMemo(() => resolveQuoteEstimatorTheme(config.form_colors, config.form_content?.theme), [config.form_colors, config.form_content?.theme]);
  const testPreview = useQuoteTestPreview();
  const { data: options, isLoading, error: optionsError } = useAllDiamondFormOptions(clientId, 'v3', false);
  const draftKey = `jewlx-quote-v3-draft:${clientId}`;
  const draft = useMemo(() => { try { return JSON.parse(sessionStorage.getItem(draftKey) || 'null'); } catch { return null; } }, [draftKey]);
  const clearDraft = () => { try { sessionStorage.removeItem(draftKey); } catch { /* storage blocked */ } };
  const [data, setData] = useState<DiamondFormData>(() => draft?.data ? { ...EMPTY, ...draft.data, inspirationImages: [], contactInfo: null } : EMPTY);
  const [index, setIndex] = useState<number>(() => {
    const savedKey = typeof draft?.stage === 'string' ? draft.stage : Number.isInteger(draft?.index) ? LEGACY_STAGES[Math.max(0, Math.min(draft.index, LEGACY_STAGES.length - 1))] : 'nature';
    return Math.max(0, STAGES.findIndex(s => s.key === savedKey));
  });
  const [initials, setInitials] = useState<string>(() => draft?.initials || '');
  const [error, setError] = useState('');
  const [contact, setContact] = useState(false);
  const [notice, setNotice] = useState('');
  // Stones in the gemstone pool for the picked gemstone (null until the list loads); 0 lets the customer continue without one.
  const [gemstoneStock, setGemstoneStock] = useState<number | null>(null);
  const [travel, setTravel] = useState<'forward' | 'back'>('forward');
  const [showScrollCue, setShowScrollCue] = useState(false);
  const [seenScrollSteps, setSeenScrollSteps] = useState<Set<Stage>>(new Set());
  const mainRef = useRef<HTMLElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const latestNextRef = useRef<() => void>(() => undefined);
  const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
  useEffect(() => {
    if (data.contactInfo) { clearDraft(); return; }
    try { const { inspirationImages: _i, contactInfo: _c, ...rest } = data; sessionStorage.setItem(draftKey, JSON.stringify({ data: rest, stage: STAGES[index].key, initials })); } catch { /* storage blocked */ }
  }, [data, index, initials]); // eslint-disable-line react-hooks/exhaustive-deps
  const stage = STAGES[index];
  const enabled = (key: string) => config.enabled_steps?.[key] !== false;
  // Sandbox "mini Nivoda" picker replaces the quality cards with real stones.
  const diamondPicker = isQuoteDiamondPickerEnabled(clientId, config.form_content);
  const diamondPickerConfig = resolveQuoteDiamondPickerConfig(config.form_content);
  // Gemstone picker: the real stones of the picked gemstone (Admin → Gemstone Pool) after the gemstone card.
  const gemstonePickerConfig = resolveQuoteGemstonePickerConfig(config.form_content);
  // V3 shows only the recommended shape tiles (see quote-v3-shapes.ts); every other step lists its options as configured.
  const visibleOptions = (key: keyof AllDiamondFormOptions) => key === 'shape' ? filterV3ShapeTiles(options?.shape ?? []) : options?.[key] ?? [];
  // Colored Diamond re-offers every shape card except itself and Gemstone.
  const coloredShapeOptions = visibleOptions('shape').filter(o => o.option_value !== COLORED_DIAMOND_SHAPE_VALUE && o.option_value !== GEMSTONE_SHAPE_VALUE);
  const coloredShapeLabel = (value: string | null | undefined) => coloredShapeOptions.find(o => o.option_value === value)?.name ?? value ?? '';
  const gemstoneFlow = enabled('shape') && data.diamondShape === GEMSTONE_SHAPE_VALUE;
  const coloredFlow = enabled('shape') && data.diamondShape === COLORED_DIAMOND_SHAPE_VALUE;
  // The silhouette that drives shape-dependent rules (elongated settings, stone picker) on the colored path.
  const effectiveShape = coloredFlow ? data.diamondColoredShape ?? null : data.diamondShape;
  const active = STAGES.filter(s => s.key === 'review' || (
    (s.key === 'gemstone' ? gemstoneFlow :
     s.key === 'gemstone_pick' ? gemstoneFlow && gemstonePickerConfig.enabled && !!data.diamondGemstone :
     s.key === 'colored_shape' ? coloredFlow :
     // A gemstone has a carat size (it narrows the stone list) but no diamond grade.
     // The catalogue holds no colored diamonds: the colored path goes from carat size straight to the setting (no stone list, no grade cards).
     s.key === 'quality' ? !gemstoneFlow && !coloredFlow && s.keys.some(enabled) :
     s.key === 'two_tone' ? data.diamondMetal === 'two-tone' && getEnabledTwoToneCombos(config.form_content?.twoToneCombos, toMetalPriceMap(options?.metal ?? [])).length > 0 :
     s.key === 'metal_karat' ? !!data.diamondMetal && getEnabledMetalKaratVariants(data.diamondMetal, config.form_content?.metalKarats).length > 0 :
     s.key === 'engraving' ? enabled('personalization') && data.diamondPersonalization.includes('initials-engraving') :
     s.key === 'details' ? enabled('inspiration') :
     s.keys.some(enabled))
  ));
  useEffect(() => {
    if (active.some(s => s.key === STAGES[index].key)) return;
    setIndex(STAGES.findIndex(s => s.key === (active.find(s => STAGES.indexOf(s) > index) ?? active[active.length - 1]).key));
  }, [index, active.map(s => s.key).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setShowScrollCue(false);
    if (stage.key === 'review' || embedded || seenScrollSteps.has(stage.key) || window.matchMedia('(min-width: 621px), (prefers-reduced-motion: reduce)').matches) return;
    let dismissed = false;
    let frame = 0;
    const check = () => {
      if (dismissed) return;
      const grid = mainRef.current?.querySelector('.v3-choices');
      const bar = actionsRef.current;
      setShowScrollCue(!!grid && !!bar && grid.getBoundingClientRect().bottom > bar.getBoundingClientRect().top + 20 && grid.getBoundingClientRect().top < bar.getBoundingClientRect().top);
    };
    const onScroll = () => { dismissed = true; setShowScrollCue(false); setSeenScrollSteps(prev => new Set(prev).add(stage.key)); };
    frame = requestAnimationFrame(check);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', check);
    const timer = window.setTimeout(() => { setShowScrollCue(false); setSeenScrollSteps(prev => new Set(prev).add(stage.key)); }, 3600);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', check); };
  }, [stage.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const currentPosition = active.findIndex(s => s.key === stage.key);
  const set = (patch: Partial<DiamondFormData>) => { setData(prev => ({ ...prev, ...patch })); setError(''); setNotice(''); };
  const cancelAutoAdvance = () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  };
  const go = (target: Stage) => {
    cancelAutoAdvance();
    setTravel(STAGES.findIndex(s => s.key === target) < index ? 'back' : 'forward');
    setIndex(STAGES.findIndex(s => s.key === target));
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.parent?.postMessage(JSON.stringify({ type: 'jewlx-scroll-top' }), '*');
  };
  const valid = (step: typeof STAGES[number]) => {
    if (step.key === 'review') return true;
    const required = step.keys.filter(k => enabled(k) && !['personalization', 'inspiration', 'ring_size'].includes(k));
    if (required.some(k => !hasAnswer(FIELDS[k as keyof typeof FIELDS], data))) return false;
    if (step.key === 'quality' && diamondPicker && enabled('quality') && !data.selectedDiamond) return false;
    if (step.key === 'gemstone' && !data.diamondGemstone) return false;
    // An exact stone is required while the pool has stones of this gemstone; an empty pool lets the design continue.
    if (step.key === 'gemstone_pick' && !data.selectedGemstone && gemstoneStock !== 0) return false;
    if (step.key === 'colored_shape' && !data.diamondColoredShape) return false;
    if (step.key === 'engraving' && !initials.trim()) return false;
    if (step.key === 'metal_karat' && !data.diamondMetalKarat) return false;
    if (step.key === 'two_tone' && !data.diamondTwoToneMetals) return false;
    return true;
  };
  const next = () => {
    if (!valid(stage)) { setError('Choose an option for each required selection before continuing.'); return; }
    go(active[Math.min(currentPosition + 1, active.length - 1)].key);
  };
  latestNextRef.current = next;
  // A checked radio fires no change event when it is clicked again, so a
  // customer who comes Back and taps the card they already chose would sit
  // still; the click itself re-runs the advance for a selected card.
  const reselect = (selected: boolean) => (selected ? () => scheduleAutoAdvance() : undefined);
  const scheduleAutoAdvance = () => {
    cancelAutoAdvance();
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceTimerRef.current = null;
      latestNextRef.current();
    }, 320);
  };
  useEffect(() => () => cancelAutoAdvance(), []);
  const previous = () => { if (currentPosition > 0) go(active[currentPosition - 1].key); };
  const breakdown = options ? quoteV3Breakdown(data, options, config.form_content) : { lines: [], total: 0 };
  const headingKey = stage.key;
  const heading = config.form_content?.stepHeadings?.[headingKey];
  if (isLoading || !options || optionsError) return <div className="v3-page v3-loading" style={palette} role="status">{optionsError ? 'We could not load the choices. Please refresh and try again.' : 'Preparing your choices…'}</div>;
  // Outside `.v3-page` on purpose: its heading and letter-spacing rules would
  // restyle the claim screen. The frame mirrors the V2 embed wrapper exactly.
  if (data.contactInfo) return <div className="v3-complete-page" style={{ ...palette, backgroundColor: claimTheme.background, color: claimTheme.fontColor }}><div className="max-w-2xl mx-auto p-2 md:p-6 diamond-form-font qe-content-scroll qe-glass" style={buildQuoteEstimatorVars(claimTheme) as CSSProperties}><DiamondEstimateSummary formData={{ ...data, otherDetails: [data.diamondPersonalization.includes('initials-engraving') ? `Engraving: ${initials.trim()}` : '', data.otherDetails].filter(Boolean).join('\n') }} onBack={() => { setData(prev => ({ ...prev, contactInfo: null })); setContact(true); }} clientId={clientId} skipEstimate={data.diamondType === 'natural'} currency={currency} submissionMode={config.submission_mode} depositAmount={config.deposit_amount ?? undefined} content={config.form_content} formColors={config.form_colors} enableQualityScoring={config.enable_lead_quality_scoring} /></div></div>;
   if (contact) return <div className="v3-page" style={palette}><div className="v3-contact"><Button variant="ghost" onClick={() => setContact(false)}><ArrowLeft size={16} /> Back to review</Button><h1>{testPreview ? 'Complete your preview.' : 'Request your quote.'}</h1><p>{testPreview ? 'Try the contact step without sending a request.' : 'Share your details and we’ll follow up about your design.'}</p><DiamondContactStep onBack={() => setContact(false)} onSubmit={(c: ContactFormData) => setData(prev => ({ ...prev, contactInfo: c }))} content={config.form_content} blockDisposableEmail={config.block_disposable_email} unifiedPhone previewOnly={testPreview} quoteV3 /></div></div>;

  const optionGroups = (key: keyof AllDiamondFormOptions, multi = false) => {
    const field = OPTION_FIELDS[key];
    const list = visibleOptions(key);
    return <fieldset className={`v3-choices v3-choices-${key}`}><legend className="sr-only">{key.replace(/_/g, ' ')}</legend>{list.map(o => {
      const current = data[field];
      const selected = Array.isArray(current) ? (current as string[]).includes(o.option_value) : current === o.option_value;
      const choose = () => {
        if (multi) {
          const old = current as string[];
          set({ [field]: selected ? old.filter(v => v !== o.option_value) : [...old, o.option_value] });
        } else {
          // Band width is stored as a list for every version; V3 picks exactly one.
          const patch: Partial<DiamondFormData> = { [field]: Array.isArray(current) ? [o.option_value] : o.option_value, ...(key === 'metal' ? { diamondMetalKarat: null, diamondTwoToneMetals: null } : {}) };
          // A picked stone belongs to its type / shape / carat; changing any of those drops it.
          if ((key === 'nature' || key === 'shape' || key === 'size') && data.selectedDiamond && data[field] !== o.option_value) { patch.selectedDiamond = null; patch.diamondQuality = null; }
          // The gemstone pick belongs to the Gemstone shape and its carat size; changing either drops it. The gemstone path has no grade.
          if (key === 'shape' && o.option_value !== GEMSTONE_SHAPE_VALUE && (data.diamondGemstone || data.selectedGemstone)) { patch.diamondGemstone = null; patch.selectedGemstone = null; }
          if (key === 'shape' && o.option_value === GEMSTONE_SHAPE_VALUE) { patch.diamondSize = null; patch.diamondQuality = null; patch.selectedDiamond = null; }
          if (key === 'size' && data.selectedGemstone && data[field] !== o.option_value) { patch.selectedGemstone = null; setGemstoneStock(null); }
          // The colored path has no quality step either, so no grade or stone may linger from an earlier shape.
          if (key === 'shape' && o.option_value === COLORED_DIAMOND_SHAPE_VALUE) { patch.diamondQuality = null; patch.selectedDiamond = null; }
          // Likewise the colored silhouette belongs to the Colored Diamond card.
          if (key === 'shape' && o.option_value !== COLORED_DIAMOND_SHAPE_VALUE && data.diamondColoredShape) patch.diamondColoredShape = null;
          // A horizontal setting needs an elongated stone. Keep unrelated answers intact.
          if (key === 'shape' && o.option_value !== COLORED_DIAMOND_SHAPE_VALUE && data.diamondSetting === 'east-west-setting' && !ELONGATED_SHAPES.includes(o.option_value)) {
            patch.diamondSetting = null;
            setData(prev => ({ ...prev, ...patch })); setNotice('East–west was cleared because the new shape is not compatible. Choose another setting when you get there.'); setError('');
          } else set(patch);
          scheduleAutoAdvance();
        }
      };
      const imageUrl = quoteV3ImageUrl(key, o.option_value, o.image_url);
      const unavailable = key === 'setting' && o.option_value === 'east-west-setting' && !ELONGATED_SHAPES.includes(effectiveShape || '');
       return <label className="v3-choice" key={o.id}><input type={multi ? 'checkbox' : 'radio'} name={`v3-${key}`} checked={selected} disabled={unavailable} onChange={choose} onClick={!multi && !unavailable ? reselect(selected) : undefined} /><span className="v3-face"><span className="v3-media">{imageUrl ? <img src={imageUrl} alt="" loading="lazy" style={stockImageFitStyle(imageUrl)} /> : <HelpCircle size={34} aria-hidden="true" />}</span><span className="v3-card-copy"><strong>{o.name}</strong>{unavailable && <small>For elongated shapes only</small>}</span></span></label>;
    })}</fieldset>;
  };
  const metalVariants = getEnabledMetalKaratVariants(data.diamondMetal, config.form_content?.metalKarats);
  const combos = data.diamondMetal === 'two-tone' ? getEnabledTwoToneCombos(config.form_content?.twoToneCombos, toMetalPriceMap(options.metal)) : [];
  const render = () => {
     if (stage.key === 'review') return <div className="v3-review"><div className="v3-review-list">{REVIEW_GROUPS.map(group => {
      if (!group.stages.some(k => active.some(s => s.key === k))) return null;
      const values = breakdown.lines.filter(l => group.stages.includes(l.step as Stage)).map(l => l.value);
      if (group.stages.includes('inspiration') && enabled('inspiration')) values.push(data.inspirationImages.length ? `${data.inspirationImages.length} image(s)` : 'No images', data.otherDetails || 'No other details');
      if (group.stages.includes('ring_size') && enabled('ring_size')) values.push(data.ringSize || 'Size not sure');
      if (group.stages.includes('colored_shape') && coloredFlow) values.push(`Shape: ${coloredShapeLabel(data.diamondColoredShape) || 'Not selected'}`);
      if (group.stages.includes('gemstone') && gemstoneFlow) values.push(`Gemstone: ${quoteGemstoneLabel(data.diamondGemstone) || 'Not selected'}`);
      if (group.stages.includes('engraving') && active.some(s => s.key === 'engraving')) values.push(`Engraving: ${initials.trim() || 'Not entered'}`);
       return <div className="v3-review-row" key={group.label}><small>{group.label}</small><span>{values.join(' · ') || 'Not selected'}</span></div>;
      })}</div><div className="v3-review-price"><small>Your estimate is ready</small><h2>See your estimate</h2><p>Enter your contact details to reveal the estimate for this design.</p><Button className="v3-review-cta" onClick={() => { const missing = active.find(s => s.key !== 'review' && !valid(s)); if (missing) { go(missing.key); setError('Complete this selection before requesting your quote.'); } else setContact(true); }}>{testPreview ? 'Continue preview' : 'Request my quote'} <ArrowRight size={16} /></Button></div></div>;
    if (stage.key === 'inspiration') return <div className="v3-inspiration"><label className="v3-upload"><Upload size={28} /><strong>Add inspiration images</strong><small>Choose photos from your device</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { const files = [...(e.target.files || [])]; const accepted = files.filter(f => f.size <= 10 * 1024 * 1024).slice(0, 5 - data.inspirationImages.length); if (accepted.length !== files.length) setError('Up to five JPG, PNG or WebP images, 10 MB each.'); if (accepted.length) setNotice(`${accepted.length} ${accepted.length === 1 ? 'image' : 'images'} added.`); setData(prev => ({ ...prev, inspirationImages: [...prev.inspirationImages, ...accepted] })); e.target.value = ''; }} /></label><div className="v3-fields">{data.inspirationImages.map((file, i) => <div className="v3-file" key={`${file.name}-${i}`}><span>{file.name}</span><Button variant="ghost" size="icon" aria-label={`Remove ${file.name}`} onClick={() => set({ inspirationImages: data.inspirationImages.filter((_, n) => n !== i) })}><X size={16} /></Button></div>)}</div></div>;
    if (stage.key === 'details') return <div className="v3-fields"><label htmlFor="v3-details">Other details <small>Optional</small></label><Textarea id="v3-details" maxLength={1500} value={data.otherDetails} onChange={e => set({ otherDetails: e.target.value })} placeholder="Tell us anything else about your design" /></div>;
    if (stage.key === 'ring_size') return <div className="v3-fields"><label htmlFor="v3-ring-size">Ring size <small>Optional</small></label><Input id="v3-ring-size" value={data.ringSize} onChange={e => set({ ringSize: e.target.value })} placeholder="Not sure yet" /></div>;
     if (stage.key === 'timeline') return <fieldset className="v3-choices v3-choices-timeline"><legend className="sr-only">Preferred timing</legend>{getEnabledTimelineOptions(config.form_content?.timelineOptions).map(o => <label className="v3-choice" key={o.value}><input type="radio" name="v3-timeline" checked={data.diamondTimeline === o.value} onClick={reselect(data.diamondTimeline === o.value)} onChange={() => { set({ diamondTimeline: o.value }); scheduleAutoAdvance(); }} /><span className="v3-face v3-timing-face"><span className="v3-card-copy"><strong>{o.label}</strong></span></span></label>)}</fieldset>;
    if (stage.key === 'quality' && diamondPicker) return <DiamondPickerStep variant="v3" clientId={clientId} stoneType={data.diamondType} shape={effectiveShape} size={data.diamondSize} limit={diamondPickerConfig.limit} selected={data.selectedDiamond} currency={currency} onSelect={(d: QuoteSelectedDiamond) => { set({ selectedDiamond: d, diamondQuality: quoteDiamondQualityValue(d) }); scheduleAutoAdvance(); }} />;
    if (stage.key === 'gemstone_pick') return <GemstonePickerStep clientId={clientId} gemstone={data.diamondGemstone ?? null} size={data.diamondSize} config={gemstonePickerConfig} selected={data.selectedGemstone} currency={currency} onStockKnown={setGemstoneStock} onSelect={(g: QuoteSelectedGemstone) => { set({ selectedGemstone: g }); scheduleAutoAdvance(); }} />;
    if (stage.key === 'colored_shape') return <fieldset className="v3-choices v3-choices-shape"><legend className="sr-only">Colored diamond shape</legend>{coloredShapeOptions.map(o => {
      const selected = data.diamondColoredShape === o.option_value;
      const choose = () => {
        // The picked stone belongs to its silhouette; an east-west setting needs an elongated one.
        const patch: Partial<DiamondFormData> = { diamondColoredShape: o.option_value };
        if (data.selectedDiamond && !selected) { patch.selectedDiamond = null; patch.diamondQuality = null; }
        if (data.diamondSetting === 'east-west-setting' && !ELONGATED_SHAPES.includes(o.option_value)) {
          patch.diamondSetting = null;
          setData(prev => ({ ...prev, ...patch })); setNotice('East–west was cleared because the new shape is not compatible. Choose another setting when you get there.'); setError('');
        } else set(patch);
        scheduleAutoAdvance();
      };
      const imageUrl = quoteV3ImageUrl('shape', o.option_value, o.image_url);
      return <label className="v3-choice" key={o.id}><input type="radio" name="v3-colored-shape" checked={selected} onChange={choose} onClick={reselect(selected)} /><span className="v3-face"><span className="v3-media">{imageUrl ? <img src={imageUrl} alt="" loading="lazy" style={stockImageFitStyle(imageUrl)} /> : <HelpCircle size={34} aria-hidden="true" />}</span><span className="v3-card-copy"><strong>{o.name}</strong></span></span></label>;
    })}</fieldset>;
    if (stage.key === 'gemstone') return <fieldset className="v3-choices v3-choices-gemstone"><legend className="sr-only">Gemstone</legend>{QUOTE_GEMSTONES.map(gem => {
      const selected = data.diamondGemstone === gem.value;
      return <label className="v3-choice" key={gem.value}><input type="radio" name="v3-gemstone" checked={selected} onClick={reselect(selected)} onChange={() => { set({ diamondGemstone: gem.value, ...(data.diamondGemstone !== gem.value ? { selectedGemstone: null } : {}) }); if (data.diamondGemstone !== gem.value) setGemstoneStock(null); scheduleAutoAdvance(); }} /><span className="v3-face"><span className="v3-media v3-gem-media" style={{ '--v3-gem-tint': gem.tint } as CSSProperties}><img src={quoteGemstoneImageUrl(gem)} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.classList.add('v3-gem-missing'); }} /><span className="v3-gem-swatch" aria-hidden="true" /></span><span className="v3-card-copy"><strong>{gem.name}</strong></span></span></label>;
    })}</fieldset>;
    if (stage.key === 'personalization') return optionGroups('personalization', true);
    if (stage.key === 'engraving') return <div className="v3-fields"><label htmlFor="v3-initials">Engraving text</label><Input id="v3-initials" maxLength={30} value={initials} onChange={e => { setInitials(e.target.value); setError(''); }} placeholder="Enter up to 30 characters" /></div>;
     if (stage.key === 'two_tone') return <fieldset className="v3-text-choices"><legend className="sr-only">Two-tone combination</legend>{combos.map(c => <label key={c.value}><input type="radio" name="v3-combo" checked={data.diamondTwoToneMetals === c.value} onClick={reselect(data.diamondTwoToneMetals === c.value)} onChange={() => { set({ diamondTwoToneMetals: c.value }); scheduleAutoAdvance(); }} />{c.name}</label>)}</fieldset>;
     if (stage.key === 'metal_karat') return <fieldset className="v3-text-choices"><legend className="sr-only">Metal purity</legend>{metalVariants.map(k => <label key={k.value}><input type="radio" name="v3-karat" checked={data.diamondMetalKarat === k.value} onClick={reselect(data.diamondMetalKarat === k.value)} onChange={() => { set({ diamondMetalKarat: k.value }); scheduleAutoAdvance(); }} />{k.name}</label>)}</fieldset>;
    return optionGroups(stage.key as keyof AllDiamondFormOptions);
  };
  const category = CATEGORIES[stage.category];
  const categoryStage = active.filter(s => s.category === stage.category);
  // The stone picker is a list, not an image grid: keep the stacked layout for it.
  const pickerStage = stage.key === 'quality' && diamondPicker;
  const gemPickStage = stage.key === 'gemstone_pick';
  const gemPickName = quoteGemstoneLabel(data.diamondGemstone) || 'gemstone';
  // The size cards are shared; on the gemstone path they read as the gemstone's carat size.
  const gemSizeStage = stage.key === 'size' && gemstoneFlow;
  const imageStage = IMAGE_STAGES.has(stage.key) && !pickerStage;
   return <div className={`v3-page ${embedded ? 'v3-embedded' : ''} ${travel === 'back' ? 'v3-motion-back' : ''}`} style={palette}>
    <div className="v3-shell">
      <div className="v3-progress">
        <div className="v3-mobile-progress"><span>{category} · {categoryStage.findIndex(s => s.key === stage.key) + 1} of {categoryStage.length}</span></div>
        <div className="v3-progress-items">{CATEGORIES.map((name, n) => <div key={name} className={`v3-progress-item ${stage.category === n ? 'active' : ''} ${stage.category > n ? 'done' : ''}`}><span>{stage.category > n ? <Check size={13} /> : n + 1}</span><div>{name}{stage.category === n && <small>{categoryStage.findIndex(s => s.key === stage.key) + 1} of {categoryStage.length}</small>}</div></div>)}</div>
      </div>
      <div className={`v3-workspace ${stage.key === 'review' ? 'v3-review-workspace' : ''} ${imageStage ? 'v3-image-workspace' : ''}`}>
        <div className="v3-intro">
          <div className="v3-heading">
            <h1>{stage.key === 'nature' ? 'Let’s start your ring' : heading?.title || (pickerStage ? 'Choose your diamond.' : gemPickStage ? `Choose your ${gemPickName.toLowerCase()}.` : gemSizeStage ? `Choose your ${gemPickName.toLowerCase()} size.` : stage.title)}</h1>
            <p>{stage.key === 'nature' ? 'Estimate in 2 min' : heading?.subtitle || (pickerStage ? 'Filter by colour and clarity, then pick the exact stone for your ring.' : gemPickStage ? `Sort by price and pick the exact ${gemPickName.toLowerCase()} for your ring.` : gemSizeStage ? `Carat measures weight. We will show you ${gemPickName.toLowerCase()} stones in this range.` : stage.subtitle)}</p>
            {stage.key === 'nature' && <span className="v3-opening-prompt">Choose natural or lab diamonds</span>}
          </div>
        </div>
        <main className="v3-main" ref={mainRef} key={stage.key}>
          {render()}
          {notice && <p className="v3-context" role="status">{notice}</p>}
          {error && <p className="v3-error" role="alert">{error}</p>}
          {stage.key === 'size' && <p className="v3-context">Images are illustrative and not shown to scale.</p>}
          {stage.key === 'timeline' && <p className="v3-context">Timing is subject to confirmation.</p>}
        </main>
      </div>
      <div ref={actionsRef} className={`v3-actions ${stage.key === 'review' ? 'v3-review-actions' : ''}`}>
        {showScrollCue && <div className="v3-scroll-cue" aria-hidden="true"><ArrowDown size={19} strokeWidth={1.7} /><span>Scroll for more</span></div>}
        <Button className="v3-back" variant="outline" disabled={currentPosition === 0} onClick={previous}><ArrowLeft size={16} /> Back</Button>
        {stage.key !== 'review' && <Button className="v3-next" onClick={next}>{active[currentPosition + 1]?.key === 'review' ? 'Review my design' : 'Continue'} <ArrowRight size={16} /></Button>}
        {stage.key === 'review' && <Button className="v3-mobile-review-cta" onClick={() => { const missing = active.find(s => s.key !== 'review' && !valid(s)); if (missing) { go(missing.key); setError('Complete this selection before requesting your quote.'); } else setContact(true); }}>{testPreview ? 'Continue preview' : 'Request my quote'} <ArrowRight size={16} /></Button>}
      </div>
      <div className="v3-page-note"><span>{testPreview ? 'This preview does not send or save a request.' : 'Selections are not sent until you request a quote.'}</span><span>No obligation</span></div>
    </div>
  </div>;
}