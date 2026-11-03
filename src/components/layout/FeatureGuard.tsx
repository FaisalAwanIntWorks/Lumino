import { ReactNode } from 'react';
import { useClientFeatures, ClientFeatures } from '@/hooks/useClientFeatures';
import { Lock } from 'lucide-react';

interface FeatureGuardProps {
  feature?: keyof ClientFeatures;
  anyOf?: (keyof ClientFeatures)[];
  children: ReactNode;
}

export function FeatureGuard({ feature, anyOf, children }: FeatureGuardProps) {
  const { isFeatureEnabled, isLoading } = useClientFeatures();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const hasAccess = anyOf
    ? anyOf.some(f => isFeatureEnabled(f))
    : feature ? isFeatureEnabled(feature) : true;

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
          <Lock className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Feature Locked</h2>
        <p className="text-muted-foreground max-w-md">
          This feature is not available on your current plan. Please contact your administrator to enable access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
