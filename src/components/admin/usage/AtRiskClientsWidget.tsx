import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AtRiskClient {
  client_id: string;
  client_name: string;
  highest_usage_type: string;
  highest_usage_percentage: number;
  days_to_limit: number;
}

interface AtRiskClientsWidgetProps {
  clients: AtRiskClient[];
}

export const AtRiskClientsWidget = ({ clients }: AtRiskClientsWidgetProps) => {
  const navigate = useNavigate();

  if (clients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-muted-foreground" />
            At-Risk Clients
          </CardTitle>
          <CardDescription>
            Clients at 75%+ usage on any resource
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No clients at risk</p>
            <p className="text-sm">All clients are within safe usage limits</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          At-Risk Clients ({clients.length})
        </CardTitle>
        <CardDescription>
          Clients at 75%+ usage on any resource
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {clients.map((client) => (
          <div
            key={client.client_id}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
          >
            <div className="space-y-1">
              <div className="font-medium">{client.client_name}</div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge
                  variant={client.highest_usage_percentage >= 90 ? 'destructive' : 'secondary'}
                  className={
                    client.highest_usage_percentage < 90
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : ''
                  }
                >
                  {client.highest_usage_type}: {client.highest_usage_percentage.toFixed(0)}%
                </Badge>
                <span>•</span>
                <span>
                  {client.days_to_limit > 0
                    ? `${client.days_to_limit} days to limit`
                    : 'At limit'}
                </span>
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
        ))}
      </CardContent>
    </Card>
  );
};
