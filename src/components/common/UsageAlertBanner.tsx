import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { getActiveAlerts, acknowledgeAlert, getSeverityBadgeVariant, type UsageAlert } from '@/lib/usage-utils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function UsageAlertBanner() {
  const [alerts, setAlerts] = useState<UsageAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    loadAlerts();
  }, [user]);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: clientData, error } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching client:', error);
        return;
      }
      
      if (clientData) {
        const activeAlerts = await getActiveAlerts(clientData.id);
        setAlerts(activeAlerts);
      }
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      await acknowledgeAlert(alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      toast.success('Alert acknowledged');
    } catch (error) {
      toast.error('Failed to acknowledge alert');
    }
  };

  if (loading || alerts.length === 0) return null;

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getAlertVariant = (severity: string): 'destructive' | 'default' => {
    return severity === 'critical' ? 'destructive' : 'default';
  };

  return (
    <div className="space-y-2 p-4 bg-background/50">
      {alerts.map((alert) => (
        <Alert key={alert.id} variant={getAlertVariant(alert.severity)}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {getIcon(alert.severity)}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTitle className="mb-0">Usage Alert</AlertTitle>
                  <Badge variant={getSeverityBadgeVariant(alert.severity)}>
                    {alert.threshold_percentage}% threshold
                  </Badge>
                </div>
                <AlertDescription>{alert.message}</AlertDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleAcknowledge(alert.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      ))}
    </div>
  );
}