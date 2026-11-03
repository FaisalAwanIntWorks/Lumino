import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { Activity, AlertTriangle, Info, XCircle } from 'lucide-react';

interface AuditLog {
  id: string;
  timestamp: string;
  user_email: string;
  action_type: string;
  resource_type?: string;
  severity: string;
}

interface ActivityFeedProps {
  logs: AuditLog[];
}

export const ActivityFeed = ({ logs }: ActivityFeedProps) => {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      default:
        return <Info className="w-4 h-4 text-blue-600" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'warning':
        return (
          <Badge
            variant="secondary"
            className="bg-amber-500/10 text-amber-600 border-amber-500/20"
          >
            Warning
          </Badge>
        );
      default:
        return <Badge variant="outline">Info</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Activity Feed
        </CardTitle>
        <CardDescription>Recent system actions and events (last 100)</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-3">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No activity logs found
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="mt-0.5">{getSeverityIcon(log.severity)}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {log.action_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      {getSeverityBadge(log.severity)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {log.user_email}
                      {log.resource_type && ` • ${log.resource_type}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
