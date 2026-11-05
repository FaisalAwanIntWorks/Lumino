import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const FN = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/marketing-unsubscribe`;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'subscribed' | 'unsubscribed' | 'invalid' | 'done' | 'error'>('loading');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    fetch(`${FN}?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setState(d.status === 'subscribed' ? 'subscribed' : d.status === 'unsubscribed' ? 'unsubscribed' : 'invalid'))
      .catch(() => setState('error'));
  }, [token]);

  const confirm = async () => {
    setState('loading');
    try {
      const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const d = await r.json();
      setState(d.status === 'unsubscribed' ? 'done' : 'error');
    } catch { setState('error'); }
  };

  const msg: Record<string, string> = {
    loading: 'One moment…',
    subscribed: 'Unsubscribe from Aurezo updates? You will stop receiving these emails.',
    unsubscribed: 'You are already unsubscribed.',
    done: 'You have been unsubscribed. You will not receive any more of these emails.',
    invalid: 'This unsubscribe link is not valid.',
    error: 'Something went wrong. Please try again or reply to the email to unsubscribe.',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full border border-border rounded-lg p-8 text-center space-y-6">
        <h1 className="text-xl font-semibold text-foreground">Aurezo</h1>
        <p className="text-sm text-muted-foreground">{msg[state]}</p>
        {state === 'subscribed' && <Button onClick={confirm}>Unsubscribe</Button>}
      </div>
    </div>
  );
}
