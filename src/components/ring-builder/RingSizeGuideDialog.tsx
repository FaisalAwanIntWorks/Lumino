import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  RING_SIZE_GUIDE,
  RING_SIZE_GUIDE_PDF_URL,
  RING_SIZE_GUIDE_PDF_FILENAME,
  formatUsRingSize,
  type RingSizeRow,
} from '@/lib/ring-size-guide';

interface RingSizeGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Currently chosen US size, highlighted in the table. */
  selectedSize?: string;
  /** Tapping a row picks that US size and closes the guide. */
  onSelectSize?: (us: string) => void;
}

const TIPS: { title: string; body: string }[] = [
  {
    title: 'Have a ring that fits?',
    body: 'Measure across the inside in mm and find it in the Inside column.',
  },
  {
    title: 'No ring?',
    body: 'Wrap a strip of paper around the finger, mark where it meets, and measure it in mm. Use the Around column.',
  },
  {
    title: "It's a surprise?",
    body: 'Borrow a ring they wear, or pick 6, the most common size.',
  },
];

/** Desktop shows the chart as two side-by-side halves so all sizes fit without scrolling. */
const SPLIT_AT = Math.ceil(RING_SIZE_GUIDE.length / 2);

/**
 * "Find your ring size" side panel opened from the eye icon on the Ring Size section.
 * Same placement as the "i" info popups (right half on desktop, full screen on mobile),
 * with fixed neutral colours so it looks the same in every Ring OS skin.
 */
export const RingSizeGuideDialog = ({ open, onOpenChange, selectedSize, onSelectSize }: RingSizeGuideDialogProps) => {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const close = () => onOpenChange(false);
  const pick = (us: string) => {
    onSelectSize?.(us);
    close();
  };

  const tableChunks: RingSizeRow[][] = isMobile
    ? [RING_SIZE_GUIDE]
    : [RING_SIZE_GUIDE.slice(0, SPLIT_AT), RING_SIZE_GUIDE.slice(SPLIT_AT)];

  const renderTable = (rows: RingSizeRow[], key: number) => (
    <div key={key} className="overflow-hidden rounded-xl border border-neutral-200">
      <table className="w-full border-collapse text-center text-sm">
        <thead className="bg-neutral-100 text-[11px] sm:text-xs font-medium text-neutral-500">
          <tr>
            <th className="px-1.5 py-2 font-medium whitespace-nowrap">US &amp; CA</th>
            <th className="px-1.5 py-2 font-medium whitespace-nowrap">Inside mm</th>
            <th className="px-1.5 py-2 font-medium whitespace-nowrap">Around mm</th>
            <th className="px-1.5 py-2 font-medium">EU</th>
            <th className="px-1.5 py-2 font-medium">UK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selectedSize === row.us;
            return (
              <tr
                key={row.us}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => pick(row.us)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick(row.us);
                  }
                }}
                className={`cursor-pointer border-t border-neutral-200 transition-colors ${
                  isSelected ? 'bg-[#f3eee4]' : 'bg-white hover:bg-neutral-50'
                }`}
              >
                <td className="px-1.5 py-1.5 font-bold">{formatUsRingSize(row.us)}</td>
                <td className="px-1.5 py-1.5">{row.diameterMm}</td>
                <td className="px-1.5 py-1.5">{row.aroundMm}</td>
                <td className="px-1.5 py-1.5">{row.eu}</td>
                <td className="px-1.5 py-1.5">{row.uk}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ring-size-guide-title"
    >
      <div className="jewlx-info-backdrop fixed inset-0 bg-black/60" onClick={close} />

      {/* Same side-panel placement as the "i" info popups: right half on desktop, full screen on mobile. */}
      <div className="fixed inset-0 md:left-[50%] flex items-stretch">
      <div className="relative flex w-full h-full flex-col overflow-hidden bg-white text-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-1 sm:px-6">
          <h2 id="ring-size-guide-title" className="text-xl sm:text-2xl font-bold tracking-tight">
            Find your ring size
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close ring size guide"
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: one page, the table itself never scrolls */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2 sm:px-6">
          <ol className="grid grid-cols-1 gap-2.5 pt-1 md:grid-cols-3 md:gap-3">
            {TIPS.map((tip, i) => (
              <li key={tip.title} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3eee4] text-xs font-semibold text-[#a07a30]">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-bold leading-snug">{tip.title}</p>
                  <p className="text-sm leading-snug text-neutral-600">{tip.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-3 mb-1.5 text-sm font-semibold text-neutral-500">Tap your size to select it</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
            {tableChunks.map(renderTable)}
          </div>

          <p className="mt-2 text-sm text-neutral-500">Between two sizes? Choose the larger one.</p>
        </div>

        {/* Footer */}
        <div className="grid grid-cols-1 gap-2.5 border-t border-neutral-100 px-5 py-3 sm:grid-cols-2 sm:px-6">
          <a
            href={RING_SIZE_GUIDE_PDF_URL}
            download={RING_SIZE_GUIDE_PDF_FILENAME}
            className="flex min-h-11 items-center justify-center gap-2.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-neutral-800"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>Download printable guide (PDF)</span>
          </a>
          <button
            type="button"
            onClick={close}
            className="flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-bold text-neutral-900 transition-colors hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
};
