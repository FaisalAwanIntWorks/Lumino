import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface AccessDeniedProps {
  feature?: string;
  message?: string;
}

export function AccessDenied({ feature = 'this feature', message }: AccessDeniedProps) {
  return (
    <div className="p-6 sm:p-8 flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">
          {message ?? `You don't have permission to access ${feature}. Please contact your administrator if you need access.`}
        </p>
      </Card>
    </div>
  );
}
