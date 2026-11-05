import { ASSET_CDN } from "@/lib/asset-cdn";
const RING_ICON = `${ASSET_CDN.rings}/Solitaire/high-polish/rose/round/wex20aa6goaktc6150i1r.png`;
const DIAMOND_ICON = `${ASSET_CDN.ringBuilder}/GenericDttFormImagesTransparent/diamond_shape/Round.png`;

interface Props {
  properties: Record<string, string>;
}

const isDiamondKey = (k: string) => {
  const key = k.toLowerCase();
  return (
    key.startsWith("stone") ||
    key.startsWith("diamond") ||
    key === "carat range" ||
    key === "shape" ||
    key === "wholesale diamond price" ||
    key === "markup price"
  );
};

const RING_ORDER = [
  "Style",
  "Shank",
  "Metal",
  "Band Width",
  "Size",
  "Engraving",
  "Order Type",
  "Estimated Ring Price",
  "Deposit Amount",
];

const DIAMOND_ORDER = [
  "Stone Type",
  "Shape",
  "Carat Range",
  "Stone Carat",
  "Stone Color",
  "Stone Clarity",
  "Stone Cut Grade",
  "Stone Polish",
  "Stone Symmetry",
  "Stone Fluorescence",
  "Diamond Lab",
  "Diamond Certificate No",
  "Diamond Certificate PDF",
  "Stone Price",
  "Wholesale Diamond Price",
  "Markup Price",
];

const PDF_KEYS = new Set(["Diamond Certificate PDF"]);

const sortByOrder = (entries: [string, string][], order: string[]) => {
  return [...entries].sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
};

export const LineItemProperties = ({ properties }: Props) => {
  const entries = Object.entries(properties).filter(([k]) => !k.startsWith("_"));
  if (entries.length === 0) return null;

  const diamondEntries = sortByOrder(
    entries.filter(([k]) => isDiamondKey(k)),
    DIAMOND_ORDER
  );
  const ringEntries = sortByOrder(
    entries.filter(([k]) => !isDiamondKey(k)),
    RING_ORDER
  );

  const Section = ({
    title,
    iconUrl,
    items,
  }: {
    title: string;
    iconUrl: string;
    items: [string, string][];
  }) => {
    if (items.length === 0) return null;
    return (
      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <img src={iconUrl} alt="" className="h-20 w-20 object-contain" />
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {items.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">{k}</span>
              {PDF_KEYS.has(k) ? (
                <a
                  href={v}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-right truncate text-primary underline underline-offset-2 hover:opacity-80"
                >
                  View PDF
                </a>
              ) : (
                <span className="font-medium text-right truncate">{v}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-3 space-y-2">
      <Section title="Ring Details" iconUrl={RING_ICON} items={ringEntries} />
      <Section title="Diamond Details" iconUrl={DIAMOND_ICON} items={diamondEntries} />
    </div>
  );
};
