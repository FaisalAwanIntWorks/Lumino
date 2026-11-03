import { describe, expect, it } from 'vitest';
import { formatLeadDevice, parseUserAgent } from './lead-device';

describe('parseUserAgent', () => {
  it('detects iPhone Safari', () => {
    const r = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1');
    expect(r).toMatchObject({ device_type: 'mobile', os: 'iOS', os_version: '17.4', model: 'iPhone', browser: 'Safari' });
  });

  it('detects iPhone Instagram in-app browser', () => {
    const r = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 307.0.0.34.111 (iPhone15,3; iOS 17_1)');
    expect(r.browser).toBe('Instagram app');
    expect(r.os).toBe('iOS');
  });

  it('detects Android phone with model', () => {
    const r = parseUserAgent('Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');
    expect(r).toMatchObject({ device_type: 'mobile', os: 'Android', os_version: '13', model: 'SM-S918B', browser: 'Chrome' });
  });

  it('ignores the reduced-UA "K" model and detects Android tablets', () => {
    const r = parseUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    expect(r).toMatchObject({ device_type: 'tablet', os: 'Android', model: null });
  });

  it('detects Samsung Internet', () => {
    const r = parseUserAgent('Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36');
    expect(r.browser).toBe('Samsung Internet');
  });

  it('treats a touch Mac as iPad', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
    expect(parseUserAgent(ua, { maxTouchPoints: 5 })).toMatchObject({ device_type: 'tablet', os: 'iPadOS', model: 'iPad' });
    expect(parseUserAgent(ua, { maxTouchPoints: 0 })).toMatchObject({ device_type: 'desktop', os: 'macOS', browser: 'Safari' });
  });

  it('detects Windows Edge desktop', () => {
    const r = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91');
    expect(r).toMatchObject({ device_type: 'desktop', os: 'Windows', browser: 'Edge', browser_version: '120.0' });
  });
});

describe('formatLeadDevice', () => {
  const base = { os_version: null, browser: 'Chrome', browser_version: null, model: null, screen: null, touch: false, user_agent: '' };
  it('shows only the device bucket', () => {
    expect(formatLeadDevice({ ...base, device_type: 'mobile', os: 'iOS', model: 'iPhone' })).toBe('iPhone');
    expect(formatLeadDevice({ ...base, device_type: 'mobile', os: 'Android', model: 'Infinix X6725B' })).toBe('Android');
    expect(formatLeadDevice({ ...base, device_type: 'tablet', os: 'Android' })).toBe('Android');
    expect(formatLeadDevice({ ...base, device_type: 'tablet', os: 'iPadOS' })).toBe('iPad');
    expect(formatLeadDevice({ ...base, device_type: 'desktop', os: 'macOS' })).toBe('MacBook');
    expect(formatLeadDevice({ ...base, device_type: 'desktop', os: 'Windows' })).toBe('Desktop');
    expect(formatLeadDevice({ ...base, device_type: 'desktop', os: 'Linux' })).toBe('Desktop');
    expect(formatLeadDevice(null)).toBeNull();
  });
});
