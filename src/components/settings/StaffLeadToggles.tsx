import { Switch } from '@/components/ui/switch';
import { Eye, Mail } from 'lucide-react';

interface StaffLeadTogglesProps {
  idPrefix: string;
  showLeads: boolean;
  leadEmails: boolean;
  onShowLeadsChange: (value: boolean) => void;
  onLeadEmailsChange: (value: boolean) => void;
}

/**
 * Two per-staff lead switches stored in `staff_members.permissions`:
 *   - `show_leads`                → Leads & Bookings / Metal IQ Leads visible to this staff member
 *   - `lead_email_notifications`  → staff email added to new-lead notification emails
 */
export function StaffLeadToggles({
  idPrefix,
  showLeads,
  leadEmails,
  onShowLeadsChange,
  onLeadEmailsChange,
}: StaffLeadTogglesProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={`${idPrefix}-show-leads`} className="flex items-start gap-2 cursor-pointer">
          <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
          <span>
            <span className="block text-sm">Show Leads</span>
            <span className="block text-xs text-muted-foreground">Let this staff member see Leads &amp; Bookings.</span>
          </span>
        </label>
        <Switch id={`${idPrefix}-show-leads`} checked={showLeads} onCheckedChange={onShowLeadsChange} />
      </div>
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={`${idPrefix}-lead-emails`} className="flex items-start gap-2 cursor-pointer">
          <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
          <span>
            <span className="block text-sm">Lead Email Notifications</span>
            <span className="block text-xs text-muted-foreground">Send new lead and appointment booking emails to this staff member.</span>
          </span>
        </label>
        <Switch id={`${idPrefix}-lead-emails`} checked={leadEmails} onCheckedChange={onLeadEmailsChange} />
      </div>
    </div>
  );
}
