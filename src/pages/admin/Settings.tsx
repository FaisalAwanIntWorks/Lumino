import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Settings as SettingsIcon, Building, Users, Mail, CreditCard, Shield, Puzzle, UserCog, ScrollText, Key, Sparkles } from 'lucide-react';
import { AdminLoggingTabContent } from '@/components/admin/settings/AdminLoggingTabContent';
import { AdminStaffTabContent } from '@/components/admin/settings/AdminStaffTabContent';
import { EmailTemplatesTabContent } from '@/components/admin/settings/EmailTemplatesTabContent';
import { ClientFeatureMatrix } from '@/components/admin/ClientFeatureMatrix';
import { ApiKeysTabContent } from '@/components/admin/settings/ApiKeysTabContent';
import { AIPromptsTabContent } from '@/components/admin/settings/AIPromptsTabContent';
import { usePageSearchRegistration } from '@/hooks/usePageSearchRegistration';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('agency');

  const settingsSearchItems = useMemo(() => [
    { id: 'agency', label: 'Agency Information', description: 'Agency name, contact details', icon: Building, category: 'Tab', action: () => setActiveTab('agency') },
    { id: 'client-access', label: 'Client Access', description: 'Feature matrix by product area', icon: Users, category: 'Tab', action: () => setActiveTab('client-access') },
    { id: 'email', label: 'Email & SMS', description: 'Email provider, SMS settings', icon: Mail, category: 'Tab', action: () => setActiveTab('email') },
    { id: 'email-templates', label: 'Email Templates', description: 'Preview all email templates', icon: Mail, category: 'Tab', action: () => setActiveTab('email-templates') },
    { id: 'payment', label: 'Payments', description: 'Payment gateway configuration', icon: CreditCard, category: 'Tab', action: () => setActiveTab('payment') },
    { id: 'security', label: 'Security', description: 'Security settings', icon: Shield, category: 'Tab', action: () => setActiveTab('security') },
    { id: 'integrations', label: 'Integrations', description: 'Platform connectors status', icon: Puzzle, category: 'Tab', action: () => setActiveTab('integrations') },
    { id: 'admin-staff', label: 'Admin Staff', description: 'Manage admin team members', icon: UserCog, category: 'Tab', action: () => setActiveTab('admin-staff') },
    { id: 'api-keys', label: 'API Keys', description: 'Manage client API keys', icon: Key, category: 'Tab', action: () => setActiveTab('api-keys') },
    { id: 'ai-prompts', label: 'AI Prompts', description: 'Edit AI image generation prompts', icon: Sparkles, category: 'Tab', action: () => setActiveTab('ai-prompts') },
    { id: 'logging', label: 'Activity Logs', description: 'View admin activity logs', icon: ScrollText, category: 'Tab', action: () => setActiveTab('logging') },
  ], []);
  usePageSearchRegistration('Settings', settingsSearchItems);

  const handleSave = () => {
    toast.success('Settings saved successfully');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Admin Settings</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Configure platform settings and integrations</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-px">
          <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="agency" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Agency</TabsTrigger>
            <TabsTrigger value="client-access" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Client Access</TabsTrigger>
            <TabsTrigger value="email" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Email & SMS</TabsTrigger>
            <TabsTrigger value="email-templates" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Email Templates</TabsTrigger>
            <TabsTrigger value="payment" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Payments</TabsTrigger>
            <TabsTrigger value="security" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Security</TabsTrigger>
            <TabsTrigger value="integrations" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Integrations</TabsTrigger>
            <TabsTrigger value="admin-staff" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Admin Staff</TabsTrigger>
            <TabsTrigger value="api-keys" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">API Keys</TabsTrigger>
            <TabsTrigger value="ai-prompts" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">AI Prompts</TabsTrigger>
            <TabsTrigger value="logging" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Activity Logs</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="agency">
          <div className="space-y-4 sm:space-y-6">
            <Card className="p-4 sm:p-6">
              <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">Agency Information</h3>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <Label htmlFor="agency-name" className="text-sm">Agency Name</Label>
                  <Input id="agency-name" defaultValue="Aurezo Agency" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="agency-email" className="text-sm">Contact Email</Label>
                  <Input id="agency-email" type="email" defaultValue="" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="agency-phone" className="text-sm">Phone Number</Label>
                  <Input id="agency-phone" type="tel" defaultValue="+1 (555) 123-4567" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="agency-address" className="text-sm">Business Address</Label>
                  <Textarea id="agency-address" rows={3} defaultValue="123 Jewelry Lane, Diamond District, NY 10001" className="mt-1" />
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="client-access">
          <Card className="p-4 sm:p-6">
            <ClientFeatureMatrix />
          </Card>
        </TabsContent>




        <TabsContent value="email">
          <div className="space-y-4 sm:space-y-6">
            <Card className="p-4 sm:p-6">
              <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">Email Configuration (Resend)</h3>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <Label htmlFor="email-provider" className="text-sm">Email Provider</Label>
                  <Input id="email-provider" defaultValue="Resend" disabled className="mt-1 bg-muted" />
                </div>
                <div>
                  <Label htmlFor="resend-api-key" className="text-sm">Resend API Key</Label>
                  <Input id="resend-api-key" type="password" defaultValue="••••••••••••••••" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="resend-domain" className="text-sm">Verified Domain</Label>
                  <Input id="resend-domain" defaultValue="resend.dev" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="from-email" className="text-sm">From Email Address</Label>
                  <Input id="from-email" type="email" defaultValue="onboarding@resend.dev" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="reply-to" className="text-sm">Reply-To Address</Label>
                  <Input id="reply-to" type="email" defaultValue="" className="mt-1" />
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-6">
              <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">SMS Configuration (Optional)</h3>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <Label htmlFor="twilio-sid" className="text-sm">Twilio Account SID</Label>
                  <Input id="twilio-sid" placeholder="ACxxxxxxxxxxxxxxxxx" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="twilio-token" className="text-sm">Twilio Auth Token</Label>
                  <Input id="twilio-token" type="password" placeholder="••••••••" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="twilio-phone" className="text-sm">Twilio Phone Number</Label>
                  <Input id="twilio-phone" type="tel" placeholder="+1 (555) 000-0000" className="mt-1" />
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payment">
          <div className="space-y-4 sm:space-y-6">
            <Card className="p-4 sm:p-6">
              <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">Stripe Integration</h3>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                  <div>
                    <p className="text-sm font-medium">Stripe Connected</p>
                    <p className="text-xs text-muted-foreground">API keys are securely stored as encrypted backend secrets. They are never exposed to the frontend.</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">🔒 Security:</span> Stripe secret keys, webhook secrets, and other sensitive credentials are managed exclusively through the backend secrets manager and are only accessible by server-side edge functions. To rotate keys, contact your platform administrator.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>


        <TabsContent value="security">
          <div className="space-y-4 sm:space-y-6">
            <Card className="p-4 sm:p-6">
              <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">Security Overview</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Row Level Security</p>
                    <p className="text-xs text-muted-foreground">Enforced on all user-facing tables</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Encrypted Secrets</p>
                    <p className="text-xs text-muted-foreground">Shopify tokens, webhook secrets, and API keys encrypted at rest</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Account Lockout Protection</p>
                    <p className="text-xs text-muted-foreground">Automatic lockout after failed login attempts</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Impersonation Auditing</p>
                    <p className="text-xs text-muted-foreground">All admin impersonation sessions are logged with timestamps</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">AI Quota Gating</p>
                    <p className="text-xs text-muted-foreground">Per-client rate limits and wallet-based usage enforcement</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Advanced security settings (2FA enforcement, IP whitelisting, session timeout) require backend configuration changes. Contact your platform administrator for modifications.
                </p>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="space-y-4 sm:space-y-6">
            <Card className="p-4 sm:p-6">
              <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">Platform Connectors</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Stripe</p>
                    <p className="text-xs text-muted-foreground">Payment processing — Connected</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Resend</p>
                    <p className="text-xs text-muted-foreground">Email delivery — Connected</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Unkey</p>
                    <p className="text-xs text-muted-foreground">API key management — Connected</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connector credentials are managed securely through backend secrets. Contact your administrator to rotate keys.
                </p>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="admin-staff">
          <AdminStaffTabContent />
        </TabsContent>

        <TabsContent value="email-templates">
          <EmailTemplatesTabContent />
        </TabsContent>

        <TabsContent value="logging">
          <AdminLoggingTabContent />
        </TabsContent>

        <TabsContent value="api-keys">
          <ApiKeysTabContent />
        </TabsContent>

        <TabsContent value="ai-prompts">
          <AIPromptsTabContent />
        </TabsContent>
      </Tabs>

    </div>
  );
}
