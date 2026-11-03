import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminImpersonation } from "@/contexts/AdminImpersonationContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { ShoppingBag, Database, CreditCard, CheckCircle2, XCircle, Globe, Link as LinkIcon, Store, Shield, Plus, X, Bell, Settings as SettingsIcon, Users, ScrollText, UserCircle, BarChart3, Zap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY_OPTIONS } from "@/hooks/useClientCurrency";
import { usePageSearchRegistration } from '@/hooks/usePageSearchRegistration';
import { StaffTabContent } from "@/components/settings/StaffTabContent";
import { CustomerEmailBrandingCard } from "@/components/settings/CustomerEmailBrandingCard";
import { LoggingTabContent } from "@/components/settings/LoggingTabContent";
import { NotificationPreferencesTab } from "@/components/settings/NotificationPreferencesTab";
import { encryptShopifyToken, encryptStorefrontToken } from "@/lib/encryption-utils";
import { normalizeGtmContainerId } from "@/lib/google-tag";
import { ProfileTabContent } from "@/components/settings/ProfileTabContent";
import { BillingTabContent } from "@/components/settings/BillingTabContent";
import { SchedulingIntegrationCard } from "@/components/settings/SchedulingIntegrationCard";
import { AvailabilityScheduleCard } from "@/components/settings/AvailabilityScheduleCard";
import { GoHighLevelIntegrationCard } from "@/components/settings/GoHighLevelIntegrationCard";



interface Client {
  id: string;
  company_name: string;
  email: string;
  shopify_store_url: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  allowed_domains?: string[] | null;
  currency?: string;
  timezone?: string;
  terms_url?: string | null;
  privacy_url?: string | null;
  meta_pixel_id?: string | null;
  meta_capi_access_token?: string | null;
  google_ads_conversion_id?: string | null;
  google_ads_conversion_labels?: Record<string, string> | null;
  gtm_container_id?: string | null;
  scheduling_url?: string | null;
  scheduling_provider?: string | null;
}

const GOOGLE_CONVERSION_SURFACES: { key: string; label: string }[] = [
  { key: 'metal_iq', label: 'Metal IQ' },
  { key: 'quote_estimator', label: 'Instant Quote' },
  { key: 'ring_builder', label: 'Ring Builder' },
  { key: 'grillz_builder', label: 'Grillz Builder' },
  { key: 'custom_inquiry', label: 'Custom Inquiry' },
  { key: 'appointment_booking', label: 'Appointment Booking' },
];

const Settings = () => {
  const { user, role } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');

  const clientSettingsSearch = useMemo(() => [
    { id: 'general', label: 'General Settings', description: 'Company info, address, domains', icon: SettingsIcon, category: 'Tab', action: () => setActiveTab('general') },
    { id: 'security', label: 'Security', description: 'Password, two-factor auth', icon: Shield, category: 'Tab', action: () => setActiveTab('security') },
    { id: 'integrations', label: 'Integrations', description: 'Shopify, CRM connections', icon: Globe, category: 'Tab', action: () => setActiveTab('integrations') },
    { id: 'billing', label: 'Billings & AI', description: 'Subscription plan, payment, AI usage', icon: CreditCard, category: 'Tab', action: () => setActiveTab('billing') },
    { id: 'staff', label: 'Staff', description: 'Manage team members', icon: Users, category: 'Tab', action: () => setActiveTab('staff') },
    { id: 'logging', label: 'Activity Logs', description: 'View activity history', icon: ScrollText, category: 'Tab', action: () => setActiveTab('logging') },
    { id: 'notifications', label: 'Notifications', description: 'Email notification preferences', icon: Bell, category: 'Tab', action: () => setActiveTab('notifications') },
    { id: 'profile', label: 'User Profile', description: 'Personal info, avatar, address', icon: UserCircle, category: 'Tab', action: () => setActiveTab('profile') },
    
  ], []);
  usePageSearchRegistration('Settings', clientSettingsSearch);
  
  // Shopify connection state
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState('');
  const [shopifyAccessToken, setShopifyAccessToken] = useState('');
  const [shopifyStorefrontToken, setShopifyStorefrontToken] = useState('');
  const [isShopifyAdminConnected, setIsShopifyAdminConnected] = useState(false);
  const [isShopifyStorefrontConnected, setIsShopifyStorefrontConnected] = useState(false);
  const [isEditingShopify, setIsEditingShopify] = useState(false);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyTestingAdmin, setShopifyTestingAdmin] = useState(false);
  const [shopifyTestingStorefront, setShopifyTestingStorefront] = useState(false);
  const [shopifyTargetUserId, setShopifyTargetUserId] = useState<string | null>(null);
  const [oauthShop, setOauthShop] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);

  // Phone number from user profile
  const [phoneNumber, setPhoneNumber] = useState<string>('');

  // Security/Domain whitelisting state
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [securityLoading, setSecurityLoading] = useState(false);

  const isShopifyConnected = isShopifyAdminConnected || isShopifyStorefrontConnected;

  useEffect(() => {
    if (isImpersonating && !impersonatedClientId) return;
    fetchClientData();
  }, [user, isImpersonating, impersonatedClientId]);

  // Handle OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') {
      toast.success(`Shopify store ${params.get('shop') || ''} connected successfully`);
      window.history.replaceState({}, '', window.location.pathname);
      setActiveTab('integrations');
      let attempts = 0;
      const id = window.setInterval(() => {
        attempts++;
        fetchClientData();
        if (attempts >= 8) window.clearInterval(id);
      }, 2000);
      return () => window.clearInterval(id);
    } else if (params.get('error')) {
      toast.error(`Shopify connection failed: ${params.get('error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Select only non-sensitive columns - exclude encrypted tokens
  const SETTINGS_SAFE_COLUMNS = `
    id, company_name, email, shopify_store_url, address_line1, 
    address_line2, city, state, postal_code, country, allowed_domains, currency, timezone,
    terms_url, privacy_url, meta_pixel_id, meta_capi_access_token,
    google_ads_conversion_id, google_ads_conversion_labels, gtm_container_id,
    scheduling_url, scheduling_provider
  `;

  const fetchClientData = async () => {
    try {
      // user_id comes back with the row so the follow-up lookups can run in parallel.
      const columns = `${SETTINGS_SAFE_COLUMNS}, user_id`;
      const query = isImpersonating
        ? supabase.from("clients").select(columns).eq("id", impersonatedClientId).maybeSingle()
        : supabase.from("clients").select(columns).eq("user_id", user?.id).maybeSingle();

      const { data, error } = await query;
      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        const { user_id: clientUserId, ...clientRow } = data as any;
        setClient(clientRow as unknown as Client);
        // Set allowed domains
        setAllowedDomains((data.allowed_domains as string[] | null) || []);

        // Resolve target user_id (impersonated client's user_id, or own)
        const resolvedUserId: string | null = isImpersonating ? (clientUserId ?? null) : (user?.id ?? null);
        setShopifyTargetUserId(resolvedUserId);

        const hasStore = !!data.shopify_store_url;
        const [profileRes, adminTokenRes, storefrontTokenRes] = await Promise.all([
          clientUserId
            ? supabase.from('user_profiles').select('phone').eq('user_id', clientUserId).maybeSingle()
            : Promise.resolve(null),
          hasStore && resolvedUserId
            ? supabase.rpc('decrypt_shopify_token', { client_user_id: resolvedUserId })
            : Promise.resolve(null),
          hasStore && resolvedUserId
            ? supabase.rpc('decrypt_storefront_token', { client_user_id: resolvedUserId })
            : Promise.resolve(null),
        ]);

        if (clientUserId) setPhoneNumber((profileRes as any)?.data?.phone || '');

        // Set Shopify state - connection status is determined by store URL presence
        if (hasStore) {
          setShopifyStoreUrl(data.shopify_store_url);
          if (resolvedUserId) {
            const adminTokenExists = (adminTokenRes as any)?.data;
            setIsShopifyAdminConnected(!!adminTokenExists);
            setShopifyAccessToken(adminTokenExists ? '••••••••••••••••' : '');

            const storefrontTokenExists = (storefrontTokenRes as any)?.data;
            setIsShopifyStorefrontConnected(!!storefrontTokenExists);
            setShopifyStorefrontToken(storefrontTokenExists ? '••••••••••••••••' : '');
          }
        } else {
          setShopifyStoreUrl('');
          setIsShopifyAdminConnected(false);
          setIsShopifyStorefrontConnected(false);
          setShopifyAccessToken('');
          setShopifyStorefrontToken('');
        }
      } else {
        setClient(null);
      }
    } catch (error: any) {
      toast.error("Failed to load settings");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const updateClient = async (updates: Partial<Client>) => {
    try {
      const query = supabase.from("clients").update(updates);
      const { error } = isImpersonating
        ? await query.eq("id", impersonatedClientId)
        : await query.eq("user_id", user?.id);

      if (error) throw error;
      toast.success("Settings updated successfully");
      fetchClientData();
    } catch (error: any) {
      toast.error("Failed to update settings");
      console.error(error);
    }
  };

  const handleShopifyTestConnection = async (tokenType: 'admin' | 'storefront') => {
    const token = tokenType === 'admin' ? shopifyAccessToken : shopifyStorefrontToken;
    if (!shopifyStoreUrl || !token || token.includes('•')) {
      toast.error(`Please enter both Store URL and ${tokenType === 'admin' ? 'Admin API' : 'Storefront API'} Access Token`);
      return;
    }

    if (tokenType === 'admin') {
      setShopifyTestingAdmin(true);
    } else {
      setShopifyTestingStorefront(true);
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
            storeUrl: shopifyStoreUrl,
            accessToken: token,
            tokenType,
          }),
        }
      );

      const result = await response.json();
      if (result.success) {
        toast.success(`${tokenType === 'admin' ? 'Admin API' : 'Storefront API'} Connection Successful! Connected to ${result.shop.name}`);
      } else {
        toast.error(result.error || 'Unable to connect to store');
      }
    } catch (error) {
      toast.error('Failed to test connection. Please try again.');
    } finally {
      setShopifyTestingAdmin(false);
      setShopifyTestingStorefront(false);
    }
  };

  const handleShopifyConnect = async () => {
    if (!shopifyStoreUrl) {
      toast.error('Please enter Store URL');
      return;
    }

    const hasNewAdminToken = shopifyAccessToken && !shopifyAccessToken.includes('•');
    const hasNewStorefrontToken = shopifyStorefrontToken && !shopifyStorefrontToken.includes('•');
    const hasExistingAdminToken = shopifyAccessToken.includes('•');
    const hasExistingStorefrontToken = shopifyStorefrontToken.includes('•');

    if (!hasNewAdminToken && !hasNewStorefrontToken && !hasExistingAdminToken && !hasExistingStorefrontToken) {
      toast.error('Please enter at least one API Access Token');
      return;
    }

    const targetClientId = isImpersonating ? impersonatedClientId : client?.id;
    if (!targetClientId || !shopifyTargetUserId) {
      toast.error('Account not loaded yet, please refresh and retry');
      return;
    }

    setShopifyLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('clients')
        .update({ shopify_store_url: shopifyStoreUrl })
        .eq('id', targetClientId);

      if (updateError) throw updateError;

      if (hasNewAdminToken) {
        await encryptShopifyToken(shopifyTargetUserId, shopifyAccessToken);
        setIsShopifyAdminConnected(true);

        // Auto-register webhook only when not impersonating (uses caller's auth)
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
              }
            );

            const webhookResult = await webhookResponse.json();
            if (webhookResult.success) {
              console.log('Webhook registered successfully:', webhookResult.webhook_id);
            } else {
              console.warn('Webhook registration warning:', webhookResult.error);
            }
          } catch (webhookError) {
            console.warn('Failed to auto-register webhook:', webhookError);
          }
        }
      }

      if (hasNewStorefrontToken) {
        await encryptStorefrontToken(shopifyTargetUserId, shopifyStorefrontToken);
        setIsShopifyStorefrontConnected(true);
      }

      setIsEditingShopify(false);
      if (hasNewAdminToken) setShopifyAccessToken('••••••••••••••••');
      if (hasNewStorefrontToken) setShopifyStorefrontToken('••••••••••••••••');

      toast.success(isEditingShopify ? 'Shopify settings updated!' : 'Shopify store connected!');
      fetchClientData();
    } catch (error) {
      console.error('Connection error:', error);
      toast.error('Failed to save credentials. Please try again.');
    } finally {
      setShopifyLoading(false);
    }
  };

  const handleOAuthConnect = async () => {
    if (!oauthShop.trim()) {
      toast.error('Enter your Shopify domain (e.g. your-store.myshopify.com)');
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
        }
      );
      const result = await resp.json();
      if (!resp.ok || !result.install_url) throw new Error(result.error || 'Failed to start install');
      window.location.href = result.install_url;
    } catch (e: any) {
      toast.error(e.message || 'Could not start install');
      setOauthLoading(false);
    }
  };

  const handleShopifyDisconnect = async () => {
    const targetClientId = isImpersonating ? impersonatedClientId : client?.id;
    if (!targetClientId) return;
    const { error } = await supabase
      .from('clients')
      .update({
        shopify_store_url: null,
        shopify_access_token_encrypted: null,
        shopify_admin_access_token_encrypted: null,
        shopify_storefront_token_encrypted: null,
        shopify_webhook_secret_encrypted: null,
      })
      .eq('id', targetClientId);

    if (error) {
      console.error('Failed to disconnect Shopify:', error);
      toast.error('Failed to disconnect Shopify store. Please try again.');
      return;
    }

    setIsShopifyAdminConnected(false);
    setIsShopifyStorefrontConnected(false);
    setShopifyStoreUrl('');
    setShopifyAccessToken('');
    setShopifyStorefrontToken('');
    toast.success('Shopify store disconnected');
    fetchClientData();
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <Skeleton className="h-7 sm:h-8 w-32 sm:w-48" />
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <Skeleton className="h-5 sm:h-6 w-24 sm:w-32" />
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="space-y-3 sm:space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 sm:h-12" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Settings</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Manage your account and integrations
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-px">
          <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="general" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">General</TabsTrigger>
            <TabsTrigger value="security" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Security</TabsTrigger>
            <TabsTrigger value="integrations" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              <span className="hidden sm:inline">Integrations</span>
              <span className="sm:hidden">Integrate</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Billings & AI</TabsTrigger>
            {role !== 'staff' && <TabsTrigger value="staff" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Staff</TabsTrigger>}
            {role !== 'staff' && <TabsTrigger value="logging" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Logs</TabsTrigger>}
            <TabsTrigger value="notifications" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              <span className="hidden sm:inline">Notifications</span>
              <span className="sm:hidden">Notifs</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">
              Profile
            </TabsTrigger>
          </TabsList>
        </div>

        {/* General Tab - Updated with new fields */}
        <TabsContent value="general" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl">Company Information</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Update your business details and contact information
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="company_name" className="text-xs sm:text-sm">Company Name</Label>
                  <Input
                    id="company_name"
                    className="h-9 sm:h-10 text-sm"
                    defaultValue={client?.company_name}
                    onBlur={(e) => updateClient({ company_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs sm:text-sm">Contact Email</Label>
                  <Input
                    id="email"
                    type="email"
                    className="h-9 sm:h-10 text-sm"
                    defaultValue={client?.email}
                    onBlur={(e) => updateClient({ email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs sm:text-sm">Phone Number</Label>
                  <Input
                    id="phone"
                    className="h-9 sm:h-10 text-sm opacity-60"
                    value={phoneNumber || 'Not set'}
                    disabled
                  />
                   <p className="text-xs text-muted-foreground">Update from your Profile page</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency" className="text-xs sm:text-sm">Currency</Label>
                  <Select
                    value={client?.currency || 'USD'}
                    onValueChange={(value) => updateClient({ currency: value } as any)}
                  >
                    <SelectTrigger id="currency" className="h-9 sm:h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Used for all price displays across forms, widgets, and catalog</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone" className="text-xs sm:text-sm">Timezone</Label>
                  <Select
                    value={client?.timezone || 'America/New_York'}
                    onValueChange={(value) => updateClient({ timezone: value } as any)}
                  >
                    <SelectTrigger id="timezone" className="h-9 sm:h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                      <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                      <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                      <SelectItem value="America/Anchorage">Alaska (AKT)</SelectItem>
                      <SelectItem value="Pacific/Honolulu">Hawaii (HT)</SelectItem>
                      <SelectItem value="America/Toronto">Toronto (ET)</SelectItem>
                      <SelectItem value="America/Vancouver">Vancouver (PT)</SelectItem>
                      <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                      <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                      <SelectItem value="Europe/Berlin">Berlin (CET)</SelectItem>
                      <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
                      <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                      <SelectItem value="Asia/Singapore">Singapore (SGT)</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                      <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
                      <SelectItem value="Australia/Melbourne">Melbourne (AEST)</SelectItem>
                      <SelectItem value="Pacific/Auckland">Auckland (NZST)</SelectItem>
                      <SelectItem value="Africa/Johannesburg">Johannesburg (SAST)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Used for dashboard times and date displays</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-xs sm:text-sm">Business Address</Label>
                <Textarea
                  id="address"
                  className="text-sm min-h-[80px] opacity-60"
                  value={[
                    client?.address_line1,
                    [client?.city, client?.state, client?.postal_code].filter(Boolean).join(', '),
                    client?.country
                  ].filter(Boolean).join('\n') || 'Not set'}
                  disabled
                />
                <p className="text-xs text-muted-foreground">Update from your Profile page</p>
              </div>
            </CardContent>
          </Card>

          {/* Legal Pages Card */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                Legal Pages
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Add your Terms & Conditions and Privacy Policy URLs. These will be referenced across your customer-facing pages.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="terms_url" className="text-xs sm:text-sm">Terms & Conditions URL</Label>
                  <Input
                    id="terms_url"
                    type="url"
                    placeholder="https://yoursite.com/terms"
                    className="h-9 sm:h-10 text-sm"
                    defaultValue={client?.terms_url || ''}
                    onBlur={(e) => updateClient({ terms_url: e.target.value || null } as any)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="privacy_url" className="text-xs sm:text-sm">Privacy Policy URL</Label>
                  <Input
                    id="privacy_url"
                    type="url"
                    placeholder="https://yoursite.com/privacy"
                    className="h-9 sm:h-10 text-sm"
                    defaultValue={client?.privacy_url || ''}
                    onBlur={(e) => updateClient({ privacy_url: e.target.value || null } as any)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <CustomerEmailBrandingCard />
        </TabsContent>

        {/* Integrations Tab - Enhanced with Shopify connection */}
        <TabsContent value="integrations" className="space-y-4 sm:space-y-6">
          {/* Availability Schedule (used by Ring OS + Metal IQ Book Appointment) */}
          <AvailabilityScheduleCard clientId={client?.id} />

          {/* CRM MVMNT direct sync (DTT only — card hides itself for other clients) */}
          <GoHighLevelIntegrationCard clientId={client?.id} />



          {/* External scheduling (Calendly / Cal.com / custom) */}
          <SchedulingIntegrationCard
            value={client?.scheduling_url || null}
            provider={(client?.scheduling_provider as any) || null}
            onSave={async (url, provider) => {
              await updateClient({ scheduling_url: url, scheduling_provider: provider } as any);
            }}
          />

          {/* Shopify Integration Card */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <ShoppingBag className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Shopify Integration</CardTitle>
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      <div className="flex items-center gap-1.5">
                        {isShopifyAdminConnected ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className={`text-xs ${isShopifyAdminConnected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                          Catalog
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isShopifyStorefrontConnected ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-amber-500" />
                        )}
                        <span className={`text-xs ${isShopifyStorefrontConnected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          Checkout
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                {isShopifyConnected && !isEditingShopify && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsEditingShopify(true)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleShopifyDisconnect}>
                      Disconnect
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              {!isShopifyConnected || isEditingShopify ? (
                <div className="space-y-4">
                  {!isEditingShopify && (
                    <div className="rounded-lg border border-border p-4 space-y-3 bg-primary/5">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        <p className="font-semibold text-sm">Quick Connect (Recommended)</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Enter your Shopify domain and approve the install. Tokens are generated and stored automatically — no copy/paste needed.
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
                      {isEditingShopify 
                        ? 'Update your Shopify connection settings below.' 
                        : 'Or paste API credentials manually (advanced).'}
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="shopify-store-url">Shopify Store URL</Label>
                      <Input
                        id="shopify-store-url"
                        placeholder="your-store.myshopify.com"
                        value={shopifyStoreUrl}
                        onChange={(e) => setShopifyStoreUrl(e.target.value)}
                        autoComplete="off"
                      />
                    </div>

                    {/* Admin API Token */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="shopify-admin-token">Admin API Access Token</Label>
                        {isShopifyAdminConnected && <Badge variant="secondary" className="text-xs">Connected</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          id="shopify-admin-token"
                          type={shopifyAccessToken.includes('•') ? 'text' : 'password'}
                          placeholder={isEditingShopify ? 'Leave masked to keep existing token' : 'shpat_...'}
                          value={shopifyAccessToken}
                          onChange={(e) => setShopifyAccessToken(e.target.value)}
                          autoComplete="new-password"
                          className="flex-1"
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleShopifyTestConnection('admin')} 
                          disabled={shopifyTestingAdmin || !shopifyAccessToken || shopifyAccessToken.includes('•')}
                        >
                          {shopifyTestingAdmin ? 'Testing...' : 'Test'}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Used for catalog sync
                      </p>
                    </div>

                    {/* Storefront API Token */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="shopify-storefront-token">Storefront API Access Token</Label>
                        {isShopifyStorefrontConnected && <Badge variant="secondary" className="text-xs">Connected</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          id="shopify-storefront-token"
                          type={shopifyStorefrontToken.includes('•') ? 'text' : 'password'}
                          placeholder={isEditingShopify ? 'Leave masked to keep existing token' : 'Your storefront access token...'}
                          value={shopifyStorefrontToken}
                          onChange={(e) => setShopifyStorefrontToken(e.target.value)}
                          autoComplete="new-password"
                          className="flex-1"
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleShopifyTestConnection('storefront')} 
                          disabled={shopifyTestingStorefront || !shopifyStorefrontToken || shopifyStorefrontToken.includes('•')}
                        >
                          {shopifyTestingStorefront ? 'Testing...' : 'Test'}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <strong>Required for checkout.</strong> Used for "Add to Cart".
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {isEditingShopify ? (
                        <>
                          <Button 
                            variant="outline" 
                            className="flex-1"
                            onClick={() => {
                              setIsEditingShopify(false);
                              fetchClientData();
                            }}
                          >
                            Cancel
                          </Button>
                          <Button 
                            className="flex-1" 
                            onClick={handleShopifyConnect} 
                            disabled={shopifyLoading}
                          >
                            {shopifyLoading ? 'Saving...' : 'Save Changes'}
                          </Button>
                        </>
                      ) : (
                        <Button 
                          className="w-full" 
                          onClick={handleShopifyConnect} 
                          disabled={shopifyLoading}
                        >
                          {shopifyLoading ? 'Connecting...' : 'Connect Store'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Store URL</p>
                      <p className="text-sm text-muted-foreground">{shopifyStoreUrl}</p>
                    </div>
                    <Badge variant="secondary">Active</Badge>
                  </div>

                  {/* Webhook URL - unique per client */}
                  {client?.id && (
                    <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">Webhook URL</p>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1.5">
                        Use this unique URL in your Shopify Admin → Settings → Notifications → Webhooks to receive order data automatically.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs flex-1 break-all select-all bg-background p-2 rounded border">
                          {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-order-webhook?client_id=${client.id}`}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-order-webhook?client_id=${client.id}`
                            );
                            toast.success('Webhook URL copied!');
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Go to your Catalog page and click "Push to Shopify" to sync your products.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Other Integrations */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl">Other Integrations</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Connect additional platforms
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-3 sm:space-y-4">
              {/* WordPress Integration */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Globe className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base">WordPress</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Embed configurator on WordPress sites
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs w-fit">Coming Soon</Badge>
              </div>

              {/* WooCommerce Integration */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Store className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base">WooCommerce</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Connect your WooCommerce store
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs w-fit">Coming Soon</Badge>
              </div>

              <Separator />

              {/* CRM Integration */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Database className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base">CRM MVMNT</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Sync leads with your CRM automatically
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full sm:w-auto">Connect</Button>
              </div>
            </CardContent>
          </Card>

          {/* Tracking & Pixels Card */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Tracking & Pixels</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Add your Meta (Facebook) Pixel to track ad conversions from your embedded forms and widget
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="metaPixelId" className="text-sm font-medium">Meta Pixel ID</Label>
                <p className="text-xs text-muted-foreground">
                  Find your Pixel ID in <span className="font-medium">Meta Business Suite → Events Manager → Data Sources</span>. It's a 15-16 digit number.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="metaPixelId"
                    value={client?.meta_pixel_id || ''}
                    onChange={(e) => {
                      if (client) {
                        setClient({ ...client, meta_pixel_id: e.target.value || null });
                      }
                    }}
                    placeholder="e.g. 123456789012345"
                    className="flex-1 font-mono text-sm"
                    maxLength={20}
                  />
                  <Button
                    size="sm"
                    onClick={() => updateClient({ meta_pixel_id: client?.meta_pixel_id || null } as any)}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="metaCapiToken" className="text-sm font-medium">Conversions API Access Token</Label>
                <p className="text-xs text-muted-foreground">
                  Required for server-side <span className="font-medium">Purchase</span> event tracking. Generate in <span className="font-medium">Meta Events Manager → Settings → Conversions API</span>.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="metaCapiToken"
                    type="password"
                    value={client?.meta_capi_access_token || ''}
                    onChange={(e) => {
                      if (client) {
                        setClient({ ...client, meta_capi_access_token: e.target.value || null });
                      }
                    }}
                    placeholder="EAAxxxxxxx..."
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      // Pasted tokens often carry line breaks/spaces, which Meta rejects.
                      const cleaned = (client?.meta_capi_access_token || '').replace(/\s+/g, '') || null;
                      if (client) setClient({ ...client, meta_capi_access_token: cleaned });
                      updateClient({ meta_capi_access_token: cleaned } as any);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <Alert>
                <AlertDescription className="text-xs">
                  When configured, a <span className="font-medium">PageView</span> event fires on embed load, <span className="font-medium">ViewContent</span> when forms load, <span className="font-medium">Contact</span>/<span className="font-medium">InitiateCheckout</span> on engagement, <span className="font-medium">Lead</span> on form submission, and <span className="font-medium">Purchase</span> (server-side) when Shopify orders sync — enabling full-funnel Meta Ads conversion tracking.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Google Ads Card */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Google Ads</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Track conversions from your widgets in Google Ads, with Enhanced Conversions
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="googleAdsId" className="text-sm font-medium">Google Ads Conversion ID</Label>
                <p className="text-xs text-muted-foreground">
                  Find it in <span className="font-medium">Google Ads → Goals → Conversions → your conversion action → Tag setup</span>. Starts with <span className="font-mono">AW-</span>.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="googleAdsId"
                    value={client?.google_ads_conversion_id || ''}
                    onChange={(e) => client && setClient({ ...client, google_ads_conversion_id: e.target.value || null })}
                    placeholder="e.g. AW-123456789"
                    className="flex-1 font-mono text-sm"
                    maxLength={30}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const raw = (client?.google_ads_conversion_id || '').trim();
                      if (raw && !/^AW-[\w-]+$/i.test(raw)) {
                        toast.error('Conversion ID should look like AW-123456789');
                        return;
                      }
                      const value = raw ? raw.toUpperCase() : null;
                      if (client) setClient({ ...client, google_ads_conversion_id: value });
                      updateClient({ google_ads_conversion_id: value } as any);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Conversion labels per widget</Label>
                <p className="text-xs text-muted-foreground">
                  Paste the conversion label from each Google Ads conversion action (the part after the slash in <span className="font-mono">AW-123/AbC-D_efGh</span>). Leave blank to skip that widget.
                </p>
                <div className="space-y-2">
                  {GOOGLE_CONVERSION_SURFACES.map(({ key, label }) => (
                    <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-xs sm:w-44 shrink-0">{label}</span>
                      <Input
                        value={(client?.google_ads_conversion_labels as Record<string, string> | undefined)?.[key] || ''}
                        onChange={(e) => {
                          if (!client) return;
                          const labels = { ...(client.google_ads_conversion_labels || {}) } as Record<string, string>;
                          if (e.target.value) labels[key] = e.target.value; else delete labels[key];
                          setClient({ ...client, google_ads_conversion_labels: labels });
                        }}
                        placeholder="AbC-D_efGh"
                        className="flex-1 font-mono text-sm"
                        maxLength={60}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const raw = (client?.google_ads_conversion_labels || {}) as Record<string, string>;
                    const cleaned: Record<string, string> = {};
                    Object.entries(raw).forEach(([k, v]) => {
                      const trimmed = (v || '').trim();
                      if (trimmed) cleaned[k] = trimmed;
                    });
                    if (client) setClient({ ...client, google_ads_conversion_labels: cleaned });
                    updateClient({ google_ads_conversion_labels: cleaned } as any);
                  }}
                >
                  Save labels
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gtmId" className="text-sm font-medium">Google Tag Manager Container ID (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  If you prefer managing tags yourself, add your container ID. Every submission pushes a <span className="font-mono">jewlx_lead</span> event to the dataLayer of the page the widget sits on, so your own tag can fire there.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="gtmId"
                    value={client?.gtm_container_id || ''}
                    onChange={(e) => client && setClient({ ...client, gtm_container_id: e.target.value || null })}
                    placeholder="e.g. GTM-XXXXXXX"
                    className="flex-1 font-mono text-sm"
                    maxLength={20}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const normalized = normalizeGtmContainerId(client?.gtm_container_id);
                      if (client?.gtm_container_id && !normalized) {
                        toast.error('Container ID should look like GTM-XXXXXXX');
                        return;
                      }
                      if (client) setClient({ ...client, gtm_container_id: normalized });
                      updateClient({ gtm_container_id: normalized } as any);
                    }}
                  >
                    Save
                  </Button>
                </div>
                {client?.gtm_container_id && !normalizeGtmContainerId(client.gtm_container_id) && (
                  <p className="text-xs text-destructive">Doesn't look like a container ID — it should be GTM- followed by 5-12 letters or numbers.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  After changing this, re-copy your widget embed code so the lead event reaches your website's tag manager.
                </p>
              </div>

              <Alert>
                <AlertDescription className="text-xs">
                  For best match rates, enable <span className="font-medium">Enhanced conversions for web</span> on each Google Ads conversion action (Google tag method). Widgets send hashed email and phone with every conversion. Ad signals default to denied for EU/UK visitors under Consent Mode v2.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4 sm:space-y-6">
          <BillingTabContent />
        </TabsContent>

        {/* Security Tab - Domain Whitelisting */}
        <TabsContent value="security" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Domain Whitelisting</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Only allow your embed to load on these domains
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Add domains where your ring configurator embed is allowed to run. Leave empty to allow all domains.
              </p>
              
              <div className="flex gap-2">
                <Input 
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="e.g., mystore.myshopify.com"
                  className="flex-1 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newDomain.trim()) {
                      e.preventDefault();
                      if (!allowedDomains.includes(newDomain.trim())) {
                        setAllowedDomains([...allowedDomains, newDomain.trim()]);
                      }
                      setNewDomain('');
                    }
                  }}
                />
                <Button 
                  onClick={() => {
                    if (newDomain.trim() && !allowedDomains.includes(newDomain.trim())) {
                      setAllowedDomains([...allowedDomains, newDomain.trim()]);
                      setNewDomain('');
                    }
                  }}
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {allowedDomains.length === 0 ? (
                  <p className="text-xs sm:text-sm text-muted-foreground italic">No domains configured - embed will load on any domain</p>
                ) : (
                  allowedDomains.map((domain, index) => (
                    <div key={index} className="flex items-center justify-between gap-2 bg-muted/50 px-2 sm:px-3 py-2 rounded-lg">
                      <span className="text-xs sm:text-sm font-mono truncate">{domain}</span>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="shrink-0 h-7 w-7 p-0"
                        onClick={() => setAllowedDomains(allowedDomains.filter((_, i) => i !== index))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <Button 
                onClick={async () => {
                  setSecurityLoading(true);
                  const clientId = isImpersonating ? impersonatedClientId : client?.id;
                  if (!clientId) {
                    setSecurityLoading(false);
                    return;
                  }
                  
                  const { error } = await supabase
                    .from('clients')
                    .update({ allowed_domains: allowedDomains })
                    .eq('id', clientId);
                    
                  setSecurityLoading(false);
                  if (error) {
                    toast.error('Failed to save domain settings');
                  } else {
                    toast.success('Domain settings saved');
                  }
                }} 
                className="w-full"
                disabled={securityLoading}
              >
                {securityLoading ? 'Saving...' : 'Save Domain Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {role !== 'staff' && (
          <TabsContent value="staff" className="space-y-4 sm:space-y-6">
            <StaffTabContent />
          </TabsContent>
        )}

        {role !== 'staff' && (
          <TabsContent value="logging" className="space-y-4 sm:space-y-6">
            <LoggingTabContent />
          </TabsContent>
        )}

        <TabsContent value="notifications" className="space-y-4 sm:space-y-6">
          <NotificationPreferencesTab />
        </TabsContent>

        <TabsContent value="profile" className="space-y-4 sm:space-y-6">
          <ProfileTabContent />
        </TabsContent>


      </Tabs>
    </div>
  );
};

export default Settings;
