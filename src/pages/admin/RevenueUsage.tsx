import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { UsageProductsTab } from '@/components/admin/revenue-usage/UsageProductsTab';
import { SubscriptionProductsTab } from '@/components/admin/revenue-usage/SubscriptionProductsTab';

export default function RevenueUsage() {
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(new Date());

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, company_name')
      .order('company_name')
      .then(({ data }) => {
        setClients((data ?? []).map((c) => ({ id: c.id, name: c.company_name ?? '—' })));
      });
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Revenue & Usage</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track AI credit consumption, subscription revenue, and per-sub-account profitability across the entire platform.
        </p>
      </div>

      <Tabs defaultValue="usage" className="w-full">
        <TabsList>
          <TabsTrigger value="usage">Usage Products</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscription Products</TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="mt-6">
          <UsageProductsTab
            clients={clients}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
          />
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-6">
          <SubscriptionProductsTab
            clients={clients}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
