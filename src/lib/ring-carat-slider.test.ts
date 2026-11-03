import { describe, expect, it } from 'vitest';
import {
  buildStandardCaratStops,
  buildTwentyFourKCaratStops,
  getRingCaratBucket,
} from './ring-carat-slider';

describe('Ring OS carat slider rules', () => {
  it('builds 31 quarter-carat stops for 24k from 0.50 through 8.00', () => {
    const stops = buildTwentyFourKCaratStops();

    expect(stops).toHaveLength(31);
    expect(stops[0]?.value).toBe(0.5);
    expect(stops[stops.length - 1]?.value).toBe(8);
    expect(stops.every((stop, index) => index === 0 || stop.value - stops[index - 1].value === 0.25)).toBe(true);
  });

  it('preserves 0.75 while mapping it to the 0.50 catalogue and image bucket', () => {
    const stop = buildTwentyFourKCaratStops().find((candidate) => candidate.value === 0.75);

    expect(stop).toEqual({ value: 0.75, label: '0.75 ct', bucketValue: 0.5 });
  });

  it('maps 1.25 to the 1.00 catalogue and image bucket', () => {
    expect(getRingCaratBucket(1.25)).toBe(1);
  });

  it('changes the image bucket at 1.00 rather than 0.75', () => {
    expect(getRingCaratBucket(0.5)).toBe(0.5);
    expect(getRingCaratBucket(0.75)).toBe(0.5);
    expect(getRingCaratBucket(1)).toBe(1);
  });

  it('keeps standard accounts on half-carat stops through their 6.00 maximum', () => {
    const stops = buildStandardCaratStops([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]);

    expect(stops[stops.length - 1]?.value).toBe(6);
    expect(stops.some((stop) => stop.value > 6)).toBe(false);
    expect(stops.every((stop) => stop.value * 2 === Math.round(stop.value * 2))).toBe(true);
  });

  it('does not invent stops missing from a non-contiguous standard catalogue', () => {
    expect(buildStandardCaratStops([0.5, 1.5, 3]).map((stop) => stop.value)).toEqual([0.5, 1.5, 3]);
  });

  it('caps the endpoint at the existing 8.00 image bucket', () => {
    const stops = buildStandardCaratStops([7.5, 8, 8.5, 9]);

    expect(stops.map((stop) => stop.value)).toEqual([7.5, 8]);
    expect(getRingCaratBucket(8.5)).toBe(8);
  });
});