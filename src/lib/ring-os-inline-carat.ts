// Inline carat slider on the Ring OS Carat step (image + slider + quick picks
// beside the carousel instead of the stacked list + "View" popup).
//
// Only allow-listed accounts (currently the Sandbox account JewlX) get it on
// desktop; every other account keeps the list and popup viewer.

export const RING_OS_INLINE_CARAT_CLIENT_IDS: ReadonlySet<string> = new Set([
  'dcd952fc-783b-4a92-be7f-62751265c650', // Sandbox · JewlX
]);

export function usesInlineCaratSlider(clientId?: string | null): boolean {
  return !!clientId && RING_OS_INLINE_CARAT_CLIENT_IDS.has(clientId);
}
