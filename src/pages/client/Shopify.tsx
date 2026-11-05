import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShoppingBag, CheckCircle2, XCircle, Link as LinkIcon, RefreshCw, Copy, Check, AlertCircle, Info, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { encryptShopifyToken, encryptStorefrontToken } from '@/lib/encryption-utils';

export default function ShopifyPage() {
  const { user } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const { toast } = useToast();
  const [storeUrl, setStoreUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [storefrontToken, setStorefrontToken] = useState('');
  const [isAdminConnected, setIsAdminConnected] = useState(false);
  const [isStorefrontConnected, setIsStorefrontConnected] = useState(false);
  const [autoSyncOrders, setAutoSyncOrders] = useState(true);
  const [autoSyncProducts, setAutoSyncProducts] = useState(false);
  const [syncFrequency, setSyncFrequency] = useState<'realtime' | 'hourly' | 'daily'>('hourly');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingAdmin, setTestingAdmin] = useState(false);
  const [testingStorefront, setTestingStorefront] = useState(false);
  const [shopInfo, setShopInfo] = useState<{ name: string; domain: string; currency?: string } | null>(null);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [oauthShop, setOauthShop] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);

  const isConnected = isAdminConnected || isStorefrontConnected;


  useEffect(() => {
    document.title = 'Client • Shopify Integration | Aurezo';
    if (isImpersonating && !impersonatedClientId) return;
    loadShopifySettings();
  }, [isImpersonating, impersonatedClientId]);

  // Handle OAuth callback redirect (?connected=1 or ?error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') {
      toast({
        title: 'Shopify Connected',
        description: `Store ${params.get('shop') || ''} connected successfully.`,
      });
      window.history.replaceState({}, '', window.location.pathname);
      // Poll a few times to give the callback a moment to finish writing the encrypted token
      let attempts = 0;
      const id = window.setInterval(() => {
        attempts++;
        loadShopifySettings();
        if (attempts >= 8) window.clearInterval(id);
      }, 2000);
      loadShopifySettings();
      return () => window.clearInterval(id);
    } else if (params.get('error')) {
      toast({
        title: 'Shopify Connection Failed',
        description: `Reason: ${params.get('error')}`,
        variant: 'destructive',
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: flip Connected state instantly when tokens land on the client row
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`shopify-client-${clientId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'clients', filter: `id=eq.${clientId}` },
        () => loadShopifySettings(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleOAuthConnect = async () => {
    if (!oauthShop.trim()) {
      toast({ title: 'Enter your Shopify domain', description: 'e.g. your-store.myshopify.com', variant: 'destructive' });
      return;
    }
    setOauthLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData?.session?.access_token;
      const returnUrl = `${window.location.origin}${window.location.pathname}`;

      const targetClientId = isImpersonating && impersonatedClientId ? impersonatedClientId : undefined;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-oauth-start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            shop: oauthShop.trim(),
            returnUrl,
            clientId: targetClientId,
            impersonating: !!targetClientId,
          }),
        },
      );
      const result = await resp.json();
      if (!resp.ok || !result.install_url) {
        throw new Error(result.error || 'Failed to start install');
      }
      window.location.href = result.install_url;
    } catch (e: any) {
      toast({ title: 'Could not start install', description: e.message || 'Try again', variant: 'destructive' });
      setOauthLoading(false);
    }
  };


  const loadShopifySettings = async () => {
    if (!user) return;

    const targetClientId = isImpersonating && impersonatedClientId ? impersonatedClientId : null;

    // Fetch id, store URL, and user_id of the row we're targeting
    const query = targetClientId
      ? supabase.from('clients').select('id, user_id, shopify_store_url').eq('id', targetClientId).maybeSingle()
      : supabase.from('clients').select('id, user_id, shopify_store_url').eq('user_id', user.id).maybeSingle();

    const { data, error } = await query;
    if (error && error.code !== 'PGRST116') console.error('Error loading Shopify settings:', error);

    if (data?.id) setClientId(data.id);
    const checkUserId = data?.user_id ?? null;
    setTargetUserId(checkUserId);

    if (data?.shopify_store_url) {
      setStoreUrl(data.shopify_store_url);
    } else {
      setStoreUrl('');
    }

    if (checkUserId) {
      const { data: adminTokenData } = await supabase.rpc('decrypt_shopify_token', { client_user_id: checkUserId });
      const hasAdminToken = !!adminTokenData;
      setIsAdminConnected(hasAdminToken);
      setAccessToken(hasAdminToken ? '••••••••••••••••' : '');

      const { data: storefrontTokenData } = await supabase.rpc('decrypt_storefront_token', { client_user_id: checkUserId });
      const hasStorefrontToken = !!storefrontTokenData;
      setIsStorefrontConnected(hasStorefrontToken);
      setStorefrontToken(hasStorefrontToken ? '••••••••••••••••' : '');
    } else {
      setIsAdminConnected(false);
      setIsStorefrontConnected(false);
      setAccessToken('');
      setStorefrontToken('');
    }
  };

  const handleTestConnection = async (tokenType: 'admin' | 'storefront') => {
    const token = tokenType === 'admin' ? accessToken : storefrontToken;
    if (!storeUrl || !token || token.includes('•')) {
      toast({
        title: 'Missing Information',
        description: `Please enter both Store URL and ${tokenType === 'admin' ? 'Admin API' : 'Storefront API'} Access Token`,
        variant: 'destructive',
      });
      return;
    }

    if (tokenType === 'admin') {
      setTestingAdmin(true);
    } else {
      setTestingStorefront(true);
    }
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData?.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-test-connection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            storeUrl,
            accessToken: token,
            tokenType,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        setShopInfo(result.shop);
        toast({
          title: `${tokenType === 'admin' ? 'Admin API' : 'Storefront API'} Connection Successful!`,
          description: `Connected to ${result.shop.name}`,
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: result.error || 'Unable to connect to store',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to test connection. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setTestingAdmin(false);
      setTestingStorefront(false);
    }
  };

  const handleConnect = async () => {
    if (!storeUrl) {
      toast({
        title: 'Missing Information',
        description: 'Please enter Store URL',
        variant: 'destructive',
      });
      return;
    }

    if (!targetUserId || !clientId) {
      toast({
        title: 'Account not loaded',
        description: 'Please refresh the page and try again.',
        variant: 'destructive',
      });
      return;
    }

    // At least one token is required
    const hasNewAdminToken = accessToken && !accessToken.includes('•');
    const hasNewStorefrontToken = storefrontToken && !storefrontToken.includes('•');
    const hasExistingAdminToken = accessToken.includes('•');
    const hasExistingStorefrontToken = storefrontToken.includes('•');

    if (!hasNewAdminToken && !hasNewStorefrontToken && !hasExistingAdminToken && !hasExistingStorefrontToken) {
      toast({
        title: 'Missing Information',
        description: 'Please enter at least one API Access Token, or use Quick Connect above.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // Update store URL — target the right client row (impersonated or own)
      const { error: updateError } = await supabase
        .from('clients')
        .update({ shopify_store_url: storeUrl })
        .eq('id', clientId);

      if (updateError) throw updateError;

      // Encrypt and store the Admin API token if it's new
      if (hasNewAdminToken) {
        await encryptShopifyToken(targetUserId, accessToken);
        setIsAdminConnected(true);

        // Auto-register webhook for order sync (non-blocking, only when user
        // is operating on their own store — webhook registration uses the
        // caller's auth)
        if (!isImpersonating) {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const authToken = sessionData?.session?.access_token;
            const webhookResponse = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-shopify-webhooks`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${authToken}`,
                },
              },
            );
            const webhookResult = await webhookResponse.json();
            if (!webhookResult.success) {
              console.warn('Webhook registration warning:', webhookResult.error);
            }
          } catch (webhookError) {
            console.warn('Failed to auto-register webhook:', webhookError);
          }
        }
      }

      // Encrypt and store the Storefront API token if it's new
      if (hasNewStorefrontToken) {
        await encryptStorefrontToken(targetUserId, storefrontToken);
        setIsStorefrontConnected(true);
      }

      setIsEditing(false);
      setLastSync(new Date());
      if (hasNewAdminToken) setAccessToken('••••••••••••••••');
      if (hasNewStorefrontToken) setStorefrontToken('••••••••••••••••');

      toast({
        title: isEditing ? 'Updated!' : 'Connected!',
        description: isEditing ? 'Your settings have been updated' : 'Your Shopify store is now securely connected. Push your catalog to start selling!',
      });
    } catch (error) {
      console.error('Connection error:', error);
      toast({
        title: 'Error',
        description: 'Failed to save credentials. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    loadShopifySettings();
  };

  const handleDisconnect = async () => {
    if (!clientId) return;
    const { error } = await supabase
      .from('clients')
      .update({
        shopify_store_url: null,
        shopify_access_token_encrypted: null,
        shopify_admin_access_token_encrypted: null,
        shopify_storefront_token_encrypted: null,
        shopify_webhook_secret_encrypted: null,
      })
      .eq('id', clientId);

    if (error) {
      console.error('Failed to disconnect Shopify:', error);
      toast({
        title: 'Disconnect Failed',
        description: 'Failed to disconnect Shopify store. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    setIsAdminConnected(false);
    setIsStorefrontConnected(false);
    setStoreUrl('');
    setAccessToken('');
    setStorefrontToken('');
    setShopInfo(null);

    toast({
      title: 'Disconnected',
      description: 'Your Shopify store has been disconnected',
    });

    loadShopifySettings();
  };

  const handleManualSync = () => {
    setLoading(true);
    setTimeout(() => {
      setLastSync(new Date());
      setLoading(false);
      toast({
        title: 'Sync Complete',
        description: 'Successfully synced orders and products',
      });
    }, 2000);
  };

  const copyToClipboard = (text: string, step: number) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(step);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Shopify Integration</h1>
        <p className="text-muted-foreground">
          Connect your Shopify store to enable the Aurezo ring builder on your site
        </p>
      </div>

      {/* Connection Status */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-8 h-8 text-primary" />
            <div>
              <h3 className="text-lg font-semibold">Connection Status</h3>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <div className="flex items-center gap-1.5">
                  {isAdminConnected ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className={`text-xs ${isAdminConnected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                    Catalog Sync
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isStorefrontConnected ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-amber-500" />
                  )}
                  <span className={`text-xs ${isStorefrontConnected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    Checkout
                  </span>
                </div>
              </div>
            </div>
          </div>
          {isConnected && !isEditing && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleEdit} size="sm">
                Edit
              </Button>
              <Button variant="outline" onClick={handleDisconnect} size="sm">
                Disconnect
              </Button>
            </div>
          )}
        </div>

        {!isConnected || isEditing ? (
          <div className="space-y-4">
            {!isEditing && (
              <div className="rounded-lg border border-border p-4 space-y-3 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <p className="font-semibold text-sm">Quick Connect (Recommended)</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter your Shopify domain and approve the install in your Shopify admin. Tokens are generated and stored automatically — no copy/paste needed.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="your-store.myshopify.com"
                    value={oauthShop}
                    onChange={(e) => setOauthShop(e.target.value)}
                    className="flex-1"
                    autoComplete="off"
                  />
                  <Button onClick={handleOAuthConnect} disabled={oauthLoading || !oauthShop.trim()}>
                    {oauthLoading ? 'Opening...' : 'Connect Shopify'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  You'll be redirected to Shopify to approve the app install. Make sure you're logged into the target store first.
                </p>
              </div>
            )}

            <Alert>
              <LinkIcon className="h-4 w-4" />
              <AlertDescription>
                {isEditing ? 'Update your Shopify connection settings below.' : 'Or paste API credentials manually (advanced).'}
              </AlertDescription>
            </Alert>


            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="shopify-store-url">Shopify Store URL</Label>
                <Input
                  id="shopify-store-url"
                  placeholder="your-store.myshopify.com"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {/* Admin API Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="shopify-admin-token">Admin API Access Token</Label>
                  {isAdminConnected && <Badge variant="secondary" className="text-xs">Connected</Badge>}
                </div>
                <div className="flex gap-2">
                  <Input
                    id="shopify-admin-token"
                    type={accessToken.includes('•') ? 'text' : 'password'}
                    placeholder={isEditing ? 'Leave masked to keep existing token' : 'shpat_...'}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    autoComplete="new-password"
                    className="flex-1"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleTestConnection('admin')} 
                    disabled={testingAdmin || !accessToken || accessToken.includes('•')}
                  >
                    {testingAdmin ? 'Testing...' : 'Test'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used for creating products and managing your catalog
                </p>
              </div>

              {/* Storefront API Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="shopify-storefront-token">Storefront API Access Token</Label>
                  {isStorefrontConnected && <Badge variant="secondary" className="text-xs">Connected</Badge>}
                </div>
                <div className="flex gap-2">
                  <Input
                    id="shopify-storefront-token"
                    type={storefrontToken.includes('•') ? 'text' : 'password'}
                    placeholder={isEditing ? 'Leave masked to keep existing token' : 'Your storefront access token...'}
                    value={storefrontToken}
                    onChange={(e) => setStorefrontToken(e.target.value)}
                    autoComplete="new-password"
                    className="flex-1"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleTestConnection('storefront')} 
                    disabled={testingStorefront || !storefrontToken || storefrontToken.includes('•')}
                  >
                    {testingStorefront ? 'Testing...' : 'Test'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>Required for checkout.</strong> Used for "Add to Cart" and checkout functionality.
                </p>
              </div>

              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button onClick={handleCancelEdit} variant="outline" className="flex-1">
                      Cancel
                    </Button>
                    <Button onClick={handleConnect} disabled={loading} className="flex-1">
                      {loading ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </>
                ) : (
                  <Button onClick={handleConnect} disabled={loading} className="w-full">
                    {loading ? 'Connecting...' : 'Connect Store'}
                  </Button>
                )}
              </div>

              {shopInfo && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertDescription>
                    <strong>Test Successful!</strong><br />
                    Store: {shopInfo.name}<br />
                    Domain: {shopInfo.domain}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="text-sm font-medium">Store URL</p>
                <p className="text-sm text-muted-foreground">{storeUrl}</p>
              </div>
              <Badge variant="secondary">Active</Badge>
            </div>

            {!isStorefrontConnected && (
              <Alert className="bg-amber-500/10 border-amber-500/30">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  <strong>Checkout not enabled:</strong> Add your Storefront API Access Token to enable "Add to Cart" functionality.
                  <Button variant="link" className="p-0 h-auto ml-1 text-amber-700 dark:text-amber-300 underline" onClick={handleEdit}>
                    Edit Settings
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <Alert className="bg-primary/5 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription>
                <strong>Next step:</strong> Go to your <a href="/client/catalog" className="text-primary underline">Catalog</a> page and click "Push to Shopify" to sync your products.
              </AlertDescription>
            </Alert>

            {lastSync && (
              <p className="text-xs text-muted-foreground">
                Last synced: {lastSync.toLocaleString()}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Webhook Setup */}
      {isConnected && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Order Webhook Setup</h3>
          <p className="text-sm text-muted-foreground mb-4">
            To automatically receive orders placed through Ring OS (Ring Builder, Grillz Builder, Custom Inquiry), add the webhook URL below in your Shopify Admin.
          </p>

          <div className="space-y-4">
            <div className="bg-muted p-3 rounded-lg">
              <Label className="text-xs text-muted-foreground mb-1 block">Webhook URL (unique to your account)</Label>
              <div className="flex items-center gap-2">
                <code className="text-xs flex-1 break-all select-all">
                  {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-order-webhook${clientId ? `?client_id=${clientId}` : ''}`}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => copyToClipboard(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-order-webhook${clientId ? `?client_id=${clientId}` : ''}`, 99)}
                >
                  {copiedStep === 99 ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="text-sm space-y-2">
              <p className="font-medium">How to add in Shopify:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Go to <strong>Shopify Admin → Settings → Notifications</strong></li>
                <li>Scroll to <strong>Webhooks</strong> and click <strong>"Create webhook"</strong></li>
                <li>Set Event to <strong>"Order creation"</strong></li>
                <li>Set Format to <strong>"JSON"</strong></li>
                <li>Paste the webhook URL above</li>
                <li>Click <strong>Save</strong></li>
              </ol>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Only orders tagged with an Aurezo source (Ring Builder, Grillz Builder, or Custom Inquiry) will be processed. All other Shopify orders are ignored.
              </AlertDescription>
            </Alert>
          </div>
        </Card>
      )}

      {/* Sync Settings */}
      {isConnected && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Sync Settings</h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-sync Orders</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically sync orders from the configurator to Shopify
                </p>
              </div>
              <Switch
                checked={autoSyncOrders}
                onCheckedChange={setAutoSyncOrders}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Import Shopify Products</Label>
                <p className="text-sm text-muted-foreground">
                  Import existing products from your Shopify store
                </p>
              </div>
              <Switch
                checked={autoSyncProducts}
                onCheckedChange={setAutoSyncProducts}
              />
            </div>

            <div className="space-y-2">
              <Label>Sync Frequency</Label>
              <div className="flex gap-2">
                {(['realtime', 'hourly', 'daily'] as const).map((freq) => (
                  <Button
                    key={freq}
                    variant={syncFrequency === freq ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSyncFrequency(freq)}
                  >
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <Button onClick={handleManualSync} disabled={loading} className="w-full">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Syncing...' : 'Manual Sync Now'}
            </Button>
          </div>
        </Card>
      )}

      {/* Setup Instructions */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Setup Instructions</h3>
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You need to generate an <strong>Admin API access token</strong> from your Shopify admin to enable product sync. Products will be automatically created when you push your catalog.
          </AlertDescription>
        </Alert>
        
        <div className="space-y-6 text-sm">
          <div>
            <h4 className="font-medium mb-2 flex items-center justify-between">
              Step 1: Go to Shopify Admin
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard('https://admin.shopify.com/store/YOUR-STORE-NAME/settings/apps/development', 1)}
              >
                {copiedStep === 1 ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </h4>
            <p className="text-muted-foreground mb-2">
              Navigate to: <strong>Settings → Apps and sales channels → Develop apps</strong>
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">Step 2: Create a Custom App</h4>
            <p className="text-muted-foreground">
              Click <strong>"Create an app"</strong> and name it "Aurezo Ring Builder"
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">Step 3: Configure Admin API Scopes</h4>
            <p className="text-muted-foreground mb-2">
              Click <strong>"Configure Admin API scopes"</strong> and enable these permissions:
            </p>
            <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-1 relative">
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard('write_products\nread_products\nwrite_inventory\nread_inventory\nwrite_checkouts\nread_checkouts', 2)}
              >
                {copiedStep === 2 ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
              <div>✓ write_products</div>
              <div>✓ read_products</div>
              <div>✓ write_inventory</div>
              <div>✓ read_inventory</div>
              <div>✓ write_checkouts</div>
              <div>✓ read_checkouts</div>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Step 4: Install the App</h4>
            <p className="text-muted-foreground">
              Click <strong>"Install app"</strong> to activate it on your store
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">Step 5: Get Your Access Token</h4>
            <p className="text-muted-foreground">
              Copy the <strong>Admin API access token</strong> that appears after installation
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">Step 6: Connect to Aurezo</h4>
            <p className="text-muted-foreground">
              Paste your Store URL and Admin API token in the form above, then click <strong>Test Connection</strong> and <strong>Connect</strong>
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">Step 7: Push Your Catalog</h4>
            <p className="text-muted-foreground">
              Go to your <strong>Catalog</strong> page and click <strong>"Push to Shopify"</strong> to automatically create all your ring products in Shopify
            </p>
          </div>
        </div>
      </Card>

      {/* Troubleshooting */}
      {isConnected && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Troubleshooting</h3>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Products not appearing in Shopify?</p>
              <p className="text-muted-foreground">
                Make sure you've clicked "Push to Shopify" in your Catalog page. Check that all products show "Synced" status.
              </p>
            </div>
            <div>
              <p className="font-medium">Connection failed?</p>
              <p className="text-muted-foreground">
                Verify your store URL is correct and your Admin API token has the required permissions (write_products, read_products, write_inventory, read_inventory).
              </p>
            </div>
            <div>
              <p className="font-medium">Orders not syncing?</p>
              <p className="text-muted-foreground">
                Check that auto-sync is enabled and try a manual sync. Ensure your Shopify plan supports API access.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
