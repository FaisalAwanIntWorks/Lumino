import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Info, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DiamondWizardState } from '../types';
import { CLARITY_GROUPS, COLOR_GROUPS, STANDARD_CARAT_RANGES, QUALITY_GRADES, FLUORESCENCE_LEVELS } from '../defaults';
import { useDiamondPoolOptions } from '@/hooks/useDiamondPoolOptions';
import { normalizeColor, normalizeClarity, normalizeQuality, normalizeFluorescence, normalizeLab } from '@/lib/diamond-pool-normalize';

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-primary cursor-help inline ml-1" />
        </TooltipTrigger>
        <TooltipContent className="max-w-[250px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SelectAllClear({ onSelectAll, onClear }: { onSelectAll: () => void; onClear: () => void }) {
  return (
    <span className="ml-auto flex items-center gap-2 text-[11px] font-medium">
      <button
        type="button"
        onClick={onSelectAll}
        className="text-primary hover:underline"
      >
        Select all
      </button>
      <span className="text-muted-foreground/40">|</span>
      <button
        type="button"
        onClick={onClear}
        className="text-muted-foreground hover:text-primary hover:underline"
      >
        Clear all
      </button>
    </span>
  );
}

interface Props {
  state: DiamondWizardState;
  onChange: (state: DiamondWizardState) => void;
}

export function DiamondGradingStep({ state, onChange }: Props) {
  const { grading } = state;
  const { data: pool } = useDiamondPoolOptions();

  // Defensive: legacy saved states may lack these arrays. Coerce to [] so
  // .includes() never throws and the sections always render.
  const safeCutGrades = grading.cutGrades ?? [];
  const safePolish = grading.polish ?? [];
  const safeSymmetry = grading.symmetry ?? [];
  const safeFluorescence = grading.fluorescence ?? [];
  const safeLabs = grading.labs ?? [];


  // Color groups: only the standard groups (no "Other (in stock)" per product requirement)
  const colorGroups: ReadonlyArray<{ label: string; grades: readonly string[] }> = COLOR_GROUPS;

  const knownClarities = new Set<string>(CLARITY_GROUPS.flatMap(g => g.grades));
  const extraClarities = Array.from(new Set(
    (pool?.clarities ?? []).map(normalizeClarity).filter(c => c && !knownClarities.has(c))
  )).sort();
  // Exclude the "Included" group (I1, I2, I3) per product requirement
  const baseClarityGroups = CLARITY_GROUPS.filter(g => g.label !== 'Included');
  const clarityGroups: ReadonlyArray<{ label: string; grades: readonly string[] }> = extraClarities.length > 0
    ? [...baseClarityGroups, { label: 'Other (in stock)', grades: extraClarities }]
    : baseClarityGroups;

  const updateGrading = (partial: Partial<typeof grading>) => {
    onChange({ ...state, grading: { ...grading, ...partial } });
  };

  const toggleItem = (list: string[], item: string): string[] => {
    return list.includes(item) ? list.filter(i => i !== item) : [...list, item];
  };


  const toggleGroupClarities = (grades: readonly string[]) => {
    const allSelected = grades.every(g => grading.clarities.includes(g));
    if (allSelected) {
      updateGrading({ clarities: grading.clarities.filter(c => !grades.includes(c)) });
    } else {
      const newClarities = [...new Set([...grading.clarities, ...grades])];
      updateGrading({ clarities: newClarities });
    }
  };

  const toggleGroupColors = (grades: readonly string[]) => {
    const allSelected = grades.every(g => grading.colors.includes(g));
    if (allSelected) {
      updateGrading({ colors: grading.colors.filter(c => !grades.includes(c)) });
    } else {
      const newColors = [...new Set([...grading.colors, ...grades])];
      updateGrading({ colors: newColors });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">What quality grades do you carry?</h3>
        <p className="text-sm text-muted-foreground">Configure carat weight and clarity for your diamond inventory.</p>
      </div>

      {/* Carat Weight Range */}
      <div className="space-y-3">
        <div className="flex items-center">
          <Label className="text-sm font-semibold">Carat Weight Range <InfoTip text="The weight range of diamonds you carry. 1 carat = 0.2 grams. Select the carat ranges you want to offer." /></Label>
          <SelectAllClear
            onSelectAll={() => updateGrading({ caratRange: [STANDARD_CARAT_RANGES[0].min, STANDARD_CARAT_RANGES[STANDARD_CARAT_RANGES.length - 1].max] })}
            onClear={() => updateGrading({ caratRange: [0, 0] })}
          />
        </div>
        <p className="text-xs text-muted-foreground">Select the carat ranges you want to include in your catalog.</p>
        <div className="space-y-1.5">
          {STANDARD_CARAT_RANGES.map((range) => {
            const isSelected = grading.caratRange[0] <= range.min && grading.caratRange[1] >= range.max;
            return (
              <button
                key={range.label}
                onClick={() => {
                  if (isSelected) {
                    const remaining = STANDARD_CARAT_RANGES.filter(
                      r => r.label !== range.label && grading.caratRange[0] <= r.min && grading.caratRange[1] >= r.max
                    );
                    if (remaining.length > 0) {
                      updateGrading({ caratRange: [remaining[0].min, remaining[remaining.length - 1].max] });
                    }
                  } else {
                    const newMin = Math.min(grading.caratRange[0], range.min);
                    const newMax = Math.max(grading.caratRange[1], range.max);
                    updateGrading({ caratRange: [newMin, newMax] });
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border-primary text-foreground'
                    : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground border border-border'
                }`}>
                  {range.display}
                </span>
                <span className="text-sm flex-1 text-left">{range.label}</span>
                {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Color Grade */}
      <div className="space-y-3">
        <div className="flex items-center">
          <Label className="text-sm font-semibold">Color Grade <InfoTip text="Color is graded D (colorless) to M (faint). D-F are colorless, G-J near colorless, K-M faint." /></Label>
          <SelectAllClear
            onSelectAll={() => updateGrading({ colors: Array.from(new Set(colorGroups.flatMap(g => g.grades as readonly string[]))) })}
            onClear={() => updateGrading({ colors: [] })}
          />
        </div>
        <p className="text-xs text-muted-foreground">Select the color grades you carry in your inventory.</p>
        <div className="space-y-2">
          {colorGroups.map(group => (
            <div key={group.label} className="flex items-center gap-2">
              <button
                onClick={() => toggleGroupColors(group.grades)}
                className="text-xs font-medium text-muted-foreground hover:text-primary w-28 text-left shrink-0"
              >
                {group.label}
              </button>
              <div className="flex flex-wrap gap-1.5">
                {group.grades.map(grade => (
                  <button
                    key={grade}
                    onClick={() => updateGrading({ colors: toggleItem(grading.colors, grade) })}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      grading.colors.includes(grade)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Clarity Grade */}
      <div className="space-y-3">
        <div className="flex items-center">
          <Label className="text-sm font-semibold">Clarity Grade <InfoTip text="Clarity measures internal inclusions. FL/IF is flawless, VVS/VS have minor inclusions, SI has noticeable ones." /></Label>
          <SelectAllClear
            onSelectAll={() => updateGrading({ clarities: Array.from(new Set(clarityGroups.flatMap(g => g.grades as readonly string[]))) })}
            onClear={() => updateGrading({ clarities: [] })}
          />
        </div>
        <div className="space-y-2">
          {clarityGroups.map(group => (
            <div key={group.label} className="flex items-center gap-2">
              <button
                onClick={() => toggleGroupClarities(group.grades)}
                className="text-xs font-medium text-muted-foreground hover:text-primary w-20 text-left shrink-0"
              >
                {group.label}
              </button>
              <div className="flex flex-wrap gap-1.5">
                {group.grades.map(grade => (
                  <button
                    key={grade}
                    onClick={() => updateGrading({ clarities: toggleItem(grading.clarities, grade) })}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      grading.clarities.includes(grade)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Cut / Polish / Symmetry */}
      {(() => {
        // Exclude Fair and Poor per product requirement
        const ALLOWED_QUALITY = QUALITY_GRADES.filter(q => q !== 'Fair' && q !== 'Poor');
        const isAllowedQuality = (q: string) => q && q !== 'Fair' && q !== 'Poor';
        const cutOptions = Array.from(new Set([
          ...ALLOWED_QUALITY,
          ...((pool?.cuts ?? []).map(normalizeQuality).filter(isAllowedQuality)),
        ]));
        const polishOptions = Array.from(new Set([
          ...ALLOWED_QUALITY,
          ...((pool?.polish ?? []).map(normalizeQuality).filter(isAllowedQuality)),
        ]));
        const symmetryOptions = Array.from(new Set([
          ...ALLOWED_QUALITY,
          ...((pool?.symmetry ?? []).map(normalizeQuality).filter(isAllowedQuality)),
        ]));

        const renderPills = (
          label: string,
          tip: string,
          options: string[],
          selected: string[],
          onToggle: (v: string) => void,
          onSetAll: (all: string[]) => void,
        ) => (
          <div className="space-y-2">
            <div className="flex items-center">
              <Label className="text-sm font-semibold">
                {label} <InfoTip text={tip} />
              </Label>
              <SelectAllClear
                onSelectAll={() => onSetAll(options)}
                onClear={() => onSetAll([])}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {options.map(opt => (
                <button
                  key={opt}
                  onClick={() => onToggle(opt)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    selected.includes(opt)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );

        return (
          <div className="space-y-5">
            {renderPills(
              'Cut Grade',
              'Cut quality (Round only). Filters pool by the cut column.',
              cutOptions,
              safeCutGrades,
              (v) => updateGrading({ cutGrades: toggleItem(safeCutGrades, v) }),
              (all) => updateGrading({ cutGrades: all }),
            )}
            {renderPills(
              'Polish',
              'Polish quality. Filters pool by the pol column.',
              polishOptions,
              safePolish,
              (v) => updateGrading({ polish: toggleItem(safePolish, v) }),
              (all) => updateGrading({ polish: all }),
            )}
            {renderPills(
              'Symmetry',
              'Symmetry quality. Filters pool by the symm column.',
              symmetryOptions,
              safeSymmetry,
              (v) => updateGrading({ symmetry: toggleItem(safeSymmetry, v) }),
              (all) => updateGrading({ symmetry: all }),
            )}
          </div>
        );

      })()}

      <Separator />

      {/* Lab (Certification) */}
      {(() => {
        const labOptions = ['GIA', 'IGI'];
        return (
          <div className="space-y-2">
            <div className="flex items-center">
              <Label className="text-sm font-semibold">
                Lab (Certification) <InfoTip text="Certifying lab. Filters pool by the lab column." />
              </Label>
              <SelectAllClear
                onSelectAll={() => updateGrading({ labs: labOptions })}
                onClear={() => updateGrading({ labs: [] })}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {labOptions.map(opt => (
                <button
                  key={opt}
                  onClick={() => updateGrading({ labs: toggleItem(grading.labs ?? [], opt) })}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    (grading.labs ?? []).includes(opt)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <Separator />


      {/* Measurements */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">
          Measurements (Length in mm)
          <InfoTip text="Optional. Filters pool stones by the length column. Leave blank to allow all lengths." />
        </Label>
        <p className="text-xs text-muted-foreground">Restrict pool matches to stones within this length range (mm).</p>
        <div className="flex items-center gap-3 max-w-sm">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Min</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="e.g. 5.00"
              value={grading.measurementsMinLength ?? ''}
              onChange={(e) => updateGrading({
                measurementsMinLength: e.target.value === '' ? null : Number(e.target.value),
              })}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Max</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="e.g. 8.50"
              value={grading.measurementsMaxLength ?? ''}
              onChange={(e) => updateGrading({
                measurementsMaxLength: e.target.value === '' ? null : Number(e.target.value),
              })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
