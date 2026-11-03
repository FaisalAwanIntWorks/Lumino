import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  THANK_YOU_CONTACT_OPTIONS,
  type ThankYouContact,
  type ThankYouContactMethod,
} from '@/lib/thank-you-contact';

interface ThankYouContactEditorProps {
  value: ThankYouContact;
  onChange: (next: ThankYouContact) => void;
}

/**
 * Configurator block: "How would you like your leads to contact you?"
 * Shared by the Ring Builder, Grillz Builder and Custom Enquiry configurators.
 */
export function ThankYouContactEditor({ value, onChange }: ThankYouContactEditorProps) {
  const setMethod = (method: ThankYouContactMethod) => onChange({ ...value, method });
  const needsPhone = value.method === 'call' || value.method === 'contact';
  const needsCalendar = value.method === 'schedule';

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-semibold text-foreground">How would you like your leads to contact you?</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          A button with this option appears on the thank-you screen after a lead is submitted.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {THANK_YOU_CONTACT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMethod(opt.value)}
            className={`p-3 rounded-lg border-2 text-left transition-all ${
              value.method === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border/50 hover:border-primary/30'
            }`}
          >
            <span className="text-lg">{opt.icon}</span>
            <p className="text-xs font-medium text-foreground mt-1">{opt.label}</p>
          </button>
        ))}
      </div>
      {needsPhone && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Phone number</Label>
          <Input
            type="tel"
            value={value.phone}
            onChange={e => onChange({ ...value, phone: e.target.value })}
            placeholder="+1 555 000 0000"
            className="h-8 text-sm max-w-[260px]"
          />
          <p className="text-[11px] text-muted-foreground">Tapping the button dials this number.</p>
        </div>
      )}
      {needsCalendar && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Calendar / booking link</Label>
          <Input
            type="url"
            value={value.calendar_url}
            onChange={e => onChange({ ...value, calendar_url: e.target.value })}
            placeholder="https://calendly.com/your-store"
            className="h-8 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">Tapping the button opens this link in a new tab.</p>
        </div>
      )}
    </div>
  );
}
