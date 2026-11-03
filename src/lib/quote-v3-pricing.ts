import type { DiamondFormData } from '@/pages/client/DiamondsForm';
import type { AllDiamondFormOptions } from '@/hooks/useAllDiamondFormOptions';
import type { DttFormContent } from '@/hooks/useClientDttFormConfig';
import { findMetalKarat, findTwoToneCombo, toMetalPriceMap } from '@/lib/dtt-metal-karats';
import { findTimelineOption } from '@/lib/dtt-timeline-options';
import { formatQuoteDiamondCertificate, formatQuoteDiamondLabel } from '@/lib/quote-estimator-diamonds';
import { formatQuoteGemstoneLabel } from '@/lib/quote-estimator-gemstones';
import { GEMSTONE_SHAPE_VALUE } from '@/lib/quote-v3-gemstones';

export function quoteV3Breakdown(data: DiamondFormData, options: AllDiamondFormOptions, content?: DttFormContent | null) {
  const lines: { step: string; label: string; value: string; price: number }[] = [];
  const add = (key: keyof AllDiamondFormOptions, value: string | null) => {
    const option = options[key]?.find(o => o.option_value === value);
    if (option) lines.push({ step: key, label: key.replace(/_/g, ' '), value: option.name, price: option.price });
  };
  add('nature', data.diamondType);
  add('shape', data.diamondShape);
  // On the V3 gemstone path the size card is only the carat window of the stone list: the stone itself carries the price.
  if (data.diamondShape === GEMSTONE_SHAPE_VALUE) {
    const size = options.size?.find(o => o.option_value === data.diamondSize);
    if (size) lines.push({ step: 'size', label: 'size', value: size.name, price: 0 });
  } else add('size', data.diamondSize);
  // Sandbox diamond picker: the exact stone's price replaces the quality card.
  if (data.selectedDiamond) {
    const cert = formatQuoteDiamondCertificate(data.selectedDiamond);
    lines.push({ step: 'quality', label: 'diamond', value: `${formatQuoteDiamondLabel(data.selectedDiamond)}${cert ? ` · ${cert}` : ''}`, price: data.selectedDiamond.price });
  } else add('quality', data.diamondQuality);
  // V3 gemstone picker: the exact stone from the gemstone pool (the gemstone path has no quality cards).
  if (data.selectedGemstone) {
    lines.push({ step: 'gemstone_pick', label: 'gemstone', value: formatQuoteGemstoneLabel(data.selectedGemstone), price: data.selectedGemstone.price });
  }
  add('setting', data.diamondSetting);
  add('holder', data.diamondHolder);
  add('band', data.diamondBand);
  data.diamondBandWidth.forEach(v => add('band_width', v));
  add('metal', data.diamondMetal);
  if (data.diamondMetal === 'two-tone') {
    const combo = findTwoToneCombo(data.diamondTwoToneMetals, content?.twoToneCombos, toMetalPriceMap(options.metal));
    if (combo) lines.push({ step: 'metal', label: 'Two-tone metals', value: combo.name, price: combo.price });
  }
  const karat = findMetalKarat(data.diamondMetal, data.diamondMetalKarat, content?.metalKarats);
  if (karat) lines.push({ step: 'metal', label: 'Metal purity', value: karat.name, price: karat.price });
  data.diamondPersonalization.forEach(v => add('personalization', v));
  const timeline = findTimelineOption(data.diamondTimeline, content?.timelineOptions);
  if (timeline) lines.push({ step: 'timeline', label: 'Timing', value: timeline.label, price: timeline.price });
  return { lines, total: lines.reduce((sum, line) => sum + line.price, 0) };
}