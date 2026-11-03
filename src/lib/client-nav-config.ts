import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Code,
  Settings,
  Eye,
  Bot,
  TrendingUp,
  Gem,
  CalendarDays,
  FileText,
  Ruler,
  Coins,
  LifeBuoy
} from 'lucide-react';
import { ClientFeatures } from '@/hooks/useClientFeatures';

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  locked?: boolean;
}

interface NavSubSection {
  subSection: string;
  icon?: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

interface NavSection {
  section: string;
  items?: NavItem[];
  groups?: NavSubSection[];
}

interface GetClientNavItemsOptions {
  routePrefix: string;
  role: string | null;
  hasCatalogAccess: boolean;
  hasCustomXAccess: boolean;
  hasLeadsAccess: boolean;
  hasStaffViewAccess: boolean;
  hasMetalIQAccess: boolean;
  features: ClientFeatures;
  clientId?: string | null;
  /** Staff whose `show_leads` permission is off: hide every leads list. */
  hideLeads?: boolean;
}

// Clients that should see the classic DTT step-by-step diamond form
// exposed as its own tab under Custom X (in addition to Ring Builder).
const DTT_FORM_EXPOSED_CLIENT_IDS = new Set<string>([
  '9d43af60-4e42-4b48-ac9a-b0fa9e608385', // fbe (205150@aack.au.edu.pk)
]);

export function getClientNavItems({
  routePrefix,
  role,
  hasCatalogAccess,
  hasCustomXAccess,
  hasLeadsAccess,
  hasStaffViewAccess,
  hasMetalIQAccess,
  features,
  clientId,
  hideLeads = false,
}: GetClientNavItemsOptions): NavSection[] {
  const p = routePrefix;

  // Build form sub-items based on enabled features and Custom X access
  const showCustomX = role !== 'staff' || hasCustomXAccess;
  const showDTTForm = !!features.dtt_v2;

  const formItems: NavItem[] = showCustomX ? [
    { label: 'Ring Builder', icon: Gem, href: `${p}/diamonds-form?tab=ring-builder`, locked: !features.diamond_form || (!features.custom_enquiry && !features.grillz_builder) },
    ...(showDTTForm ? [{ label: 'Quote Estimator Form', icon: Gem, href: `${p}/diamonds-form?tab=dtt-form`, locked: !features.dtt_v2 }] : []),
    { label: 'Grillz Builder', icon: Gem, href: `${p}/diamonds-form?tab=grill-builder`, locked: !features.grillz_builder },
    { label: 'Custom Enquiry', icon: FileText, href: `${p}/diamonds-form?tab=custom-enquiry`, locked: !features.custom_enquiry },
  ] : [];


  // Ring OS access — when staff lacks catalog_access, hide ALL three tabs
  // (Catalog, Widget, JewlX Agent) per the unified Ring OS permission.
  const showRingOS = role !== 'staff' || hasCatalogAccess;
  const ringOSItems: NavItem[] = showRingOS ? [
    { label: 'Catalog', icon: Package, href: `${p}/catalog`, locked: !features.product_catalogue },
    { label: 'Widget', icon: Code, href: `${p}/embed`, locked: !features.embed_branding },
    { label: 'JewlX Agent', icon: Bot, href: `${p}/ai-configurator`, locked: !features.jewlx_agent },
  ] : [];

  const items: NavSection[] = [
    {
      section: 'Overview',
      items: [
        { label: 'Dashboard', icon: LayoutDashboard, href: `${p}` },
        { label: 'Live Prices', icon: TrendingUp, href: `${p}/live-prices` },
      ]
    },
    {
      section: 'Products',
      groups: [
        ...(ringOSItems.length > 0 ? [{
          subSection: 'Ring OS',
          icon: Gem,
          items: ringOSItems,
        }] : []),
        ...(formItems.length > 0 ? [{
          subSection: 'Custom X',
          icon: FileText,
          items: formItems,
        }] : []),
        ...((role !== 'staff' || hasMetalIQAccess) ? [{
          subSection: 'Metal IQ',
          icon: Coins,
          items: [
            { label: 'Widget', icon: Settings, href: `${p}/metal-buying-config`, locked: !features.metal_buying },
            ...(hideLeads ? [] : [{ label: 'Leads', icon: Eye, href: `${p}/metal-buying-leads`, locked: !features.metal_buying }]),
          ],
        }] : []),
      ],
    },
    {
      section: 'Sales',
      items: [
        { label: 'Orders & Deposits', icon: ShoppingCart, href: `${p}/orders`, locked: !features.orders },
        ...(!hideLeads && (role !== 'staff' || hasLeadsAccess || hasStaffViewAccess) ? [{ label: 'Leads & Bookings', icon: Eye, href: `${p}/saved-designs` }] : []),
        { label: 'CAD Requests', icon: Ruler, href: `${p}/cad-requests` },
      ]
    },
    {
      section: 'Account',
      items: [
        { label: 'Help Center', icon: LifeBuoy, href: `${p}/help-center` },
        { label: 'Settings', icon: Settings, href: `${p}/settings` },
      ]
    }
  ];

  // Only surface what the client has actually been granted. Locked items are
  // stripped entirely, and any product group / section left empty is dropped
  // so a Metal-IQ-only client never sees "Ring OS" or "Custom X" at all.
  const visible: NavSection[] = items.map(section => ({
    ...section,
    items: section.items?.filter(item => !item.locked),
    groups: section.groups
      ?.map(group => ({ ...group, items: group.items.filter(item => !item.locked) }))
      .filter(group => group.items.length > 0),
  }));

  return visible.filter(section => (section.items && section.items.length > 0) || (section.groups && section.groups.length > 0));
}
