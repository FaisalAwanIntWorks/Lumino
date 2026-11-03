// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { CountryPhoneInput } from './country-phone-input';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function setup() {
  const onCode = vi.fn(), onIso = vi.fn(), onNum = vi.fn();
  const el = document.createElement('div');
  document.body.appendChild(el);
  act(() => {
    createRoot(el).render(
      <CountryPhoneInput countryCode="+1" countryIso="US" phoneNumber=""
        onCountryCodeChange={onCode} onCountryIsoChange={onIso} onPhoneNumberChange={onNum} />,
    );
  });
  const input = el.querySelector('input[type="tel"]') as HTMLInputElement;
  const type = (v: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return { input, type, onCode, onIso, onNum };
}

describe('CountryPhoneInput autofill', () => {
  it('advertises the tel autofill token', () => {
    expect(setup().input.autocomplete).toBe('tel');
  });
  it('autofilled UK number switches country to +44 and keeps local digits', () => {
    const s = setup();
    s.type('+44 7700 900123');
    expect(s.onCode).toHaveBeenCalledWith('+44');
    expect(s.onIso).toHaveBeenCalledWith('GB');
    expect(s.onNum).toHaveBeenLastCalledWith('7700900123');
  });
  it('typed digits stay digits-only and capped at 10 for +1', () => {
    const s = setup();
    s.type('415-555-26719');
    expect(s.onCode).not.toHaveBeenCalled();
    expect(s.onNum).toHaveBeenLastCalledWith('4155552671');
  });
});
