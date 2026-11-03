import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface UsageAlert {
  id: string;
  client_id: string;
  client_name: string;
  alert_type: string;
  threshold_percentage: number;
  current_usage: number;
  limit_value: number;
  severity: string;
  triggered_at: string;
  acknowledged: boolean;
}

interface AllClientAlertsTableProps {
  alerts: UsageAlert[];
  onRefresh: () => void;
}

export const AllClientAlertsTable = ({ alerts, onRefresh }: AllClientAlertsTableProps) => {
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedAlerts(new Set(alerts.filter(a => !a.acknowledged).map(a => a.id)));
    } else {
      setSelectedAlerts(new Set());
    }
  };

  const handleSelectAlert = (alertId: string, checked: boolean) => {
    const newSelected = new Set(selectedAlerts);
    if (checked) newSelected.add(alertId); else newSelected.delete(alertId);
    setSelectedAlerts(newSelected);
  };

  const handleBulkAcknowledge = async () => {
    toast.info('Usage alerts system is being upgraded');
    setSelectedAlerts(new Set());
  };

  const handleAcknowledge = async (_alertId: string) => {
    toast.info('Usage alerts system is being upgraded');
    onRefresh();
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      case 'warning': return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Warning</Badge>;
      default: return <Badge variant="outline">Info</Badge>;
    }
  };

  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-lg">
        <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50 text-emerald-600" />
        <p>No active alerts</p>
        <p className="text-sm">All clients are within safe usage limits</p>
      </div>
    );
  }

  const unacknowledgedCount = alerts.filter(a => !a.acknowledged).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Checkbox
            checked={selectedAlerts.size > 0 && selectedAlerts.size === unacknowledgedCount}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">
            {selectedAlerts.size > 0 ? `${selectedAlerts.size} selected` : `${unacknowledgedCount} unacknowledged`}
          </span>
        </div>
        {selectedAlerts.size > 0 && (
          <Button size="sm" onClick={handleBulkAcknowledge}>
            Acknowledge Selected ({selectedAlerts.size})
          </Button>
        )}
      </div>

      <div className="border rounded-lg">
        <Table containerClassName={stickyHeaderTableClass}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Alert Type</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Triggered</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((alert) => (
              <TableRow key={alert.id}>
                <TableCell>
                  {!alert.acknowledged && (
                    <Checkbox checked={selectedAlerts.has(alert.id)} onCheckedChange={(checked) => handleSelectAlert(alert.id, checked as boolean)} />
                  )}
                </TableCell>
                <TableCell className="font-medium">{alert.client_name}</TableCell>
                <TableCell className="capitalize">{alert.alert_type.replace(/_/g, ' ')}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm">{alert.current_usage.toFixed(0)} / {alert.limit_value}</div>
                    <div className="text-xs text-muted-foreground">{alert.threshold_percentage}% threshold</div>
                  </div>
                </TableCell>
                <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                <TableCell>{formatDistanceToNow(new Date(alert.triggered_at), { addSuffix: true })}</TableCell>
                <TableCell>
                  {alert.acknowledged ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"><CheckCircle className="w-3 h-3 mr-1" />Acknowledged</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20"><AlertCircle className="w-3 h-3 mr-1" />Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {!alert.acknowledged && <Button size="sm" variant="outline" onClick={() => handleAcknowledge(alert.id)}>Acknowledge</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
