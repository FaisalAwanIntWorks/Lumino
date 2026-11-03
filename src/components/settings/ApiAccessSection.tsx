import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Key, Copy, Loader2, Shield, ExternalLink } from 'lucide-react';

interface UnkeyKeyInfo {
  id: string;
  start: string;
  ownerId?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  expires?: number;
  remaining?: number;
  enabled: boolean;
  name?: string;
}

export function ApiAccessSection() {
  const { user } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();

  // Get client ID
  const { data: clientData } = useQuery({
    queryKey: ['client-for-api-access', user?.id, impersonatedClientId],
    queryFn: async () => {
      if (isImpersonating && impersonatedClientId) {
        return { id: impersonatedClientId };
      }
      const { data, error } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user || isImpersonating,
  });

  // Fetch keys for this client
  const { data: keysData, isLoading } = useQuery({
    queryKey: ['client-api-keys', clientData?.id],
    queryFn: async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unkey-list-keys${clientData?.id ? `?clientId=${clientData.id}` : ''}`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!response.ok) throw new Error('Failed to fetch API keys');
      return await response.json() as { keys: UnkeyKeyInfo[]; total: number };
    },
    enabled: !!clientData?.id,
  });

  const handleCopyPrefix = (prefix: string) => {
    navigator.clipboard.writeText(prefix + '...');
    toast.success('Key prefix copied');
  };

  const keys = keysData?.keys || [];

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Key className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">API Access</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Your API keys for programmatic access to your data
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No API keys assigned yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Contact your account administrator to request API access.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border/50 bg-muted/20"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{key.name || 'API Key'}</span>
                    <Badge variant={key.enabled ? 'default' : 'secondary'} className="text-[10px]">
                      {key.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="font-mono bg-muted px-2 py-0.5 rounded">{key.start}...</span>
                    <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                    {key.expires && (
                      <span>Expires {new Date(key.expires).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => handleCopyPrefix(key.start)}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy Prefix
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Usage info */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30 mt-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">How to use:</span> Include your API key in requests using the <code className="bg-muted px-1 py-0.5 rounded text-[11px]">Authorization: Bearer {'<your-key>'}</code> header or <code className="bg-muted px-1 py-0.5 rounded text-[11px]">x-api-key: {'<your-key>'}</code> header.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
