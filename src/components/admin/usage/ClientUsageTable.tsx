import { stickyHeaderTableClass } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertCircle, CheckCircle, Eye, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ClientUsage {
  client_id: string;
  client_name: string;
  db_usage_mb: number;
  db_percentage: number;
  storage_usage_mb: number;
  storage_percentage: number;
  function_invocations: number;
  function_percentage: number;
  status: 'safe' | 'warning' | 'critical';
  days_to_limit: number;
}

interface ClientUsageTableProps {
  clients: ClientUsage[];
}

export const ClientUsageTable = ({ clients }: ClientUsageTableProps) => {
  const navigate = useNavigate();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'safe':
        return (
          <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            <CheckCircle className="w-3 h-3 mr-1" />
            Safe
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
            <AlertCircle className="w-3 h-3 mr-1" />
            Warning
          </Badge>
        );
      case 'critical':
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Critical
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="border rounded-lg">
      <Table containerClassName={stickyHeaderTableClass}>
        <TableHeader>
          <TableRow>
            <TableHead>Client Name</TableHead>
            <TableHead>DB Usage</TableHead>
            <TableHead>Storage</TableHead>
            <TableHead>Functions</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Days to Limit</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.client_id}>
              <TableCell className="font-medium">{client.client_name}</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="text-sm">{client.db_usage_mb}MB</div>
                  <div className="text-xs text-muted-foreground">
                    ({client.db_percentage.toFixed(1)}%)
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="text-sm">{client.storage_usage_mb}MB</div>
                  <div className="text-xs text-muted-foreground">
                    ({client.storage_percentage.toFixed(1)}%)
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="text-sm">
                    {client.function_invocations.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ({client.function_percentage.toFixed(1)}%)
                  </div>
                </div>
              </TableCell>
              <TableCell>{getStatusBadge(client.status)}</TableCell>
              <TableCell>
                {client.days_to_limit > 0 ? `${client.days_to_limit} days` : 'At limit'}
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/admin/clients/${client.client_id}`)}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </Button>
                {client.status === 'critical' && (
                  <Button size="sm" variant="outline">
                    <Mail className="w-4 h-4 mr-1" />
                    Contact
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
