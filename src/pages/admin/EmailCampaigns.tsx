import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LeadsTab } from '@/components/admin/email-campaigns/LeadsTab';
import { TemplatesTab } from '@/components/admin/email-campaigns/TemplatesTab';
import { CampaignsTab } from '@/components/admin/email-campaigns/CampaignsTab';
import { ReportsTab } from '@/components/admin/email-campaigns/ReportsTab';
import { useAdminAccess } from '@/hooks/useAdminAccess';

export default function EmailCampaigns() {
  const { readOnly } = useAdminAccess();
  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Email Campaigns</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload interested leads, build templates and send campaigns in paced batches from the marketing address.
          {readOnly && ' You have view-only access.'}
        </p>
      </div>
      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads & Lists</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="leads"><LeadsTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
