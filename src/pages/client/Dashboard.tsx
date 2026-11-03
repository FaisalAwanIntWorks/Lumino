import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useClientCurrency } from '@/hooks/useClientCurrency';
import { useClientFeatures } from '@/hooks/useClientFeatures';
import { useClientProductType } from '@/hooks/useClientProductType';
import { useClientStatusTags } from '@/hooks/useClientStatusTags';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { useAuth } from '@/contexts/AuthContext';
import { staffCanSeeLeads } from '@/lib/staff-permissions';
import { useClientDashboard } from '@/hooks/useClientDashboard';
import { useLeadDeviceBreakdown } from '@/hooks/useLeadDeviceBreakdown';
import { SessionsChart } from '@/components/dashboard/SessionsChart';
import OnboardingChecklist from '@/components/client/OnboardingChecklist';

import { DashboardHeader } from '@/components/client/dashboard/DashboardHeader';
import { MetricsGrid } from '@/components/client/dashboard/MetricsGrid';
import { ModuleSections, buildClientSections } from '@/components/client/dashboard/ModuleSections';
import { StatusTags } from '@/components/client/dashboard/StatusTags';
import { TrafficOverview } from '@/components/client/dashboard/TrafficOverview';
import { AIActivityCard } from '@/components/client/dashboard/AIActivityCard';
import { RecentLeads } from '@/components/client/dashboard/RecentLeads';
import { RecentOrders } from '@/components/client/dashboard/RecentOrders';
import { LeadSources } from '@/components/client/dashboard/LeadSources';
import { UpcomingBookings } from '@/components/client/dashboard/UpcomingBookings';

export default function Dashboard() {
  const { impersonatedClientId } = useAdminImpersonation();
  const { role, staffInfo } = useAuth();
  // Staff with "Show Leads" off don't see lead / booking lists on the dashboard.
  const showLeadLists = role !== 'staff' || staffCanSeeLeads(staffInfo?.permissions);
  const { currency } = useClientCurrency(impersonatedClientId);
  const { features } = useClientFeatures();
  const { productType, hasRingOS, hasCustomX } = useClientProductType();
  // Glass UI experiment retired — flag is hardcoded off platform-wide.
  const isGlass = false;

  const { stats, loading, dateRange, setDateRange, resolvedClientId, tick } = useClientDashboard();

  const deviceBreakdown = useLeadDeviceBreakdown({
    clientId: resolvedClientId,
    from: dateRange.from,
    to: dateRange.to,
    enabled: !!resolvedClientId,
  });

  const { tags: leadTags } = useClientStatusTags(resolvedClientId, 'leads');
  const { tags: orderTags } = useClientStatusTags(resolvedClientId, 'orders');

  const rangeLabel = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return 'all time';
    if (dateRange.from && dateRange.to) {
      return `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, yyyy')}`;
    }
    if (dateRange.from) return `from ${format(dateRange.from, 'MMM d, yyyy')}`;
    return 'all time';
  }, [dateRange]);

  const moduleSections = useMemo(
    () => (stats ? buildClientSections(stats, features, currency, rangeLabel) : []),
    [stats, features, currency, rangeLabel],
  );

  if (loading) {
    return (
      <div className="pt-[52px] px-4 sm:px-8 lg:px-12 pb-[80px]">
        <Skeleton className="h-5 w-40 mb-2" />
        <Skeleton className="h-9 w-72 mb-10" />
        <div className="grid grid-cols-3 gap-8 mb-10">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-60 mb-6" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <>
      <style>{`
        @keyframes fadeUpIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="bg-background min-h-screen">
        <div className="pt-[52px] px-4 sm:px-8 lg:px-12 pb-[80px]">

          {/* Header */}
          <div style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out 0s forwards` }}>
            <DashboardHeader
              companyName={stats.companyName}
              timezone={stats.timezone}
              dateRange={dateRange}
              setDateRange={setDateRange}
            />
          </div>

          {/* Onboarding Checklist */}
          <div className="mt-8">
            <OnboardingChecklist />
          </div>

          {/* Metrics */}
          {moduleSections.length > 1 ? (
            <ModuleSections sections={moduleSections} isGlass={isGlass} animDelay={0.06} deviceBreakdown={deviceBreakdown} />
          ) : (
            <MetricsGrid
              stats={stats}
              productType={productType}
              rangeLabel={rangeLabel}
              currency={currency}
              hasMetalBuying={features.metal_buying}
              isQuoteEstimator={!!features.dtt_v2}
              isGlass={isGlass}
              animDelay={0.06}
              deviceBreakdown={deviceBreakdown}
            />
          )}

          {/* Status Tags */}
          <StatusTags
            stats={stats}
            leadTags={leadTags}
            orderTags={features.dtt_v2 ? [] : orderTags}
            productType={productType}
            isGlass={isGlass}
            animDelay={0.09}
          />

          {/* Two-Column Layout */}
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
            {/* Left Column (wider) */}
            <div className="lg:col-span-3 space-y-10">
              {stats.allLeads && (
                <SessionsChart
                  allLeads={stats.allLeads}
                  widgetViews={stats.widgetViews}
                  dateRange={dateRange}
                  isGlass={isGlass}
                  preAggregatedTraffic={stats.dailyTraffic}
                />
              )}

              <TrafficOverview
                stats={stats}
                features={features}
                isGlass={isGlass}
                animDelay={0.15}
              />

              {showLeadLists && (
                <RecentLeads
                  leads={stats.recentLeads}
                  currency={currency}
                  isGlass={isGlass}
                  animDelay={0.18}
                  tick={tick}
                />
              )}
            </div>

            {/* Right Column (narrower) */}
            <div className="lg:col-span-2 space-y-10">
              <AIActivityCard
                stats={stats}
                rangeLabel={rangeLabel}
                isGlass={isGlass}
                animDelay={0.12}
              />

              {showLeadLists && (
                <UpcomingBookings
                  bookings={stats.upcomingBookings || []}
                  isGlass={isGlass}
                  animDelay={0.15}
                />
              )}

              {productType !== 'metal_iq' && (
                <RecentOrders
                  orders={stats.recentOrders}
                  currency={currency}
                  isGlass={isGlass}
                  animDelay={0.18}
                />
              )}

              <LeadSources
                stats={stats}
                hasRingOS={hasRingOS}
                hasCustomX={hasCustomX}
                hasMetalBuying={features.metal_buying}
                isGlass={isGlass}
                animDelay={0.24}
              />
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
