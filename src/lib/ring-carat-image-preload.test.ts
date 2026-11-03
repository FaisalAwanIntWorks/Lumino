import { describe, expect, it } from 'vitest';
import { buildTwentyFourKCaratStops } from './ring-carat-slider';
import { prioritizeCaratImageUrls } from './ring-carat-image-preload';

describe('24k Ring OS carat image warming', () => {
  it('reduces 31 quarter-carat stops to 16 unique image buckets', () => {
    const buckets = new Set(buildTwentyFourKCaratStops().map((stop) => stop.bucketValue));
    expect(buckets.size).toBe(16);
  });

  it('shares an image URL within a half-carat bucket', () => {
    const stops = buildTwentyFourKCaratStops();
    expect(stops.find((stop) => stop.value === 0.5)?.bucketValue).toBe(0.5);
    expect(stops.find((stop) => stop.value === 0.75)?.bucketValue).toBe(0.5);
    expect(stops.find((stop) => stop.value === 1)?.bucketValue).toBe(1);
  });

  it('prioritizes the current bucket and nearby unique images', () => {
    const urls = prioritizeCaratImageUrls([
      { bucket: 0.5, url: 'half.webp' },
      { bucket: 0.5, url: 'half.webp' },
      { bucket: 1, url: 'one.webp' },
      { bucket: 1.5, url: 'one-half.webp' },
      { bucket: 2, url: 'two.webp' },
    ], 1.5);

    expect(urls).toEqual(['one-half.webp', 'one.webp', 'two.webp', 'half.webp']);
  });
});
