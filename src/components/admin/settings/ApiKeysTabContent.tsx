import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Key, Plus, Trash2, Copy, AlertTriangle, Loader2, Shield } from 'lucide-react';

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

export function ApiKeysTabContent() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<{ key: string; keyId: string } | null>(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [keyName, setKeyName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [filterClientId, setFilterClientId] = useState<string>('all');

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ['admin-clients-for-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, company_name, status')
        .eq('status', 'active')
        .order('company_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch API keys
  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: ['unkey-api-keys', filterClientId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filterClientId && filterClientId !== 'all') {
        params.clientId = filterClientId;
      }

      const url = filterClientId && filterClientId !== 'all'
        ? `unkey-list-keys?clientId=${filterClientId}`
        : 'unkey-list-keys';

      const { data, error } = await supabase.functions.invoke('unkey-list-keys', {
        body: null,
        headers: filterClientId && filterClientId !== 'all'
          ? { 'x-filter-client': filterClientId }
          : undefined,
      });

      // For the list endpoint, we pass clientId as query param
      // Since functions.invoke doesn't support query params easily,
      // we'll pass it differently
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unkey-list-keys${filterClientId && filterClientId !== 'all' ? `?clientId=${filterClientId}` : ''}`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch API keys');
      return await response.json() as { keys: UnkeyKeyInfo[]; total: number };
    },
  });

  // Create key mutation
  const createKeyMutation = useMutation({
    mutationFn: async (params: { clientId: string; name: string; expiresInDays?: number }) => {
      const { data, error } = await supabase.functions.invoke('unkey-create-key', {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setNewKeyResult({ key: data.key, keyId: data.keyId });
      queryClient.invalidateQueries({ queryKey: ['unkey-api-keys'] });
      toast.success('API key created successfully');
    },
    onError: () => {
      toast.error('Failed to create API key');
    },
  });

  // Revoke key mutation
  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { data, error } = await supabase.functions.invoke('unkey-revoke-key', {
        body: { keyId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unkey-api-keys'] });
      toast.success('API key revoked');
    },
    onError: () => {
      toast.error('Failed to revoke API key');
    },
  });

  const handleCreate = () => {
    if (!selectedClientId) {
      toast.error('Please select a client');
      return;
    }
    createKeyMutation.mutate({
      clientId: selectedClientId,
      name: keyName || undefined,
      expiresInDays: expiresInDays ? parseInt(expiresInDays) : undefined,
    });
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard');
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setNewKeyResult(null);
    setSelectedClientId('');
    setKeyName('');
    setExpiresInDays('');
  };

  const getClientName = (ownerId?: string) => {
    if (!ownerId || !clients) return 'Unknown';
    const client = clients.find(c => c.id === ownerId);
    return client?.company_name || ownerId.slice(0, 8) + '...';
  };

  const keys = keysData?.keys || [];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              API Key Management
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create and manage API keys for client integrations. Keys are managed via Unkey for sub-millisecond verification and built-in rate limiting.
            </p>
          </div>

          <Dialog open={createOpen} onOpenChange={(open) => open ? setCreateOpen(true) : handleCloseCreate()}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Create Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>
                  Generate a new API key for a client. The key will only be shown once.
                </DialogDescription>
              </DialogHeader>

              {newKeyResult ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-destructive">Save this key now</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          This is the only time the full key will be displayed. Store it securely.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={newKeyResult.key}
                      className="font-mono text-sm"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => handleCopyKey(newKeyResult.key)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCloseCreate}>Done</Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm">Client *</Label>
                    <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients?.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Key Name (optional)</Label>
                    <Input
                      className="mt-1"
                      placeholder="e.g. Production API Key"
                      value={keyName}
                      onChange={e => setKeyName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Expires In (days, optional)</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      placeholder="e.g. 365 (leave empty for no expiry)"
                      value={expiresInDays}
                      onChange={e => setExpiresInDays(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={handleCloseCreate}>Cancel</Button>
                    <Button
                      onClick={handleCreate}
                      disabled={createKeyMutation.isPending}
                    >
                      {createKeyMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Create Key
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3 mb-4">
          <Label className="text-sm text-muted-foreground shrink-0">Filter by client:</Label>
          <Select value={filterClientId} onValueChange={setFilterClientId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Keys list */}
        {keysLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No API keys found</p>
            <p className="text-xs text-muted-foreground mt-1">Create a key to get started with API access</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border/50 bg-muted/20"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{key.name || 'Unnamed Key'}</span>
                    <Badge variant={key.enabled ? 'default' : 'secondary'} className="text-[10px]">
                      {key.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="font-mono">{key.start}...</span>
                    <span>Client: {getClientName(key.ownerId)}</span>
                    <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                    {key.expires && (
                      <span>
                        Expires: {new Date(key.expires).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => revokeKeyMutation.mutate(key.id)}
                  disabled={revokeKeyMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Info card */}
      <Card className="p-4 sm:p-6">
        <h3 className="font-semibold text-base sm:text-lg mb-3">How API Keys Work</h3>
        <div className="grid sm:grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground mb-1">🔑 Key Prefix</p>
            <p>All keys start with <code className="text-xs bg-muted px-1.5 py-0.5 rounded">jwlx_</code> for easy identification.</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">⚡ Rate Limiting</p>
            <p>Each key has built-in rate limiting (100 req/min by default) — no extra config needed.</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">📊 Usage Tracking</p>
            <p>All API calls are tracked per-key with analytics available in the Unkey dashboard.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
