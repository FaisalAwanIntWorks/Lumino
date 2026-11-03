import { Laptop, Monitor, Smartphone, Tablet } from 'lucide-react';
import { formatLeadDevice, leadDeviceCategory, type LeadDeviceCategory, type LeadDeviceInfo } from '@/lib/lead-device';

const ICONS: Record<LeadDeviceCategory, typeof Smartphone> = {
  android: Smartphone,
  iphone: Smartphone,
  ipad: Tablet,
  macbook: Laptop,
  desktop: Monitor,
  unknown: Monitor,
};

export function LeadDeviceIcon({ category, className }: { category: LeadDeviceCategory; className?: string }) {
  const Icon = ICONS[category];
  return <Icon className={className ?? 'h-3.5 w-3.5 shrink-0 text-muted-foreground'} />;
}

/** "Device" line on a lead: icon + Android / iPhone / iPad / MacBook / Desktop. Renders nothing for older leads. */
export function LeadDeviceLabel({ info, className }: { info: LeadDeviceInfo | null | undefined; className?: string }) {
  const label = formatLeadDevice(info);
  if (!info || !label) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className ?? ''}`}>
      <LeadDeviceIcon category={leadDeviceCategory(info)} />
      <span className="truncate">{label}</span>
    </span>
  );
}
