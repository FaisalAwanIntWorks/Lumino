import { stickyHeaderTableClass } from "@/components/ui/table";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface SecurityEvent {
  id: string;
  timestamp: string;
  event_type: string;
  email_attempted?: string;
  severity: string;
  resolved: boolean;
}

interface SecurityEventsTableProps {
  events: SecurityEvent[];
  onResolve: () => void;
}

export const SecurityEventsTable = ({ events, onResolve }: SecurityEventsTableProps) => {
  const handleResolve = async (_eventId: string) => {
    toast.info('Security events system is being upgraded');
    onResolve();
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      default: return <CheckCircle className="w-4 h-4 text-emerald-600" />;
    }
  };

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-lg">
        <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50 text-emerald-600" />
        <p>No security events</p>
        <p className="text-sm">All systems running normally</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table containerClassName={stickyHeaderTableClass}>
        <TableHeader>
          <TableRow>
            <TableHead>Severity</TableHead>
            <TableHead>Event Type</TableHead>
            <TableHead>Email/User</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getSeverityIcon(event.severity)}
                  <span className="capitalize">{event.severity}</span>
                </div>
              </TableCell>
              <TableCell className="font-medium">{event.event_type.replace(/_/g, ' ')}</TableCell>
              <TableCell>{event.email_attempted || 'N/A'}</TableCell>
              <TableCell>{formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}</TableCell>
              <TableCell>
                {event.resolved ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"><CheckCircle className="w-3 h-3 mr-1" />Resolved</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Open</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {!event.resolved && <Button size="sm" variant="outline" onClick={() => handleResolve(event.id)}>Resolve</Button>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
