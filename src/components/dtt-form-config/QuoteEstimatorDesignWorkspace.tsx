import { useState } from 'react';
import { Monitor, RotateCcw, Smartphone, SlidersHorizontal } from 'lucide-react';
import { ClaimStep, defaultClaimFooterNote } from '@/components/diamonds-form/ClaimStep';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { DttFormColors, DttFormContent } from '@/hooks/useClientDttFormConfig';
import { getDiamondShapeIcon } from '@/lib/diamond-shape-icons';
import {
  resolveQuoteEstimatorTheme,
  type QuoteEstimatorThemeOverrides,
} from '@/lib/quote-estimator-theme';

interface Props {
  colors: DttFormColors;
  content: DttFormContent;
  savedContent?: DttFormContent | null;
  onChange: (next: DttFormContent) => void;
}

type GlassLevel = 'off' | 'soft' | 'strong';
type CornerLevel = 'square' | 'soft' | 'rounded';

const SAMPLE_LINES = [
  { label: 'Diamond Type', value: 'Lab-grown', price: 0 },
  { label: 'Diamond Shape', value: 'Oval', price: 0 },
  { label: 'Diamond Size', value: '2.00ct', price: 6200 },
  { label: 'Ring Setting', value: 'Hidden Halo', price: 750 },
  { label: 'Ring Metal', value: '18k Yellow Gold', price: 0 },
];

const GLASS_LEVELS: Record<GlassLevel, QuoteEstimatorThemeOverrides> = {
  off: { surfaceOpacity: 0, surfaceBlur: 0, borderOpacity: 0, glowIntensity: 0 },
  soft: { surfaceOpacity: 0.72, surfaceBlur: 12, borderOpacity: 0.45, glowIntensity: 0.28 },
  strong: { surfaceOpacity: 0.28, surfaceBlur: 22, borderOpacity: 0.65, glowIntensity: 0.52 },
};

const CORNER_LEVELS: Record<CornerLevel, QuoteEstimatorThemeOverrides> = {
  square: { borderRadius: 4, buttonBorderRadius: 4 },
  soft: { borderRadius: 16, buttonBorderRadius: 10 },
  rounded: { borderRadius: 24, buttonBorderRadius: 999 },
};

function ThemeColor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground uppercase">{value}</span>
        <Input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-9 cursor-pointer p-1" />
      </span>
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? 'default' : 'ghost'}
          onClick={() => onChange(option.value)}
          className="h-8"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Non-interactive preview of the Theme 2 thank-you page, rendered from the
 * unsaved colours and wording so edits show before Save Configuration.
 * Shared by the Thank-you Design and Design Credit tabs.
 */
export function QuoteEstimatorThankYouPreview({ colors, content }: { colors: DttFormColors; content: DttFormContent }) {
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>('mobile');
  const theme = resolveQuoteEstimatorTheme(colors, content.theme);
  const previewWidth = viewport === 'mobile' ? 390 : 672;
  return (
    <aside className="xl:sticky xl:top-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Live thank-you preview</p>
          <p className="text-xs text-muted-foreground">Updates before you save.</p>
        </div>
        <div className="flex rounded-md border border-border bg-muted p-1">
          <Button type="button" size="icon" variant={viewport === 'mobile' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => setViewport('mobile')} aria-label="Mobile preview"><Smartphone className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant={viewport === 'desktop' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => setViewport('desktop')} aria-label="Desktop preview"><Monitor className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="overflow-auto rounded-md border border-border bg-muted p-3 max-h-[76vh]">
        <div className="mx-auto origin-top pointer-events-none select-none" style={{ width: previewWidth, zoom: viewport === 'mobile' ? 0.82 : 0.64 }} aria-label="Non-interactive thank-you page preview">
          <ClaimStep
            theme={theme}
            firstName="Alex"
            email="alex@example.com"
            shapeName="Oval"
            shapeImageUrl={getDiamondShapeIcon('oval') || undefined}
            ringLines={['2.00ct · VS1 · F', '18k Yellow Gold · Hidden Halo']}
            total={8450}
            currency="USD"
            lineItems={SAMPLE_LINES}
            creditAmount={content.incentiveAmount ?? 1000}
            creditHoldDays={content.creditHoldDays ?? 7}
            storeName="Your team"
            defaultPhoneNumber="5551234567"
            defaultCountryCode="+1"
            defaultCountryIso="US"
            title={content.thankYouTitle}
            message={content.thankYouMessage}
            note={content.thankYouLabNote}
            footerNote={content.claimFooterNote}
            reassuranceNote={content.claimReassuranceNote}
            followUpNote={content.claimFollowUpNote}
            smsDisclaimer={content.claimSmsDisclaimer}
            phoneConfirmNote={content.claimPhoneConfirmNote}
            creditEyebrow={content.claimCreditEyebrow}
            creditHeadline={content.claimCreditHeadline}
            creditHoldLine={content.claimCreditHoldLine}
            phoneLabel={content.claimPhoneLabel}
            buttonLabel={content.claimButtonLabel}
            showCreditPrice={content.claimShowCreditPrice !== false}
            strikeThroughTotal={content.claimStrikeThroughTotal !== false}
            contactTiles={content.contactTiles}
            bookingUrl={content.bookingUrl}
          />
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">Preview only — buttons and links are disabled.</p>
    </aside>
  );
}

export function QuoteEstimatorDesignWorkspace({ colors, content, savedContent, onChange }: Props) {
  const theme = resolveQuoteEstimatorTheme(colors, content.theme);
  const setTheme = (patch: QuoteEstimatorThemeOverrides) => onChange({ ...content, theme: { ...(content.theme || {}), ...patch } });
  const glassLevel: GlassLevel = theme.surfaceBlur === 0 && theme.glowIntensity === 0
    ? 'off'
    : theme.surfaceBlur >= 20 || theme.glowIntensity >= 0.5 ? 'strong' : 'soft';
  const cornerLevel: CornerLevel = theme.borderRadius <= 6 ? 'square' : theme.borderRadius >= 22 ? 'rounded' : 'soft';

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <div className="space-y-5">
        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Make it yours</h3>
            <p className="text-xs text-muted-foreground">The most useful controls, with safe combinations for the glass finish.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ThemeColor label="Page background" value={theme.background} onChange={(background) => setTheme({ background })} />
            <ThemeColor label="Card color" value={theme.surfaceColor} onChange={(surfaceColor) => setTheme({ surfaceColor, tileBackground: surfaceColor })} />
            <ThemeColor label="Text color" value={theme.fontColor} onChange={(fontColor) => setTheme({ fontColor })} />
            <ThemeColor label="Accent color" value={theme.accentColor} onChange={(accentColor) => setTheme({ accentColor, highlightColor: accentColor })} />
            <ThemeColor label="Button color" value={theme.buttonColor} onChange={(buttonColor) => setTheme({ buttonColor })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Glass effect</Label>
              <Segmented value={glassLevel} options={[{ value: 'off', label: 'Off' }, { value: 'soft', label: 'Soft' }, { value: 'strong', label: 'Strong' }]} onChange={(value) => setTheme(GLASS_LEVELS[value])} />
            </div>
            <div className="space-y-1.5">
              <Label>Corners</Label>
              <Segmented value={cornerLevel} options={[{ value: 'square', label: 'Square' }, { value: 'soft', label: 'Soft' }, { value: 'rounded', label: 'Rounded' }]} onChange={(value) => setTheme(CORNER_LEVELS[value])} />
            </div>
          </div>
        </section>

        <Accordion type="single" collapsible className="border-t border-border">
          <AccordionItem value="advanced" className="border-b-0">
            <AccordionTrigger className="text-sm"><span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Advanced controls</span></AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ['Muted text', 'mutedTextColor'], ['Hairline', 'borderColor'], ['Glow', 'glowColor'],
                  ['Secondary highlight', 'highlightMutedColor'], ['Field border', 'inputBorderColor'],
                  ['Button text', 'buttonTextColor'], ['Error', 'errorColor'], ['Success', 'successColor'],
                ] as const).map(([label, key]) => (
                  <ThemeColor key={key} label={label} value={theme[key]} onChange={(value) => setTheme({ [key]: value })} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {([
                  ['surfaceOpacity', 'Card fill', 0.05], ['surfaceBlur', 'Blur (px)', 1],
                  ['borderOpacity', 'Border strength', 0.05], ['glowIntensity', 'Glow strength', 0.05],
                  ['borderRadius', 'Card radius', 1], ['buttonBorderRadius', 'Button radius', 1],
                ] as const).map(([key, label, step]) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs">{label}</Label>
                    <Input type="number" min={0} step={step} value={theme[key]} onChange={(event) => setTheme({ [key]: Math.max(0, Number(event.target.value) || 0) })} />
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Accordion type="single" collapsible defaultValue="details" className="border-t border-border">
          <AccordionItem value="details" className="border-b-0">
            <AccordionTrigger className="text-sm">Thank-you details</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Credit held for (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={content.creditHoldDays ?? ''}
                    placeholder="7"
                    onChange={(event) => onChange({ ...content, creditHoldDays: event.target.value === '' ? undefined : Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Footer line</Label>
                  <Input
                    value={content.claimFooterNote ?? defaultClaimFooterNote(content.creditHoldDays ?? 7)}
                    placeholder="Leave empty to hide this line"
                    onChange={(event) => onChange({ ...content, claimFooterNote: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-3 border-t border-border pt-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Contact choices</p>
                  <p className="text-xs text-muted-foreground">Add a destination to show that choice on the thank-you page.</p>
                </div>
                {([
                  ['whatsapp', 'WhatsApp', 'Phone number'],
                  ['call', 'Call the studio', 'Phone number'],
                  ['email', 'Message us', 'Email address'],
                  ['booking', 'Book a visit', 'Booking URL'],
                ] as const).map(([key, fallbackLabel, placeholder]) => {
                  const tile = content.contactTiles?.[key] || {};
                  const updateTile = (patch: { enabled?: boolean; value?: string; label?: string }) => onChange({
                    ...content,
                    contactTiles: { ...content.contactTiles, [key]: { ...tile, ...patch } },
                  });
                  return (
                    <div key={key} className="grid items-center gap-2 sm:grid-cols-[auto_1fr_1fr]">
                      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Switch
                          checked={key === 'booking' ? tile.enabled !== false : tile.enabled === true}
                          onCheckedChange={(enabled) => updateTile({ enabled })}
                        />
                        {fallbackLabel}
                      </label>
                      <Input value={tile.value ?? ''} placeholder={placeholder} onChange={(event) => updateTile({ value: event.target.value })} />
                      <Input value={tile.label ?? ''} placeholder={`Label: ${fallbackLabel}`} onChange={(event) => updateTile({ label: event.target.value })} />
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...content, theme: savedContent?.theme ? { ...savedContent.theme } : undefined })}>
            <RotateCcw className="mr-2 h-4 w-4" />Reset to saved
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...content, theme: undefined })}>Reset to default</Button>
        </div>
      </div>

      <QuoteEstimatorThankYouPreview colors={colors} content={content} />
    </div>
  );
}