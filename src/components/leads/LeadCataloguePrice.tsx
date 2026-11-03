import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/pricing-utils";

interface LeadCataloguePriceProps {
  clientId: string;
  configuration: any;
  currency?: string;
}

interface PriceLineItem {
  label: string;
  value: number;
}

export const LeadCataloguePrice = ({ clientId, configuration, currency = "USD" }: LeadCataloguePriceProps) => {
  const [lineItems, setLineItems] = useState<PriceLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchAndCalculate = async () => {
      if (!configuration || !clientId) {
        setLoading(false);
        return;
      }

      try {
        const [optionRes, metalRes, caratRes] = await Promise.all([
          supabase
            .from("client_option_prices")
            .select("option_id, option_type, price")
            .eq("client_id", clientId),
          supabase
            .from("client_metal_variants")
            .select("variant_name, color_family, price")
            .eq("client_id", clientId),
          supabase
            .from("client_carat_options")
            .select("carat_value, display_name, price_adjustment")
            .eq("client_id", clientId)
            .eq("is_enabled", true),
        ]);

        const optionPrices = optionRes.data || [];
        const metalVariants = metalRes.data || [];
        const caratOptions = caratRes.data || [];

        const items: PriceLineItem[] = [];
        let sum = 0;

        // Style price
        if (configuration.style) {
          const match = optionPrices.find(
            (p) => p.option_type === "styles" && p.option_id === configuration.style
          );
          const price = match ? Number(match.price) : 0;
          if (price > 0) {
            items.push({ label: `Style: ${formatId(configuration.style)}`, value: price });
            sum += price;
          }
        }

        // Shank price
        if (configuration.shank) {
          const match = optionPrices.find(
            (p) => p.option_type === "shanks" && p.option_id === configuration.shank
          );
          const price = match ? Number(match.price) : 0;
          if (price > 0) {
            items.push({ label: `Shank: ${formatId(configuration.shank)}`, value: price });
            sum += price;
          }
        }

        // Metal price
        if (configuration.metal) {
          const metalName = configuration.metal;
          const match = metalVariants.find((m) => m.variant_name === metalName);
          const price = match ? Number(match.price) : 0;
          if (price > 0) {
            items.push({ label: `Metal: ${metalName}`, value: price });
            sum += price;
          }
        }

        // Carat adjustment
        if (configuration.caratRange != null) {
          const caratVal = Number(configuration.caratRange);
          const match = caratOptions.find((c) => Number(c.carat_value) === caratVal);
          const adj = match ? Number(match.price_adjustment) : 0;
          if (adj > 0) {
            items.push({
              label: `Carat: ${match?.display_name || caratVal + " ct"}`,
              value: adj,
            });
            sum += adj;
          }
        }

        // Stone price
        if (configuration.stone?.price) {
          const stonePrice = Number(configuration.stone.price);
          if (stonePrice > 0) {
            items.push({ label: "Stone", value: stonePrice });
            sum += stonePrice;
          }
        }

        setLineItems(items);
        setTotal(sum);
      } catch (err) {
        console.error("Error calculating catalogue price:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAndCalculate();
  }, [clientId, configuration]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-6 w-28" />
        </CardContent>
      </Card>
    );
  }

  if (total === 0 && lineItems.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Catalogue Price</h3>
        </div>

        <div className="space-y-1.5">
          {lineItems.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{item.label}</span>
              <span>{formatCurrency(item.value, currency)}</span>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-lg font-bold text-primary">
            {formatCurrency(total, currency)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

const formatId = (id: string) =>
  id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
