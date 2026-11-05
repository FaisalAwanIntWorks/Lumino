import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusTagSelector } from "@/components/status/StatusTagSelector";
import { LinkedLeadSection } from "./LinkedLeadSection";
import { CadFilesSection } from "./CadFilesSection";
import { supabase } from "@/integrations/supabase/client";
import { constructCdnImageUrl } from "@/lib/cdn-utils";
import { getOrderRingAssetLookup, getOrderRingPreviewUrl, getConfigSummary } from "@/lib/order-utils";
import { useClientTimezone, formatDateWithTimezone } from "@/hooks/useClientTimezone";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Package, MapPin, ShoppingCart, Wallet, UserCircle
} from "lucide-react";
import type { StatusTag } from "@/hooks/useClientStatusTags";
import { LineItemProperties } from "./LineItemProperties";

const SOURCE_BADGE_MAP: Record<string, { label: string; className: string }> = {
  'aurezo-widget': { label: 'Ring OS', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  'ring-builder': { label: 'Ring Builder', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  'grillz-builder': { label: 'Grillz', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  'custom-inquiry': { label: 'Custom', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
};

const getSourceBadgeInfo = (orderSource: string | null) => {
  const source = orderSource || 'aurezo-widget';
  const info = SOURCE_BADGE_MAP[source] || { label: 'Ring OS', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' };
  const isDeposit = ['ring-builder', 'grillz-builder', 'custom-inquiry'].includes(source);
  return { ...info, isDeposit };
};

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  status: string;
  created_at: string;
  order_source: string | null;
  shopify_order_id: string | null;
  customer_shipping: any;
  configuration: any;
  manufacturing_cad_files: string[] | null;
  client_id?: string;
}

interface OrderDetailViewProps {
  order: Order;
  onBack: () => void;
  onStatusChange: (orderId: string, newStatus: string) => void;
  orderStatusTags: StatusTag[];
  getOrderTagColor: (tagName: string) => string;
  addOrderTag: (tagName: string, tagColor: string) => void;
  deleteOrderTag?: (tagId: string) => void;
  clientCompanyName?: string;
}

const INTERNAL_KEYS = new Set([
  '_source', 'line_items', 'shopify_order_number', 'currency',
  '_Aurezo', '_aurezo', '_aurezo',
]);

const getDisplayAmount = (order: Order) => {
  const currency = (order.configuration?.currency as string) || 'USD';
  let amount = order.total_amount;
  if (amount === 0 && order.configuration?.line_items) {
    const items = order.configuration.line_items as Array<{ price: string; quantity: number }>;
    amount = items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
};

const SectionCard = ({ title, icon: Icon, children, asCard = false }: { title: string; icon?: any; children: React.ReactNode; asCard?: boolean }) => {
  const content = (
    <>
      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {title}
      </h4>
      {children}
    </>
  );
  if (asCard) return <Card><CardContent className="p-4 sm:p-5">{content}</CardContent></Card>;
  return <div className="pb-5 border-b border-border/40 last:border-0">{content}</div>;
};

const ConfigField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
  </div>
);

export default function OrderDetailView({
  order, onBack, onStatusChange, orderStatusTags, getOrderTagColor, addOrderTag, deleteOrderTag, clientCompanyName
}: OrderDetailViewProps) {
  const clientTimezone = useClientTimezone();
  const [ringImages, setRingImages] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [cadFileUrl, setCadFileUrl] = useState<string | null>(null);
  const [cadFiles, setCadFiles] = useState<string[]>([]);
  const [cadLoading, setCadLoading] = useState(false);

  const navigate = useNavigate();
  const config = order.configuration || {};
  const lineItems = (config.line_items as Array<{ title: string; price: string; quantity: number; properties?: Record<string, string>; image?: string }>) || [];

  const [enrichedLineItems, setEnrichedLineItems] = useState(lineItems);

  useEffect(() => {
    const enrich = async () => {
      if (!order.client_id || lineItems.length === 0) {
        setEnrichedLineItems(lineItems);
        return;
      }

      // Fetch catalog markup settings once for this client
      const { data: catalogFilter } = await supabase
        .from('client_diamond_catalog_filter')
        .select('markup_natural, markup_lab')
        .eq('client_id', order.client_id!)
        .maybeSingle();

      const updated = await Promise.all(
        lineItems.map(async (item) => {
          const props = item.properties || {};
          if (!props['Stone Color'] || props['Wholesale Diamond Price']) return item;

          const reportNo = props['Diamond Certificate No'];
          const isLab = props['Stone Type']?.toLowerCase().includes('lab');

          const enrichedProps = { ...props };

          // Wholesale price from diamond_inventory_pool.price (the actual cost price)
          if (reportNo) {
            const { data: poolDiamond } = await supabase
              .from('diamond_inventory_pool')
              .select('price')
              .eq('report_no', reportNo)
              .maybeSingle();
            if (poolDiamond?.price != null && Number(poolDiamond.price) > 0) {
              enrichedProps['Wholesale Diamond Price'] = `$${Number(poolDiamond.price).toLocaleString()}`;
            }
          }

          // Markup % from catalog filter settings
          if (catalogFilter) {
            const markupPct = isLab
              ? (catalogFilter as any).markup_lab
              : (catalogFilter as any).markup_natural;
            enrichedProps['Markup Price'] = `${markupPct ?? 0}%`;
          }

          return { ...item, properties: enrichedProps };
        })
      );
      setEnrichedLineItems(updated);
    };
    enrich();
  }, [order.id]);
  const orderNumber = config.shopify_order_number as string | undefined;
  const currency = (config.currency as string) || 'USD';
  const shipping = order.customer_shipping;
  const configSummary = getConfigSummary(config);
  const ringPreview = getOrderRingPreviewUrl(config);

  useEffect(() => {
    const assetLookup = getOrderRingAssetLookup(config);
    if (!assetLookup?.combinationId || !assetLookup.folderPath) {
      setRingImages([]);
      setCadFileUrl(null);
      return;
    }

    setCadLoading(true);
    const fetchAssets = async () => {
      try {
        const selectCols = 'folder_path, manufacture_cad_filename, image_0_filename, image_1_filename, image_2_filename, image_3_filename';
        let { data, error } = await supabase
          .from('my_master_db_data')
          .select(selectCols)
          .eq('combination_id', assetLookup.combinationId)
          .limit(1)
          .maybeSingle();

        if (!data && !error) {
          ({ data, error } = await supabase
            .from('my_master_db_data')
            .select(selectCols)
            .eq('folder_path', assetLookup.folderPath)
            .limit(1)
            .maybeSingle());
        }

        if (error) throw error;

        if (data?.folder_path) {
          const imgs: string[] = [];
          for (let i = 0; i < 4; i++) {
            const filename = (data as any)[`image_${i}_filename`];
            if (filename) {
              const url = constructCdnImageUrl(data.folder_path, filename);
              if (url) imgs.push(url);
            }
          }
          setRingImages(imgs);
          setCurrentSlide(0);

          if (data.manufacture_cad_filename) {
            setCadFileUrl(constructCdnImageUrl(data.folder_path, data.manufacture_cad_filename));
          } else {
            setCadFileUrl(null);
          }
        } else {
          setRingImages([]);
          setCadFileUrl(null);
        }
      } catch {
        setRingImages([]);
        setCadFileUrl(null);
      } finally {
        setCadLoading(false);
      }
    };
    fetchAssets();
  }, [order.id]);

  // Manufacturing CAD files from order record
  useEffect(() => {
    setCadFiles(order.manufacturing_cad_files || []);
  }, [order.id]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back to Orders
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-3">
            Order {orderNumber ? `#${orderNumber}` : order.id.slice(0, 8)}
            <span className="text-lg font-bold text-primary">{getDisplayAmount(order)}</span>
          </h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span>{order.customer_name || "N/A"}</span>
            <span>·</span>
            <span>{order.customer_email}</span>
            <span>·</span>
            <span>{formatDateWithTimezone(order.created_at, clientTimezone)}</span>
          </div>
          <Button
            variant="link"
            size="sm"
            className="px-0 h-auto text-xs gap-1 text-primary"
            onClick={() => navigate(`/dashboard/saved-designs?email=${encodeURIComponent(order.customer_email)}`)}
          >
            <UserCircle className="h-3.5 w-3.5" />
            View Customer Profile
          </Button>
          {configSummary && (
            <p className="text-xs text-muted-foreground mt-1">{configSummary}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(() => {
            const badge = getSourceBadgeInfo(order.order_source);
            return (
              <div className="flex items-center gap-1.5">
                <Badge className={`${badge.className} text-xs`}>
                  {badge.isDeposit && <Wallet className="h-3 w-3 mr-1" />}
                  {badge.label}
                </Badge>
                {badge.isDeposit && (
                  <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground">Deposit</Badge>
                )}
              </div>
            );
          })()}
          <StatusTagSelector
            currentStatus={order.status}
            tags={orderStatusTags}
            onStatusChange={(s) => onStatusChange(order.id, s)}
            onCreateTag={addOrderTag}
            onDeleteTag={deleteOrderTag}
            getTagColor={getOrderTagColor}
          />
        </div>
      </div>

      {/* Single column layout */}
      <div className="space-y-4 sm:space-y-5 max-w-4xl">
        {/* Ring Images */}
        {(ringImages.length > 0 || ringPreview) && (
          <SectionCard title="Ring Images">
            <div className="space-y-3">
              <div className="relative w-full aspect-square max-w-md mx-auto rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                {ringImages.length > 0 ? (
                  <>
                    <img
                      src={ringImages[currentSlide]}
                      alt={`Ring angle ${currentSlide + 1}`}
                      className="w-full h-full object-contain p-2"
                    />
                    {ringImages.length > 1 && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 bg-background/70 rounded-full"
                          onClick={() => setCurrentSlide((prev) => (prev - 1 + ringImages.length) % ringImages.length)}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 bg-background/70 rounded-full"
                          onClick={() => setCurrentSlide((prev) => (prev + 1) % ringImages.length)}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </>
                ) : ringPreview ? (
                  <img src={ringPreview} alt="Ring preview" className="w-full h-full object-contain p-2" />
                ) : null}
              </div>
              {ringImages.length > 1 && (
                <div className="flex gap-2 justify-center">
                  {ringImages.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlide(idx)}
                      className={`w-14 h-14 rounded-md border-2 overflow-hidden transition-colors ${
                        idx === currentSlide ? 'border-primary' : 'border-border'
                      }`}
                    >
                      <img src={img} alt={`Angle ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* CAD Files & Resize */}
        <CadFilesSection
          cadLoading={cadLoading}
          cadFileUrl={cadFileUrl}
          cadFiles={cadFiles}
          order={order}
          clientCompanyName={clientCompanyName}
        />

        {/* Linked Lead (Custom X orders) */}
        <LinkedLeadSection
          orderSource={order.order_source}
          customerEmail={order.customer_email}
          clientId={order.client_id}
          orderCreatedAt={order.created_at}
        />

        {/* Order Details */}
        <SectionCard title="Order Details" icon={Package}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <ConfigField label="Source" value={getSourceBadgeInfo(order.order_source).label} />
            <ConfigField label="Date" value={formatDateWithTimezone(order.created_at, clientTimezone)} />
            <ConfigField label="Total" value={getDisplayAmount(order)} />
            {order.shopify_order_id && (
              <ConfigField label="Shopify ID" value={order.shopify_order_id} />
            )}
            <ConfigField label="Status" value={order.status} />
            {lineItems.length > 0 && (
              <ConfigField label="Items" value={`${lineItems.length} item${lineItems.length > 1 ? 's' : ''}`} />
            )}
          </div>
        </SectionCard>

        {/* Shipping */}
        {shipping && Object.values(shipping).some(v => v) && (
          <SectionCard title="Shipping Address" icon={MapPin}>
            <p className="text-sm">
              {[shipping.name, shipping.address1, shipping.address2, shipping.city, shipping.province, shipping.zip, shipping.country]
                .filter(Boolean)
                .join(', ')}
            </p>
            {shipping.phone && <p className="text-sm text-muted-foreground mt-1">Phone: {shipping.phone}</p>}
          </SectionCard>
        )}


        {/* Line Items */}
        {enrichedLineItems.length > 0 && (
          <SectionCard title="Line Items" icon={ShoppingCart}>
            <div className="space-y-3">
              {enrichedLineItems.map((item, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3">
                  <div className="flex gap-3 items-start">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-14 h-14 rounded-md object-cover shrink-0 border border-border"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="font-semibold text-sm">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(item.price) * item.quantity)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Qty: {item.quantity} × {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(item.price))}
                      </p>
                      {item.properties && Object.keys(item.properties).length > 0 && (
                        <LineItemProperties properties={item.properties} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

      </div>
    </div>
  );
}
