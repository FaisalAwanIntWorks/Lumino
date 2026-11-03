import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusTagSelector } from '@/components/status/StatusTagSelector';
import { LeadFollowUpSection } from '@/components/leads/LeadFollowUpSection';
import { LinkedBookingsPanel } from '@/components/leads/LinkedBookingsPanel';
import { ActivityTimelineItem } from './ActivityTimelineItem';
import { ActivityDetailContent } from './ActivityDetailContent';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, User, Calendar, Copy, Check, Pencil, Save, X, ChevronDown
} from 'lucide-react';
import type { CustomerProfile, CustomerActivity } from '@/hooks/useCustomerHub';
import type { StatusTag } from '@/hooks/useClientStatusTags';

interface CustomerDetailViewProps {
  customer: CustomerProfile;
  clientId: string;
  onBack: () => void;
  hasEditAccess: boolean;
  leadStatusTags: StatusTag[];
  getLeadTagColor: (tagName: string) => string;
  addLeadTag: (tagName: string, tagColor: string) => void;
  deleteLeadTag?: (tagId: string) => void;
  onStatusUpdate: () => void;
  widgetLeadImages: string[];
  widgetImageLoading: boolean;
  grillPreviewImages: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }>;
  grillPreviewLoading: boolean;
  enquiryPreviewImages: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }>;
  enquiryPreviewLoading: boolean;
  ringPreviewImages: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }>;
  ringPreviewLoading: boolean;
  currency?: string;
  onSelectActivity?: (activity: CustomerActivity | null) => void;
  defaultExpandActivityId?: string;
}

const INITIAL_VISIBLE = 3;

export function CustomerDetailView({
  customer, clientId, onBack, hasEditAccess,
  leadStatusTags, getLeadTagColor, addLeadTag, deleteLeadTag,
  onStatusUpdate,
  widgetLeadImages, widgetImageLoading,
  grillPreviewImages, grillPreviewLoading,
  enquiryPreviewImages, enquiryPreviewLoading,
  ringPreviewImages, ringPreviewLoading,
  currency,
  onSelectActivity,
  defaultExpandActivityId,
}: CustomerDetailViewProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(customer.overallStatus);
  // Auto-expand most recent activity (or deep-linked one)
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(
    defaultExpandActivityId || customer.activities[0]?.id || null
  );
  const [showAll, setShowAll] = useState(() => {
    if (defaultExpandActivityId) {
      const idx = customer.activities.findIndex(a => a.id === defaultExpandActivityId);
      return idx >= INITIAL_VISIBLE;
    }
    return false;
  });

  // Editable fields
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(customer.name);
  const [editEmail, setEditEmail] = useState(customer.email);
  const [editPhone, setEditPhone] = useState(customer.phone || '');
  const [saving, setSaving] = useState(false);

  const handleCopy = useCallback((value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedField(null), 1500);
  }, []);

  const handleStatusChange = async (newStatus: string) => {
    const leadTables = ['saved_designs', 'grill_form_leads', 'custom_enquiry_leads', 'design_requests', 'diamond_form_leads', 'metal_buying_leads', 'appointment_bookings'];
    const leadActivity = customer.activities.find(a => leadTables.includes(a.sourceTable));
    if (!leadActivity) {
      toast.error('No lead activity found to update');
      return;
    }
    try {
      const { error } = await supabase
        .from(leadActivity.sourceTable as any)
        .update({ follow_up_status: newStatus } as any)
        .eq('id', leadActivity.id);
      if (error) throw error;
      setCurrentStatus(newStatus);
      onStatusUpdate();
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error('Failed to update status');
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const latest = customer.activities[0];
      if (!latest) return;
      
      const updateData: any = {};
      if (editName !== customer.name) updateData.customer_name = editName;
      if (editEmail !== customer.email) updateData.customer_email = editEmail;
      if (editPhone !== (customer.phone || '')) updateData.customer_phone = editPhone || null;
      
      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from(latest.sourceTable as any)
          .update(updateData as any)
          .eq('id', latest.id);
        if (error) throw error;
        toast.success('Customer info updated');
        onStatusUpdate();
      }
      setEditing(false);
    } catch (err) {
      console.error('Failed to update customer info:', err);
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActivity = (activity: CustomerActivity) => {
    if (expandedActivityId === activity.id) {
      setExpandedActivityId(null);
      onSelectActivity?.(null);
    } else {
      setExpandedActivityId(activity.id);
      onSelectActivity?.(activity);
    }
  };

  // All activity IDs for unified notes
  const allLeadIds = customer.activities
    .filter(a => a.type !== 'order')
    .map(a => a.id);
  const primaryLeadId = allLeadIds[0] || customer.activities[0]?.id || '';
  const primarySource = customer.activities[0]?.source || 'widget';

  const visibleActivities = showAll ? customer.activities : customer.activities.slice(0, INITIAL_VISIBLE);
  const hiddenCount = customer.activities.length - INITIAL_VISIBLE;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Customers
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold">{customer.name}</h2>
            {customer.submissionCount > 1 && (
              <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600">
                {customer.submissionCount} submissions
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Customer since {format(new Date(customer.firstSeen), 'MMM d, yyyy')} · Last active {formatDistanceToNow(new Date(customer.lastSeen), { addSuffix: true })}
          </p>
        </div>
        <div onClick={e => e.stopPropagation()}>
          <StatusTagSelector
            currentStatus={currentStatus}
            tags={leadStatusTags}
            onStatusChange={handleStatusChange}
            onCreateTag={addLeadTag}
            onDeleteTag={hasEditAccess ? deleteLeadTag : undefined}
            getTagColor={getLeadTagColor}
            disabled={!hasEditAccess}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer Information */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Customer Information
                </h3>
                {hasEditAccess && !editing && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-7 px-2">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {editing && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="h-7 px-2" disabled={saving}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="default" size="sm" onClick={handleSaveEdit} className="h-7 px-2" disabled={saving}>
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-0 divide-y divide-border">
                {/* Name */}
                <div className="flex items-center justify-between py-2.5 first:pt-0">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Name</span>
                    {editing ? (
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm" />
                    ) : (
                      <span className="text-sm font-medium">{customer.name}</span>
                    )}
                  </div>
                  {!editing && (
                    <button onClick={() => handleCopy(customer.name, 'name')} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                      {copiedField === 'name' ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  )}
                </div>
                {/* Email */}
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Email</span>
                    {editing ? (
                      <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} className="h-7 text-sm" />
                    ) : (
                      <span className="text-sm text-foreground">{customer.email}</span>
                    )}
                  </div>
                  {!editing && (
                    <button onClick={() => handleCopy(customer.email, 'email')} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                      {copiedField === 'email' ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  )}
                </div>
                {/* Phone */}
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Phone</span>
                    {editing ? (
                      <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="h-7 text-sm" placeholder="Phone number" />
                    ) : (
                      <span className="text-sm text-foreground">{customer.phone || '—'}</span>
                    )}
                  </div>
                  {!editing && customer.phone && (
                    <button onClick={() => handleCopy(customer.phone!, 'phone')} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                      {copiedField === 'phone' ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  )}
                </div>
                {/* Activity Summary */}
                <div className="flex items-center gap-2 py-2.5 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Activity</span>
                  {Array.from(customer.activityTypes).map(type => {
                    const count = customer.activities.filter(a => {
                      if (type === 'lead') return a.type === 'lead';
                      if (type === 'booking') return a.type === 'booking';
                      if (type === 'deposit') return a.type === 'order' && ['grillz-builder', 'custom-inquiry'].includes(a.orderSource || '');
                      if (type === 'order') return a.type === 'order' && !['grillz-builder', 'custom-inquiry'].includes(a.orderSource || '');
                      if (type === 'metal_iq') return a.type === 'metal_iq';
                      if (type === 'cad') return a.type === 'cad';
                      return false;
                    }).length;
                    const labels: Record<string, string> = { lead: 'Lead', booking: 'Booking', deposit: 'Deposit', order: 'Order', metal_iq: 'Metal IQ', cad: 'CAD' };
                    return (
                      <Badge key={type} variant="outline" className="text-[10px] px-1.5 py-0">
                        {count}× {labels[type] || type}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Activity Timeline
                <Badge variant="secondary" className="text-[10px] ml-auto">{customer.activities.length} events</Badge>
              </h3>
              <div className="space-y-1">
                {visibleActivities.map(activity => (
                  <ActivityTimelineItem
                    key={activity.id}
                    activity={activity}
                    getStatusColor={getLeadTagColor}
                    isExpanded={expandedActivityId === activity.id}
                    onToggle={() => handleToggleActivity(activity)}
                  >
                    {expandedActivityId === activity.id && (
                      <ActivityDetailContent
                        activity={activity}
                        clientId={clientId}
                        hasEditAccess={hasEditAccess}
                        widgetLeadImages={widgetLeadImages}
                        widgetImageLoading={widgetImageLoading}
                        grillPreviewImages={grillPreviewImages}
                        grillPreviewLoading={grillPreviewLoading}
                        enquiryPreviewImages={enquiryPreviewImages}
                        enquiryPreviewLoading={enquiryPreviewLoading}
                        ringPreviewImages={ringPreviewImages}
                        ringPreviewLoading={ringPreviewLoading}
                        currency={currency}
                      />
                    )}
                  </ActivityTimelineItem>
                ))}
              </div>
              {hiddenCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs text-muted-foreground gap-1"
                  onClick={() => setShowAll(!showAll)}
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
                  {showAll ? 'Show less' : `Show all ${customer.activities.length} events`}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Unified Follow-Up Notes */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <LeadFollowUpSection
                leadId={primaryLeadId}
                leadIds={allLeadIds}
                leadSource={primarySource}
                clientId={clientId}
                currentStatus={currentStatus}
                customerEmail={customer.email}
                customerName={customer.name}
                tags={leadStatusTags}
                getTagColor={getLeadTagColor}
                onCreateTag={hasEditAccess ? addLeadTag : undefined}
                onDeleteTag={hasEditAccess ? deleteLeadTag : undefined}
                onStatusChange={handleStatusChange}
                hasEditAccess={hasEditAccess}
              />
            </CardContent>
          </Card>

          {/* Linked Bookings */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <LinkedBookingsPanel
                clientId={clientId}
                customerEmail={customer.email}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
