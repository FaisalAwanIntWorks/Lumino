import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CostSimulator } from '@/components/admin/ai-cost/CostSimulator';
import { ClientQuotaManager } from '@/components/admin/ai-cost/ClientQuotaManager';
import { PlatformAiConfig } from '@/components/admin/ai-cost/PlatformAiConfig';
import { PlanManager } from '@/components/admin/ai-cost/PlanManager';

export default function AiCostCalculator() {
  const [totalClients, setTotalClients] = useState(0);

  useEffect(() => {
    supabase.from('clients').select('id', { count: 'exact', head: true }).then(({ count }) => {
      setTotalClients(count || 0);
    });
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">AI Wallet</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage AI credit balances, usage, and quota settings per client
        </p>
      </div>

      <PlanManager />
      <CostSimulator totalClients={totalClients} />
      <PlatformAiConfig />
      <ClientQuotaManager />
    </div>
  );
}
