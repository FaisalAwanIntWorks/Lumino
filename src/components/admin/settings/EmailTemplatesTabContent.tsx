import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Mail, ShieldCheck, UserPlus, Users, Eye, Trash2, Bell, AlertTriangle,
  UserCog, ShoppingBag, ArrowLeft, Ban, KeyRound, LogIn, RotateCcw,
  CalendarCheck, Sparkles, FileText, LifeBuoy, Boxes, RefreshCcw,
  PackageCheck, Send, CreditCard, Diamond, Gem, Inbox,
} from 'lucide-react';

type Template = {
  id: string;
  name: string;
  group: string;
  icon: typeof Mail;
  description: string;
  trigger: string;
  linkExpiry?: string;
  recipient?: string;
  content?: string;
  edgeFunction?: string;
  file: string | null;
};

const GROUPS = [
  'Authentication & Account',
  'Client Onboarding',
  'Lead Notifications',
  'Customer-Facing',
  'CAD Workflow',
  'Orders',
  'Admin (Agency)',
  'Generic',
] as const;

const emailTemplates: Template[] = [
  // ===== Authentication & Account =====
  {
    id: '01', name: 'Password Reset', group: 'Authentication & Account', icon: ShieldCheck,
    description: 'Sent when a user requests to reset their password.',
    trigger: 'Forgot Password form', linkExpiry: '1 hour', recipient: 'Any user',
    edgeFunction: 'request-password-reset',
    file: '/email-templates/01-password-reset.html',
  },
  {
    id: '02', name: 'Email Verification', group: 'Authentication & Account', icon: Mail,
    description: 'Sent during signup to verify the user\'s email address.',
    trigger: 'New client signup', linkExpiry: '24 hours', recipient: 'New clients',
    edgeFunction: 'send-verification-email',
    file: '/email-templates/02-email-verification.html',
  },
  {
    id: 'A03', name: 'Login OTP', group: 'Authentication & Account', icon: LogIn,
    description: 'One-time passcode sent for login verification.',
    trigger: 'User login attempt', linkExpiry: '10 minutes', recipient: 'Any user',
    edgeFunction: 'send-login-otp',
    file: '/email-templates/12-login-otp.html',
  },
  {
    id: 'A04', name: 'Admin Password Reset (Client)', group: 'Authentication & Account', icon: KeyRound,
    description: 'Sent when an admin resets a client\'s password on their behalf.',
    trigger: 'Admin resets client password', linkExpiry: '1 hour', recipient: 'Client user',
    edgeFunction: 'admin-reset-client-password',
    file: '/email-templates/13-admin-password-reset.html',
  },

  // ===== Client Onboarding =====
  {
    id: '03', name: 'Client Welcome', group: 'Client Onboarding', icon: UserPlus,
    description: 'Sent when a new client account is registered on JewlX.',
    trigger: 'Admin creates client', linkExpiry: '48 hours',
    content: 'Account details + features',
    edgeFunction: 'send-client-welcome-email',
    file: '/email-templates/03-client-welcome.html',
  },
  {
    id: '04', name: 'Staff Welcome', group: 'Client Onboarding', icon: Users,
    description: 'Sent when a client adds a new staff member to their account.',
    trigger: 'Client adds staff', linkExpiry: '48 hours', recipient: 'New staff members',
    edgeFunction: 'send-staff-welcome-email',
    file: '/email-templates/04-staff-welcome.html',
  },
  {
    id: '09', name: 'Admin Staff Welcome', group: 'Client Onboarding', icon: UserCog,
    description: 'Sent when an admin creates a new staff member for the admin portal.',
    trigger: 'Admin creates staff', linkExpiry: '48 hours', recipient: 'New admin staff',
    edgeFunction: 'create-admin-staff-user',
    file: '/email-templates/09-admin-staff-welcome.html',
  },

  // ===== Lead Notifications (to Client/Staff) =====
  {
    id: '05', name: 'New Ring Builder Lead', group: 'Lead Notifications', icon: Eye,
    description: 'Sent to clients when a customer saves a ring design on their widget.',
    trigger: 'Customer saves design', recipient: 'Client admins & staff',
    edgeFunction: 'notify-new-lead',
    file: '/email-templates/05-new-lead-notification.html',
  },
  {
    id: 'L02', name: 'New Form Lead', group: 'Lead Notifications', icon: FileText,
    description: 'Sent when a customer submits a custom enquiry / grillz / diamonds form.',
    trigger: 'Form submission', recipient: 'Client admins & staff',
    edgeFunction: 'notify-form-lead',
    file: '/email-templates/14-form-lead-notification.html',
  },
  {
    id: 'L03', name: 'Metal IQ Lead', group: 'Lead Notifications', icon: Gem,
    description: 'Sent when a customer requests a metal buying estimate.',
    trigger: 'Metal IQ form submission', recipient: 'Client admins & staff',
    edgeFunction: 'notify-metal-iq-lead',
    file: '/email-templates/15-metal-iq-lead.html',
  },
  {
    id: '06', name: 'Lead Deleted Alert', group: 'Lead Notifications', icon: Trash2,
    description: 'Sent to clients when a staff member deletes a lead from the system.',
    trigger: 'Staff deletes lead', recipient: 'Client admins',
    edgeFunction: 'notify-lead-deleted',
    file: '/email-templates/06-lead-deleted-notification.html',
  },
  {
    id: 'L05', name: 'Appointment Booking', group: 'Lead Notifications', icon: CalendarCheck,
    description: 'Sent when a customer books an appointment via the widget.',
    trigger: 'Customer books appointment', recipient: 'Client admins & staff',
    edgeFunction: 'notify-appointment-booking',
    file: '/email-templates/16-appointment-booking.html',
  },

  // ===== Customer-Facing =====
  {
    id: 'C01', name: 'Submission Confirmation', group: 'Customer-Facing', icon: Inbox,
    description: 'Confirmation sent to the end customer after submitting a design or enquiry.',
    trigger: 'Customer submits ring/form', recipient: 'End customer',
    edgeFunction: 'notify-customer-confirmation',
    file: '/email-templates/17-customer-confirmation.html',
  },
  {
    id: 'C02', name: 'AI Render Ready (Consolidated)', group: 'Customer-Facing', icon: Sparkles,
    description: 'Consolidated email with all AI-generated renders (5-min sliding window).',
    trigger: 'AI renders complete', recipient: 'End customer',
    edgeFunction: 'send-consolidated-render-email',
    file: '/email-templates/18-ai-render-ready.html',
  },
  {
    id: 'C03', name: 'Single AI Render', group: 'Customer-Facing', icon: Sparkles,
    description: 'Sent for an individual AI render delivery.',
    trigger: 'AI render generated', recipient: 'End customer',
    edgeFunction: 'send-ai-render-email',
    file: '/email-templates/19-single-ai-render.html',
  },
  {
    id: 'C04', name: 'Quote / Estimate', group: 'Customer-Facing', icon: FileText,
    description: 'Sends a formal quote or estimate to the customer.',
    trigger: 'Staff sends quote', recipient: 'End customer',
    edgeFunction: 'send-quote-estimate',
    file: '/email-templates/20-quote-estimate.html',
  },
  {
    id: 'C05', name: 'Support Reply', group: 'Customer-Facing', icon: LifeBuoy,
    description: 'Reply sent from the in-app help / support thread.',
    trigger: 'Staff replies to support thread', recipient: 'End customer',
    edgeFunction: 'send-support-email',
    file: '/email-templates/21-support-reply.html',
  },

  // ===== CAD Workflow =====
  {
    id: 'D01', name: 'CAD Request Created', group: 'CAD Workflow', icon: Boxes,
    description: 'Notification when a new CAD request is created.',
    trigger: 'CAD request submitted', recipient: 'Client & assigned staff',
    edgeFunction: 'notify-cad-request',
    file: '/email-templates/22-cad-request.html',
  },
  {
    id: 'D02', name: 'CAD Resize Request', group: 'CAD Workflow', icon: RefreshCcw,
    description: 'Notification when a customer requests a resize on a CAD.',
    trigger: 'Resize request submitted', recipient: 'Client admins',
    edgeFunction: 'notify-cad-resize',
    file: '/email-templates/23-cad-resize.html',
  },
  {
    id: 'D03', name: 'CAD Delivery', group: 'CAD Workflow', icon: PackageCheck,
    description: 'Sent when a finalized CAD is delivered to the customer.',
    trigger: 'CAD marked delivered', recipient: 'End customer',
    edgeFunction: 'notify-cad-delivery',
    file: '/email-templates/24-cad-delivery.html',
  },
  {
    id: 'D04', name: 'Manual CAD Send', group: 'CAD Workflow', icon: Send,
    description: 'Manually email a CAD file/preview to a customer from the CAD Hub.',
    trigger: 'Staff sends CAD manually', recipient: 'End customer',
    edgeFunction: 'send-cad-email',
    file: '/email-templates/25-manual-cad-send.html',
  },

  // ===== Orders =====
  {
    id: '10', name: 'Order Status Update', group: 'Orders', icon: ShoppingBag,
    description: 'Sent when a new order is received, status changes, or fulfillment is updated.',
    trigger: 'New order / status change', recipient: 'Client admins',
    edgeFunction: 'notify-order-update',
    file: '/email-templates/10-order-update-notification.html',
  },

  // ===== Admin (Agency) Notifications =====
  {
    id: '07', name: 'New Client Signup', group: 'Admin (Agency)', icon: Bell,
    description: 'Sent to platform admins when a new client registers.',
    trigger: 'Client registration', recipient: 'Platform admins',
    edgeFunction: 'notify-admins-new-client',
    file: '/email-templates/07-admin-new-client-notification.html',
  },
  {
    id: '08', name: 'Client Status Change', group: 'Admin (Agency)', icon: AlertTriangle,
    description: 'Sent to admins when a client account status changes (active, suspended, etc).',
    trigger: 'Status update', recipient: 'Platform admins',
    edgeFunction: 'notify-admins-client-status',
    file: '/email-templates/08-admin-client-status-notification.html',
  },
  {
    id: 'AG03', name: 'Billing Event', group: 'Admin (Agency)', icon: CreditCard,
    description: 'Sent to admins for subscription / billing events (payment, failure, refund).',
    trigger: 'Stripe billing webhook', recipient: 'Platform admins',
    edgeFunction: 'notify-admins-billing-event',
    file: '/email-templates/26-admin-billing-event.html',
  },
  {
    id: '11', name: 'Staff Activity Alert', group: 'Admin (Agency)', icon: Users,
    description: 'Sent to clients when staff members are added, removed, or permissions change.',
    trigger: 'Staff add/remove/update', recipient: 'Client admins',
    edgeFunction: 'notify-staff-activity',
    file: '/email-templates/11-staff-activity-notification.html',
  },

  // ===== Generic =====
  {
    id: 'G01', name: 'Generic Email (Resend Transport)', group: 'Generic', icon: Mail,
    description: 'Internal transport function used by other notifiers to actually send emails via Resend.',
    trigger: 'Called by other functions', recipient: 'Varies',
    edgeFunction: 'send-email',
    file: '/email-templates/27-generic-email.html',
  },
];

export function EmailTemplatesTabContent() {
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [activeGroup, setActiveGroup] = useState<string>(GROUPS[0]);
  const [previewHeaderAppearance, setPreviewHeaderAppearance] = useState<'dark' | 'light'>('dark');
  const previewFrameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const header = previewFrameRef.current?.contentDocument?.querySelector<HTMLElement>('.email-header');
    if (!header) return;
    const isLight = previewHeaderAppearance === 'light';
    header.style.setProperty('background-color', isLight ? '#ffffff' : '#000000', 'important');
    header.style.setProperty('border-bottom', isLight ? '1px solid #eeeeee' : '0', 'important');
  }, [previewHeaderAppearance, previewTemplate]);

  if (previewTemplate) {
    const Icon = previewTemplate.icon;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(null)} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Templates
          </Button>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-base sm:text-lg">{previewTemplate.name} Template</h3>
          </div>
        </div>
        {previewTemplate.group === 'Customer-Facing' && (
          <div className="flex items-center gap-2" role="group" aria-label="Email header preview">
            <span className="text-sm text-muted-foreground">Header preview:</span>
            <Button
              type="button"
              size="sm"
              variant={previewHeaderAppearance === 'dark' ? 'default' : 'outline'}
              onClick={() => setPreviewHeaderAppearance('dark')}
            >
              Dark
            </Button>
            <Button
              type="button"
              size="sm"
              variant={previewHeaderAppearance === 'light' ? 'default' : 'outline'}
              onClick={() => setPreviewHeaderAppearance('light')}
            >
              Light
            </Button>
          </div>
        )}
        <div className="rounded-lg border bg-white overflow-hidden">
          <iframe
            ref={previewFrameRef}
            src={previewTemplate.file!}
            title={`${previewTemplate.name} Email Template`}
            className="w-full border-0"
            style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}
            onLoad={() => {
              const header = previewFrameRef.current?.contentDocument?.querySelector<HTMLElement>('.email-header');
              if (!header) return;
              const isLight = previewHeaderAppearance === 'light';
              header.style.setProperty('background-color', isLight ? '#ffffff' : '#000000', 'important');
              header.style.setProperty('border-bottom', isLight ? '1px solid #eeeeee' : '0', 'important');
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="font-semibold text-base sm:text-lg">Email Templates</h3>
        <p className="text-sm text-muted-foreground">
          Preview all email templates used across the platform, organized by workflow.
        </p>
      </div>

      <Tabs value={activeGroup} onValueChange={setActiveGroup} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
          {GROUPS.map((g) => {
            const count = emailTemplates.filter(t => t.group === g).length;
            return (
              <TabsTrigger key={g} value={g} className="text-xs sm:text-sm">
                {g}
                <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {count}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {GROUPS.map((g) => (
          <TabsContent key={g} value={g} className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {emailTemplates.filter(t => t.group === g).map((template) => {
                const Icon = template.icon;
                const hasFile = template.file !== null;
                return (
                  <Card key={template.id} className="overflow-hidden flex flex-col">
                    <div className="bg-muted px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-foreground" />
                        <h4 className="font-semibold text-sm text-foreground">{template.name}</h4>
                      </div>
                      <p className="text-xs mt-0.5 text-muted-foreground">{template.group}</p>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                      <div className="space-y-1.5 text-sm border-t pt-3 mb-4">
                        <p><span className="font-medium text-foreground">Trigger:</span> {template.trigger}</p>
                        {template.linkExpiry && (
                          <p><span className="font-medium text-foreground">Link Expiry:</span> {template.linkExpiry}</p>
                        )}
                        {template.recipient && (
                          <p><span className="font-medium text-foreground">Recipient:</span> {template.recipient}</p>
                        )}
                        {template.content && (
                          <p><span className="font-medium text-foreground">Content:</span> {template.content}</p>
                        )}
                        {template.edgeFunction && (
                          <p className="truncate">
                            <span className="font-medium text-foreground">Function:</span>{' '}
                            <code className="text-xs">{template.edgeFunction}</code>
                          </p>
                        )}
                      </div>
                      {hasFile ? (
                        <Button
                          className="w-full mt-auto"
                          variant="default"
                          onClick={() => setPreviewTemplate(template)}
                        >
                          View Template →
                        </Button>
                      ) : (
                        <Button className="w-full mt-auto" variant="secondary" disabled>
                          <Ban className="h-4 w-4 mr-1" />
                          No HTML Preview Yet
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
