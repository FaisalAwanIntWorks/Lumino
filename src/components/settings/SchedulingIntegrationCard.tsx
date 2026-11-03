import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, CheckCircle2, ExternalLink } from 'lucide-react';
import { detectSchedulingProvider, type SchedulingProvider } from '@/hooks/useClientScheduling';

interface SchedulingIntegrationCardProps {
  value: string | null | undefined;
  provider: SchedulingProvider | null | undefined;
  onSave: (url: string | null, provider: SchedulingProvider | null) => Promise<void> | void;
  disabled?: boolean;
}

const PROVIDER_LABELS: Record<SchedulingProvider, string> = {
  calendly: 'Calendly',
  cal: 'Cal.com',
  other: 'Custom scheduler',
};

function isValidHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}

export function SchedulingIntegrationCard({
  value,
  provider,
  onSave,
  disabled,
}: SchedulingIntegrationCardProps) {
  const [url, setUrl] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUrl(value || '');
  }, [value]);

  const trimmed = url.trim();
  const detected: SchedulingProvider | null = trimmed ? detectSchedulingProvider(trimmed) : null;
  const isConnected = !!value;
  const isDirty = trimmed !== (value || '');

  const handleSave = async () => {
    setError(null);
    if (trimmed && !isValidHttpsUrl(trimmed)) {
      setError('Please enter a valid https:// URL.');
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed || null, trimmed ? detectSchedulingProvider(trimmed) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    setSaving(true);
    try {
      await onSave(null, null);
      setUrl('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-primary mt-0.5" />
            <div>
              <CardTitle className="text-base sm:text-lg">Scheduling / Calendar</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Connect your Calendly, Cal.com or any external scheduler. Customers will book
                directly against your real availability inside the Book Appointment dialog.
              </CardDescription>
            </div>
          </div>
          {isConnected && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary whitespace-nowrap">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {provider ? PROVIDER_LABELS[provider] : 'Connected'}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="scheduling-url" className="text-sm font-medium">
            Scheduling link
          </Label>
          <Input
            id="scheduling-url"
            type="url"
            placeholder="https://calendly.com/your-jewelry-store/consultation"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled || saving}
            maxLength={500}
          />
          {detected && (
            <p className="text-xs text-muted-foreground">
              Detected provider: <span className="font-medium text-foreground">{PROVIDER_LABELS[detected]}</span>
            </p>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertDescription className="text-xs space-y-1">
            <p>
              When set, both the <span className="font-medium">Ring OS "Book Appointment"</span> and{' '}
              <span className="font-medium">Metal IQ "Book Appointment"</span> dialogs will embed your
              scheduler instead of the default request form. Leave empty to keep the default form.
            </p>
            <p className="text-muted-foreground">
              Tip: in Calendly, connect your Google / Outlook calendar so live availability stays accurate.
            </p>
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={disabled || saving || !isDirty} size="sm">
            {saving ? 'Saving…' : isConnected ? 'Update link' : 'Save link'}
          </Button>
          {isConnected && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
              >
                <a href={value!} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={disabled || saving}
              >
                Disconnect
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
