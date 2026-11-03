import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, TrendingUp, TrendingDown, AlertTriangle, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ClientHealth {
  client_id: string;
  client_name: string;
  health_score: number;
  engagement_level: string;
  churn_risk_score: number;
  last_activity_date?: string;
  orders_count_30d: number;
  growth_rate: number;
}

interface ClientHealthWidgetProps {
  inactiveClients: ClientHealth[];
  highGrowthClients: ClientHealth[];
  churnRiskClients: ClientHealth[];
}

export const ClientHealthWidget = ({
  inactiveClients,
  highGrowthClients,
  churnRiskClients,
}: ClientHealthWidgetProps) => {
  const navigate = useNavigate();

  const getHealthBadge = (score: number) => {
    if (score >= 70) {
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
          Healthy
        </Badge>
      );
    }
    if (score >= 40) {
      return (
        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
          At Risk
        </Badge>
      );
    }
    return <Badge variant="destructive">Critical</Badge>;
  };

  const formatDaysAgo = (date?: string) => {
    if (!date) return 'Never';
    const days = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Client Health Monitoring
        </CardTitle>
        <CardDescription>Track client engagement, growth, and churn risk</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="inactive" className="space-y-4">
          <div className="overflow-x-auto pb-px">
            <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0">
              <TabsTrigger value="inactive" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
                Inactive ({inactiveClients.length})
              </TabsTrigger>
              <TabsTrigger value="growth" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
                High Growth ({highGrowthClients.length})
              </TabsTrigger>
              <TabsTrigger value="churn" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
                Churn Risk ({churnRiskClients.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="inactive" className="space-y-3">
            {inactiveClients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No inactive clients</p>
                <p className="text-sm">All clients have recent activity</p>
              </div>
            ) : (
              inactiveClients.map((client) => (
                <div
                  key={client.client_id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50"
                >
                  <div className="space-y-1">
                    <div className="font-medium">{client.client_name}</div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Last activity: {formatDaysAgo(client.last_activity_date)}</span>
                      <span>•</span>
                      {getHealthBadge(client.health_score)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/admin/clients/${client.client_id}`)}
                  >
                    Review
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="growth" className="space-y-3">
            {highGrowthClients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No high-growth clients</p>
                <p className="text-sm">Monitor clients with &gt;10% weekly growth</p>
              </div>
            ) : (
              highGrowthClients.map((client) => (
                <div
                  key={client.client_id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50"
                >
                  <div className="space-y-1">
                    <div className="font-medium">{client.client_name}</div>
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-600">
                        {client.growth_rate.toFixed(1)}% growth
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">
                        {client.orders_count_30d} orders (30d)
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/admin/clients/${client.client_id}`)}
                  >
                    View
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="churn" className="space-y-3">
            {churnRiskClients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50 text-emerald-600" />
                <p>No churn risk detected</p>
                <p className="text-sm">All clients showing healthy engagement</p>
              </div>
            ) : (
              churnRiskClients.map((client) => (
                <div
                  key={client.client_id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50"
                >
                  <div className="space-y-1">
                    <div className="font-medium">{client.client_name}</div>
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span className="text-amber-600">
                        {client.churn_risk_score}% churn risk
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <Badge
                        variant="outline"
                        className="capitalize"
                      >
                        {client.engagement_level}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/admin/clients/${client.client_id}`)}
                  >
                    Contact
                  </Button>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
