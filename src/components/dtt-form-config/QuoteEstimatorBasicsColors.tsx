import { useEffect, useState } from 'react';
import { Check, SlidersHorizontal } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DttFormColors, DttFormContent } from '@/hooks/useClientDttFormConfig';
import { normalizeHex } from '@/lib/color-utils';
import { quoteV3ThemeStyle } from '@/lib/quote-v3-theme';
import '../diamonds-form/quote-v3.css';

/**
 * Sandbox-only simplified colour controls for the Quote Estimator form steps.
 *
 * Instead of seven equally-weighted colour pickers, the client picks a palette
 * and then adjusts four colours that visibly matter. Everything else (card
 * background, button text, selected-card fill, field styling) moves into a
 * collapsed Advanced section. A small live preview of a real option step shows
 * exactly which colour drives the selected state — the previous confusion
 * between "Accent" and "Highlight".
 */

interface Props {
  colors: DttFormColors;
  content: DttFormContent;
  onColorsChange: (patch: Partial<DttFormColors>) => void;
  onContentChange: (patch: Partial<DttFormContent>) => void;
  version?: 'v1' | 'v2' | 'v3';
  /** Stack the step preview under the colours (used when a live preview is already docked beside the panel). */
  stack?: boolean;
}

/**
 * One colour setting: a hex box you can type into plus the native swatch
 * picker (whose popup is drawn by the browser and OS, so it looks different
 * on Windows, Mac and iPhone). The hex box commits on Enter or blur, accepts
 * "6868a7", "#6868A7" or the short "#68a" form, and snaps back to the saved
 * colour when the text is not a colour.
 */
function ColorRow({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    const text = draft.trim();
    const hex = normalizeHex(text.startsWith('#') ? text : `#${text}`);
    if (!hex) { setDraft(value); return; }
    setDraft(hex);
    if (hex !== value) onChange(hex);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-[11px] leading-4 text-muted-foreground">{hint}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Input
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={7}
          value={draft}
          aria-label={`${label} hex code`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') setDraft(value);
          }}
          className="h-8 w-[5.75rem] px-2 font-mono text-xs uppercase"
        />
        <Input type="color" value={value} aria-label={`${label} colour picker`} onChange={(e) => onChange(e.target.value)} className="h-8 w-9 cursor-pointer p-1" />
      </span>
    </div>
  );
}

export function QuoteEstimatorBasicsColors({ colors, content, onColorsChange, onContentChange, version, stack = false }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(1);
  const [showV3Summary, setShowV3Summary] = useState(false);

  const background = colors.background || '#EDE8E3';
  const fontColor = colors.fontColor || '#613623';
  const accent = colors.tabBorder || '#1f2937';
  const cardBg = colors.imageBg || '#ffffff';
  const buttonBg = colors.submitButtonBg || '#000000';
  const buttonText = colors.submitButtonText || '#ffffff';
  const highlight = colors.highlight || '#F1F1F1';

  return (
    <div className={`grid items-start gap-6 ${stack ? '' : 'xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]'}`}>
      <div className="space-y-5">

        <section className="space-y-2">
          <div>
            <h4 className="text-base font-semibold text-foreground">The four that matter</h4>
            <p className="text-xs text-muted-foreground">Everything else follows these.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ColorRow label="Page background" value={background} onChange={(v) => onColorsChange({ background: v })} />
            <ColorRow label="Text" value={fontColor} onChange={(v) => onColorsChange({ fontColor: v })} />
            <ColorRow label="Selection colour" hint="Ring and tick on a chosen option" value={accent} onChange={(v) => onColorsChange({ tabBorder: v })} />
            <ColorRow label="Button" value={buttonBg} onChange={(v) => onColorsChange({ submitButtonBg: v, submitButtonText: buttonText })} />
          </div>
        </section>

        <Accordion type="single" collapsible className="border-t border-border">
          <AccordionItem value="advanced" className="border-b-0">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Advanced colours</span>
            </AccordionTrigger>
            <AccordionContent className="grid gap-2 pt-2 sm:grid-cols-2">
              <ColorRow label="Option card background" value={cardBg} onChange={(v) => onColorsChange({ imageBg: v })} />
              <ColorRow label="Button text" value={buttonText} onChange={(v) => onColorsChange({ submitButtonText: v })} />
              <ColorRow label="Selected card fill" hint="Tint behind a chosen card (Personalization step)" value={highlight} onChange={(v) => onColorsChange({ highlight: v })} />
              <ColorRow label="Field border" hint="Every text field across the form" value={content.contactBorderColor || '#000000'} onChange={(v) => onContentChange({ contactBorderColor: v })} />
              <ColorRow label="Placeholder text" value={content.contactPlaceholderColor || '#9CA3AF'} onChange={(v) => onContentChange({ contactPlaceholderColor: v })} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <aside className={stack ? undefined : 'xl:sticky xl:top-4'}>
        <p className="mb-2 text-sm font-semibold text-foreground">Live step preview</p>
        {version === 'v3' ? <div className="v3-page v3-config-preview rounded-md border border-border p-4" style={quoteV3ThemeStyle(colors)}>
          <p className="text-center text-sm font-semibold">Choose your band width</p>
          <div className="v3-text-choices mt-3 !mb-0 !grid-cols-3">
            {['1.8mm', '2.2mm', '2.6mm'].map((label, i) => <label key={label} className="!p-3 text-xs"><input type="radio" name="v3-config-preview-width" checked={i === selectedIndex} onChange={() => setSelectedIndex(i)} />{label}</label>)}
          </div>
          <div className="v3-actions mt-4 !gap-2"><Button type="button" variant="link" className="!p-0 !text-[color:var(--v3-ink)]" onClick={() => setShowV3Summary(!showV3Summary)}>Your design</Button><Button type="button" className="v3-next !min-w-0" onClick={() => setSelectedIndex((selectedIndex + 1) % 3)}>Continue</Button></div>
          {showV3Summary && <div className="v3-config-summary"><h5>Your design</h5><p>Band width · {['1.8mm', '2.2mm', '2.6mm'][selectedIndex]}</p></div>}
        </div> : <div className="rounded-md border border-border p-4" style={{ backgroundColor: background }}>
          <p className="text-center text-sm font-semibold" style={{ color: fontColor }}>Choose your band width</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {['1.8mm', '2.2mm', '2.6mm'].map((label, i) => {
              const on = i === selectedIndex;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSelectedIndex(i)}
                  className="relative rounded-md p-3 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: on ? highlight : cardBg,
                    color: fontColor,
                    boxShadow: on ? `0 0 0 3px ${accent}` : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                  }}
                >
                  {on && (
                    <span
                      className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full"
                      style={{ backgroundColor: accent, color: buttonText }}
                    >
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                  {label}
                </button>
              );
            })}
          </div>
          <div
            className="mt-4 rounded-md px-3 py-2 text-center text-xs font-semibold"
            style={{ backgroundColor: buttonBg, color: buttonText }}
          >
            Continue
          </div>
          <div className="mt-3">
            <div
              className="rounded-md px-3 py-2 text-xs"
              style={{ border: `1px solid ${content.contactBorderColor || 'transparent'}`, color: content.contactPlaceholderColor || '#9CA3AF', backgroundColor: cardBg }}
            >
              First Name*
            </div>
          </div>
        </div>}
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Tap a card to see the selected state.</p>
        <div className="mt-3">
          <Label className="text-[11px] text-muted-foreground">
            Selection colour drives the ring and tick on every option step. The selected card fill only tints the card itself.
          </Label>
        </div>
      </aside>
    </div>
  );
}
