export const MIN_RING_CARAT = 0.5;
export const MAX_RING_CARAT = 8;

export interface RingCaratSliderStop {
  value: number;
  label: string;
  bucketValue: number;
}

const roundToHundredths = (value: number) => Math.round(value * 100) / 100;

export const getRingCaratBucket = (value: number): number => {
  const finiteValue = Number.isFinite(value) ? value : MIN_RING_CARAT;
  const cappedValue = Math.min(MAX_RING_CARAT, Math.max(MIN_RING_CARAT, finiteValue));
  return roundToHundredths(Math.floor(cappedValue * 2) / 2);
};

export const formatRingCarat = (value: number): string => `${value.toFixed(2)} ct`;

export const buildTwentyFourKCaratStops = (): RingCaratSliderStop[] => {
  const stopCount = Math.round((MAX_RING_CARAT - MIN_RING_CARAT) / 0.25);
  return Array.from({ length: stopCount + 1 }, (_, index) => {
    const value = roundToHundredths(MIN_RING_CARAT + index * 0.25);
    return { value, label: formatRingCarat(value), bucketValue: getRingCaratBucket(value) };
  });
};

export const buildStandardCaratStops = (
  availableBuckets?: ReadonlyArray<number>,
): RingCaratSliderStop[] => {
  const source = Array.isArray(availableBuckets)
    ? availableBuckets
    : Array.from(
        { length: Math.round((MAX_RING_CARAT - MIN_RING_CARAT) / 0.5) + 1 },
        (_, index) => MIN_RING_CARAT + index * 0.5,
      );

  return Array.from(
    new Set(
      source
        .map(Number)
        .filter((value) => Number.isFinite(value))
        .map(getRingCaratBucket)
        .filter((value) => value >= MIN_RING_CARAT && value <= MAX_RING_CARAT),
    ),
  )
    .sort((a, b) => a - b)
    .map((value) => ({ value, label: formatRingCarat(value), bucketValue: value }));
};

export const findNearestCaratStopIndex = (
  stops: ReadonlyArray<RingCaratSliderStop>,
  requestedValue: number,
): number => {
  if (stops.length === 0) return 0;

  return stops.reduce((nearestIndex, stop, index) => {
    const nearest = stops[nearestIndex];
    if (!nearest) return index;
    return Math.abs(stop.value - requestedValue) < Math.abs(nearest.value - requestedValue)
      ? index
      : nearestIndex;
  }, 0);
};

export const isCaratSelectionAvailable = (
  selectedValue: number,
  availableBuckets: ReadonlyArray<number>,
): boolean => {
  const selectedBucket = getRingCaratBucket(selectedValue);
  return availableBuckets.some((value) => getRingCaratBucket(Number(value)) === selectedBucket);
};