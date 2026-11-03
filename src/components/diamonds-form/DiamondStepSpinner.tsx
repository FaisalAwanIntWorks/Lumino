/**
 * Loading indicator for a Quote Estimator step while its options are still
 * being fetched. Replaces the old static "Loading..." text so a slow start
 * reads as work in progress rather than a stalled screen.
 */
export function DiamondStepSpinner() {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin motion-reduce:animate-none" />
      <p className="text-gray-600 text-sm">Loading…</p>
    </div>
  );
}
