import type { LeadDeviceInfo } from '@/lib/lead-device';
import { LeadDeviceLabel } from '@/components/leads/LeadDeviceRow';
import { Badge } from '@/components/ui/badge';
import { getCurrencySymbol } from '@/lib/pricing-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Mail, Phone, MapPin, Coins, Calculator, TrendingUp,
  Image, Flame, ThermometerSun, Snowflake, AlertTriangle, Copy, Check,
  Clock, Scale, Award, ShieldCheck, ShieldX, HelpCircle, ExternalLink, RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { StatusTagSelector } from '@/components/status/StatusTagSelector';
import type { StatusTag } from '@/hooks/useClientStatusTags';

interface MetalBuyingLead {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  location: string | null;
  country_iso: string | null;
  metal_type: string;
  karat: string | null;
  weight_grams: number | null;
  knows_karat: boolean;
  knows_weight: boolean;
  knows_authentic: boolean;
  is_authentic: boolean | null;
  estimated_offer: number | null;
  competitor_offer: number | null;
  estimated_profit: number | null;
  spot_price_at_time: number | null;
  spot_price_date: string | null;
  buy_percentage: number | null;
  lead_score: string;
  status: string;
  photo_urls: string[] | null;
  created_at: string;
  currency?: string | null;
  items?: any;
  device_info?: LeadDeviceInfo | null;
}

const LEAD_SCORE_CONFIG: Record<string, { label: string; icon: any; className: string }> = {
  hot: { label: 'Hot', icon: Flame, className: 'bg-red-500/10 text-red-600 border-red-500/30' },
  warm: { label: 'Warm', icon: ThermometerSun, className: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
  cold: { label: 'Cold', icon: Snowflake, className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  suspect: { label: 'Suspect', icon: AlertTriangle, className: 'bg-gray-500/10 text-gray-600 border-gray-500/30' },
};

// Purity factors keyed per metal+karat. Lookup uses `${metal}:${karat}`.
const PURITY_FACTORS: Record<string, number> = {
  // Gold
  'gold:8k': 0.333, 'gold:9k': 0.375, 'gold:10k': 0.417, 'gold:12k': 0.500,
  'gold:14k': 0.583, 'gold:18k': 0.750, 'gold:21k': 0.875, 'gold:22k': 0.916, 'gold:24k': 0.999,
  // Silver
  'silver:800': 0.800, 'silver:835': 0.835, 'silver:900': 0.900, 'silver:925': 0.925,
  'silver:950': 0.950, 'silver:958': 0.958, 'silver:999': 0.999,
  // Platinum
  'platinum:850': 0.850, 'platinum:900': 0.900, 'platinum:950': 0.950, 'platinum:999': 0.999,
};

interface MetalIQLeadDetailViewProps {
  lead: MetalBuyingLead;
  onBack: () => void;
  clientId: string;
  tags?: StatusTag[];
  getTagColor?: (tagName: string) => string;
  onStatusChange?: (newStatus: string) => void;
  onCreateTag?: (tagName: string, tagColor: string) => void;
  onDeleteTag?: (tagId: string) => void;
  hasEditAccess?: boolean;
  onViewFullLead?: () => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Copied');
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="ml-1.5 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function MetalIQLeadDetailView({ lead, onBack, clientId, tags, getTagColor, onStatusChange, onCreateTag, onDeleteTag, hasEditAccess = true, onViewFullLead }: MetalIQLeadDetailViewProps) {
  const scoreConfig = LEAD_SCORE_CONFIG[lead.lead_score] || LEAD_SCORE_CONFIG.cold;
  const ScoreIcon = scoreConfig.icon;
  const metalLabel = lead.metal_type.charAt(0).toUpperCase() + lead.metal_type.slice(1);
  const cs = getCurrencySymbol(lead.currency || 'USD');
  const [recalculating, setRecalculating] = useState(false);
  const multiItems = Array.isArray(lead.items) && lead.items.length > 1 ? lead.items : null;

  // Calculation breakdown — purity is keyed by metal+karat to avoid silver/platinum collisions.
  const karatKey = lead.karat?.toLowerCase().replace(/\s/g, '') ?? '';
  const purityLookupKey = `${lead.metal_type.toLowerCase()}:${karatKey}`;
  const purity = PURITY_FACTORS[purityLookupKey] ?? null;
  const spotPerGram = lead.spot_price_at_time ? lead.spot_price_at_time / 31.1035 : null;
  const pureValue = lead.weight_grams && spotPerGram && purity ? lead.weight_grams * spotPerGram * purity : null;
  const buyPct = lead.buy_percentage ?? (pureValue && lead.estimated_offer ? (lead.estimated_offer / pureValue) * 100 : null);
  const competitorPct = pureValue && lead.competitor_offer ? (lead.competitor_offer / pureValue) * 100 : null;

  // Customer DID provide details, but the live quote never landed (most often
  // because the spot-price API failed at submission time). Allow the jeweler
  // to retry the calculation and patch the lead row.
  const hasCustomerDetails = lead.knows_karat && lead.knows_weight && !!lead.karat && !!lead.weight_grams;
  const quoteFailed = hasCustomerDetails && (!lead.spot_price_at_time || lead.estimated_offer == null);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke('calculate-metal-offer', {
        body: {
          clientId,
          metal: lead.metal_type,
          karat: lead.karat,
          weightGrams: lead.weight_grams,
          currency: lead.currency || 'USD',
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { error: updErr } = await supabase
        .from('metal_buying_leads')
        .update({
          spot_price_at_time: data.spotPricePerOz,
          spot_price_date: data.spotPriceDate,
          buy_percentage: data.buyPct,
          estimated_offer: data.ourOffer,
          competitor_offer: data.competitorOffer,
          estimated_profit: data.estimatedProfit,
        })
        .eq('id', lead.id);
      if (updErr) throw updErr;

      toast.success('Quote recalculated', { description: 'Reload the lead to see updated values.' });
    } catch (err: any) {
      console.error('[recalculate] failed:', err);
      toast.error('Could not recalculate quote', { description: err?.message || 'Please try again.' });
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground">{lead.customer_name || 'Unknown Customer'}</h2>
            <Badge variant="outline" className={`gap-1 ${scoreConfig.className}`}>
              <ScoreIcon className="w-3 h-3" />
              {scoreConfig.label}
            </Badge>
            {tags && getTagColor && onStatusChange ? (
              <StatusTagSelector
                currentStatus={lead.status}
                tags={tags}
                onStatusChange={onStatusChange}
                onCreateTag={onCreateTag}
                onDeleteTag={onDeleteTag}
                getTagColor={getTagColor}
              />
            ) : (
              <Badge variant="outline" className="capitalize">{lead.status}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="h-3.5 w-3.5" />
            {format(new Date(lead.created_at), 'EEEE, MMMM d, yyyy · h:mm a')}
          </p>
          {lead.device_info && (
            <p className="text-sm text-muted-foreground mt-0.5">
              <LeadDeviceLabel info={lead.device_info} />
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Customer Information */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Customer Information</h3>
            <Separator />
            <div className="space-y-2.5">
              {lead.customer_name && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-16">Name</span>
                  <span className="font-medium text-foreground">{lead.customer_name}</span>
                </div>
              )}
              {lead.customer_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={`mailto:${lead.customer_email}`} className="text-primary hover:underline">{lead.customer_email}</a>
                  <CopyButton value={lead.customer_email} />
                </div>
              )}
              {lead.customer_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={`tel:${lead.customer_phone}`} className="text-foreground">{lead.customer_phone}</a>
                  <CopyButton value={lead.customer_phone} />
                </div>
              )}
              {lead.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-foreground">{lead.location}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Offer Overview — Metal Details + Quote Breakdown merged */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Offer Overview
            </h3>
            <Separator />
            {/* Metal info row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Metal</span>
                <Badge variant="outline">{metalLabel}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Award className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Purity</span>
                <span className="font-medium">{lead.knows_karat ? (lead.karat || '—') : <span className="text-orange-500 italic">Unknown</span>}</span>
              </div>
              <div className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Weight</span>
                <span className="font-medium">{lead.knows_weight && lead.weight_grams ? `${lead.weight_grams}g` : <span className="text-orange-500 italic">Unknown</span>}</span>
              </div>
              <div className="flex items-center gap-2">
                {lead.knows_authentic ? (
                  lead.is_authentic ? <ShieldCheck className="h-3.5 w-3.5 text-green-500" /> : <ShieldX className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">Auth</span>
                <span className="font-medium">
                  {lead.knows_authentic
                    ? (lead.is_authentic ? <span className="text-green-600">Verified</span> : <span className="text-red-500">Not Auth</span>)
                    : <span className="text-orange-500 italic">Unsure</span>
                  }
                </span>
              </div>
            </div>
            <Separator />
            {/* Quote breakdown grid */}
            {multiItems ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                      <tr><th className="text-left p-2">Piece</th><th className="text-right p-2">Weight</th><th className="text-right p-2">Rate</th><th className="text-right p-2">Offer</th></tr>
                    </thead>
                    <tbody>
                      {multiItems.map((it: any, i: number) => (
                        <tr key={i} className="border-t border-border/40">
                          <td className="p-2">{String(it.metal).charAt(0).toUpperCase() + String(it.metal).slice(1)} {it.karat}</td>
                          <td className="p-2 text-right">{it.weightGrams}g</td>
                          <td className="p-2 text-right">{it.adjustedBuyPct ?? it.buyPct ?? '—'}%{it.bullionApplied ? ' (bullion)' : it.bonusApplied ? ` (+${it.bonusApplied})` : ''}</td>
                          <td className="p-2 text-right font-medium">{it.offer != null ? `${cs}${Number(it.offer).toFixed(2)}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Weight</p>
                    <p className="text-lg font-bold text-foreground">{multiItems.reduce((s: number, it: any) => s + (Number(it.weightGrams) || 0), 0).toFixed(2)}g</p>
                  </div>
                  {lead.estimated_offer != null && (
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your Offer (total)</p>
                      <p className="text-lg font-bold text-primary">{cs}{lead.estimated_offer.toFixed(2)}</p>
                      {lead.competitor_offer != null && <p className="text-xs text-muted-foreground">Competitor: {cs}{lead.competitor_offer.toFixed(2)}</p>}
                    </div>
                  )}
                  {lead.estimated_profit != null && (
                    <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Estimated Profit</p>
                      <p className="text-lg font-bold text-green-600">{cs}{lead.estimated_profit.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : pureValue && spotPerGram && purity ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Spot Price</p>
                  <p className="text-lg font-bold text-foreground flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    {cs}{lead.spot_price_at_time?.toLocaleString()}/oz
                  </p>
                  <p className="text-xs text-muted-foreground">{cs}{spotPerGram.toFixed(2)}/g · {lead.spot_price_date}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pure Metal Value</p>
                  <p className="text-lg font-bold text-foreground">{cs}{pureValue.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{lead.weight_grams}g × {cs}{spotPerGram.toFixed(2)} × {(purity * 100).toFixed(1)}%</p>
                </div>
                {lead.estimated_offer != null && (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your Offer{buyPct ? ` (${buyPct.toFixed(0)}%)` : ''}</p>
                    <p className="text-lg font-bold text-primary">{cs}{lead.estimated_offer.toFixed(2)}</p>
                    {lead.competitor_offer != null && (
                      <p className="text-xs text-muted-foreground">Competitor: {cs}{lead.competitor_offer.toFixed(2)}{competitorPct ? ` (${competitorPct.toFixed(0)}%)` : ''}</p>
                    )}
                  </div>
                )}
                {lead.estimated_profit != null && (
                  <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Estimated Profit</p>
                    <p className="text-lg font-bold text-green-600">{cs}{lead.estimated_profit.toFixed(2)}</p>
                  </div>
                )}
              </div>
            ) : quoteFailed ? (
              <div className="space-y-3 p-4 rounded-lg bg-orange-500/5 border border-orange-500/20">
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Live quote not available</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Customer provided: {metalLabel} {lead.karat}, {lead.weight_grams}g.
                      Spot price couldn't be fetched at submission time.
                    </p>
                  </div>
                </div>
                {hasEditAccess && (
                  <Button size="sm" variant="outline" className="gap-2" onClick={handleRecalculate} disabled={recalculating}>
                    <RefreshCw className={`h-3.5 w-3.5 ${recalculating ? 'animate-spin' : ''}`} />
                    {recalculating ? 'Recalculating…' : 'Recalculate quote'}
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 rounded-lg bg-muted/50">
                <Calculator className="h-4 w-4" />
                <span>Estimate unavailable — customer did not provide weight or karat details.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Photos */}
        {lead.photo_urls && lead.photo_urls.length > 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Image className="h-4 w-4" />
                Photos ({lead.photo_urls.length})
              </h3>
              <Separator />
              <div className="flex gap-3 flex-wrap">
                {lead.photo_urls.map((url, idx) => (
                  <Dialog key={idx}>
                    <DialogTrigger asChild>
                      <img
                        src={url}
                        alt={`Photo ${idx + 1}`}
                        className="w-24 h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity border border-border"
                      />
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl">
                      <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-auto rounded" />
                    </DialogContent>
                  </Dialog>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* View Full Lead CTA */}
        {onViewFullLead && (
          <div className="lg:col-span-2">
            <Button variant="outline" className="w-full gap-2" onClick={onViewFullLead}>
              <ExternalLink className="h-4 w-4" />
              View full lead submissions
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
