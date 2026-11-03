import { describe, it, expect } from 'vitest';
import { prepareLeads, applyVariables, allowedBatchNow, buildEmailHtml, type CampaignSchedule } from './marketing-email';

const base: CampaignSchedule = {
  batch_size: 50, interval_minutes: 30, daily_cap: null, window_start: null, window_end: null,
  timezone: 'UTC', start_at: null, last_batch_at: null,
};
const now = new Date('2026-10-12T12:00:00Z');

describe('lead upload', () => {
  it('merges duplicate emails case-insensitively and rejects invalid ones', () => {
    const r = prepareLeads(
      [{ E: 'A@x.com', N: '' }, { E: 'a@x.com ', N: 'Ann' }, { E: 'nope', N: 'B' }],
      { E: 'email', N: 'first_name' },
    );
    expect(r.leads).toHaveLength(1);
    expect(r.leads[0]).toMatchObject({ email: 'a@x.com', first_name: 'Ann' });
    expect(r.duplicatesInFile).toBe(1);
    expect(r.invalid).toBe(1);
  });
});

describe('variables', () => {
  it('uses fallback when empty and escapes values', () => {
    expect(applyVariables('Hi {{first_name|there}}', { first_name: '' })).toBe('Hi there');
    expect(applyVariables('Hi {{first_name}}', { first_name: '<b>' })).toBe('Hi &lt;b&gt;');
  });
  it('always includes an unsubscribe link', () => {
    expect(buildEmailHtml({ mode: 'html', blocks: [], html: '<p>x</p>' })).toContain('{{unsubscribe_url}}');
  });
});

describe('batch scheduler', () => {
  it('sends a full batch when nothing has been sent', () => {
    expect(allowedBatchNow(base, now, 0)).toBe(50);
  });
  it('waits until the interval has passed', () => {
    expect(allowedBatchNow({ ...base, last_batch_at: '2026-10-12T11:45:00Z' }, now, 0)).toBe(0);
    expect(allowedBatchNow({ ...base, last_batch_at: '2026-10-12T11:30:00Z' }, now, 0)).toBe(50);
  });
  it('respects the daily cap', () => {
    expect(allowedBatchNow({ ...base, daily_cap: 120 }, now, 100)).toBe(20);
    expect(allowedBatchNow({ ...base, daily_cap: 120 }, now, 120)).toBe(0);
  });
  it('respects the sending window and start time', () => {
    expect(allowedBatchNow({ ...base, window_start: '09:00', window_end: '11:00' }, now, 0)).toBe(0);
    expect(allowedBatchNow({ ...base, window_start: '09:00', window_end: '18:00' }, now, 0)).toBe(50);
    expect(allowedBatchNow({ ...base, start_at: '2026-10-13T00:00:00Z' }, now, 0)).toBe(0);
  });
});
