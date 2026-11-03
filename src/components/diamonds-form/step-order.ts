/**
 * Merge a client's saved Quote Estimator step order with the current default
 * list. Keys the client saved keep their order; keys added to the product
 * after the client last saved (e.g. `ring_size`) are slotted in at their
 * default position — right after the key that precedes them in `defaults` —
 * instead of being dumped at the end. Unknown / removed keys are dropped.
 */
export function mergeStepOrder(saved: string[] | null | undefined, defaults: string[]): string[] {
  const base = Array.isArray(saved) && saved.length ? saved.filter(k => defaults.includes(k)) : [...defaults];
  for (let i = 0; i < defaults.length; i++) {
    const key = defaults[i];
    if (base.includes(key)) continue;
    // Walk back through the defaults to find the nearest predecessor the
    // client already has, and insert right after it.
    let inserted = false;
    for (let j = i - 1; j >= 0; j--) {
      const at = base.indexOf(defaults[j]);
      if (at >= 0) {
        base.splice(at + 1, 0, key);
        inserted = true;
        break;
      }
    }
    if (!inserted) base.unshift(key);
  }
  return base;
}
