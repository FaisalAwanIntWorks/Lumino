import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getOrderRingAssetLookup, getOrderRingPreviewUrl, getConfigSummary } from "@/lib/order-utils";
import { Diamond, FileDown, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { constructCdnImageUrl } from "@/lib/cdn-utils";
import { Button } from "@/components/ui/button";
import { CadFilesSection } from "./CadFilesSection";
import { LineItemProperties } from "./LineItemProperties";

interface OrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getTagColor?: (status: string) => string;
  order: {
    id: string;
    customer_name: string;
    customer_email: string;
    total_amount: number;
    status: string;
    created_at: string;
    order_source: string | null;
    shopify_order_id: string | null;
    customer_shipping: Record<string, string> | null;
    configuration: Record<string, unknown> | null;
    manufacturing_cad_files?: string[] | null;
  } | null;
}

const INTERNAL_KEYS = new Set([
  '_source', 'line_items', 'shopify_order_number', 'currency',
  '_JewelX', '_jewelx', '_jewlx',
]);

const getDisplayAmount = (order: OrderDetailDialogProps['order']) => {
  if (!order) return '$0.00';
  const currency = (order.configuration?.currency as string) || 'USD';
  let amount = order.total_amount;
  if (amount === 0 && order.configuration?.line_items) {
    const items = order.configuration.line_items as Array<{ price: string; quantity: number }>;
    amount = items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
};

const fallbackStatusColor = (status: string) => {
  const map: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    processing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    completed: 'bg-green-500/10 text-green-500 border-green-500/20',
    fulfilled: 'bg-green-500/10 text-green-500 border-green-500/20',
    cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
    canceled: 'bg-red-500/10 text-red-500 border-red-500/20',
    refunded: 'bg-muted text-muted-foreground border-border',
  };
  return map[status] || 'bg-secondary text-secondary-foreground';
};

export default function OrderDetailDialog({ open, onOpenChange, order, getTagColor }: OrderDetailDialogProps) {
  const [cadFileUrl, setCadFileUrl] = useState<string | null>(null);
  const [cadLoading, setCadLoading] = useState(false);
  const [cadDebugInfo, setCadDebugInfo] = useState<string | null>(null);
  const [ringImages, setRingImages] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!open || !order?.configuration) {
      setCadFileUrl(null);
      setCadDebugInfo(null);
      setRingImages([]);
      setCurrentSlide(0);
      return;
    }

    const config = order.configuration;
    const assetLookup = getOrderRingAssetLookup(config);

    if (!assetLookup?.combinationId || !assetLookup.folderPath) {
      setCadFileUrl(null);
      setRingImages([]);
      setCadDebugInfo(
        `Missing config fields — style: "${assetLookup?.style ?? ''}", shank: "${assetLookup?.shank ?? ''}", color: "${assetLookup?.color ?? ''}", shape: "${assetLookup?.shape ?? ''}"`
      );
      return;
    }

    setCadLoading(true);
    const fetchCad = async () => {
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
          // Build ring images
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
            const url = constructCdnImageUrl(data.folder_path, data.manufacture_cad_filename);
            setCadFileUrl(url);
          } else {
            setCadFileUrl(null);
          }
        } else {
          setCadFileUrl(null);
          setRingImages([]);
        }
      } catch (err: any) {
        setCadFileUrl(null);
        setCadDebugInfo(
          `combination_id: "${assetLookup.combinationId}" → searched path: "${assetLookup.folderPath}" → Error: ${err?.message}`
        );
      } finally {
        setCadLoading(false);
      }
    };
    fetchCad();
  }, [open, order?.id]);

  if (!order) return null;

  const config = order.configuration || {};
  const lineItems = (config.line_items as Array<{ title: string; price: string; quantity: number; properties?: Record<string, string>; image?: string }>) || [];
  const orderNumber = config.shopify_order_number as string | undefined;
  const currency = (config.currency as string) || 'USD';
  const shipping = order.customer_shipping;
  const statusColor = getTagColor ? getTagColor(order.status) : fallbackStatusColor(order.status);
  const ringPreview = getOrderRingPreviewUrl(config);
  const configSummary = getConfigSummary(config);
  const cadFiles = order.manufacturing_cad_files || [];

  const configEntries = Object.entries(config).filter(
    ([key]) => !INTERNAL_KEYS.has(key) && !key.startsWith('_')
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Order {orderNumber ? `#${orderNumber}` : order.id.slice(0, 8)}
            <Badge className={`${statusColor} text-xs`}>
              {order.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-5">
            {/* Ring Preview Carousel */}
            <section className="flex gap-4 items-start">
              <div className="w-24 h-24 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0 relative">
                {ringImages.length > 0 ? (
                  <>
                    <a href={ringImages[currentSlide]} target="_blank" rel="noopener noreferrer" className="w-full h-full">
                      <img
                        src={ringImages[currentSlide]}
                        alt={`Ring angle ${currentSlide + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </a>
                    {ringImages.length > 1 && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-6 bg-background/60 rounded-full p-0"
                          onClick={() => setCurrentSlide((prev) => (prev - 1 + ringImages.length) % ringImages.length)}
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 bg-background/60 rounded-full p-0"
                          onClick={() => setCurrentSlide((prev) => (prev + 1) % ringImages.length)}
                        >
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </>
                ) : ringPreview ? (
                  <img src={ringPreview} alt="Ring preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>'; }} />
                ) : (
                  <Diamond className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{order.customer_name}</p>
                <p className="text-xs text-muted-foreground">{order.customer_email}</p>
                {configSummary && (
                  <p className="text-xs text-muted-foreground mt-1">{configSummary}</p>
                )}
                {ringImages.length > 1 && (
                  <div className="flex gap-1 mt-2">
                    {ringImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSlide(idx)}
                        className={`w-10 h-10 rounded border overflow-hidden transition-colors ${
                          idx === currentSlide ? 'border-primary' : 'border-border'
                        }`}
                      >
                        <img src={img} alt={`Angle ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Shipping */}
            {shipping && Object.values(shipping).some(v => v) && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Shipping Address</h3>
                  <p className="text-sm">
                    {[shipping.name, shipping.address1, shipping.address2, shipping.city, shipping.province, shipping.zip, shipping.country]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  {shipping.phone && <p className="text-sm text-muted-foreground mt-1">Phone: {shipping.phone}</p>}
                </section>
              </>
            )}

            {/* Order Details */}
            <Separator />
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Order Details</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Source:</span>
                  <p className="font-medium">Ring OS</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <p className="font-medium">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total:</span>
                  <p className="font-semibold">{getDisplayAmount(order)}</p>
                </div>
                {order.shopify_order_id && (
                  <div>
                    <span className="text-muted-foreground">Shopify ID:</span>
                    <p className="font-mono text-xs">{order.shopify_order_id}</p>
                  </div>
                )}
              </div>
            </section>

            {/* CAD Files */}
            <Separator />
            <CadFilesSection
              cadLoading={cadLoading}
              cadFileUrl={cadFileUrl}
              cadFiles={cadFiles}
              order={order}
            />

            {/* Configuration */}
            {configEntries.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Configuration</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {configEntries.map(([key, value]) => (
                      <div key={key}>
                        <span className="text-muted-foreground">{key}:</span>
                        <p className="font-medium">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* Line Items */}
            {lineItems.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Line Items</h3>
                  <div className="space-y-3">
                    {lineItems.map((item, idx) => (
                      <div key={idx} className="border rounded-lg p-3">
                        <div className="flex gap-3 items-start mb-1">
                          {item.image && (
                            <img
                              src={item.image}
                              alt={item.title}
                              className="w-12 h-12 rounded object-cover shrink-0 border border-border"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                          <div className="flex-1 min-w-0 flex justify-between items-start">
                          <p className="font-medium text-sm">{item.title}</p>
                          <p className="font-semibold text-sm">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(item.price) * item.quantity)}
                          </p>
                        </div>
                        </div>
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity} × {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(item.price))}</p>
                        {item.properties && Object.keys(item.properties).length > 0 && (
                          <LineItemProperties properties={item.properties} />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
