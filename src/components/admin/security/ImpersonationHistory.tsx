import { stickyHeaderTableClass } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { UserCog, Clock } from 'lucide-react';

interface ImpersonationSession {
  id: string;
  admin_user_id: string;
  client_name: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  actions_performed: number;
}

interface ImpersonationHistoryProps {
  sessions: ImpersonationSession[];
}

export const ImpersonationHistory = ({ sessions }: ImpersonationHistoryProps) => {
  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'In progress';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="w-5 h-5" />
          Impersonation History
        </CardTitle>
        <CardDescription>Admin client view sessions (last 50)</CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No impersonation sessions recorded
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table containerClassName={stickyHeaderTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">{session.client_name}</TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(session.started_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        {formatDuration(session.duration_seconds)}
                      </div>
                    </TableCell>
                    <TableCell>{session.actions_performed}</TableCell>
                    <TableCell>
                      {session.ended_at ? (
                        <Badge variant="outline">Completed</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
