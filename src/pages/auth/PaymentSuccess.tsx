import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, Mail, Gem } from 'lucide-react';

export default function PaymentSuccess() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState('Confirming your subscription…');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12; // ~24s

    (async () => {
      const { data: { user }, data: { session } } = await supabase.auth.getUser().then(async (u) => {
        const { data: s } = await supabase.auth.getSession();
        return { data: { user: u.data.user, session: s.session } } as any;
      });

      if (cancelled) return;
      if (!user) {
        setAuthed(false);
        return;
      }
      setAuthed(true);

      const poll = async () => {
        attempts++;
        try {
          const { data, error } = await supabase.functions.invoke('check-subscription', {
            headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
          });
          if (!error && data && (data.status === 'active' || data.status === 'trialing')) {
            setStatusMsg('All set — taking you to your dashboard…');
            setTimeout(() => navigate('/dashboard', { replace: true }), 800);
            return;
          }
        } catch {
          /* ignore — keep polling */
        }
        if (attempts >= maxAttempts) {
          setStatusMsg('Almost there — opening your dashboard.');
          setTimeout(() => navigate('/dashboard', { replace: true }), 800);
          return;
        }
        setStatusMsg(`Activating your plan… (${attempts}/${maxAttempts})`);
        setTimeout(poll, 2000);
      };

      poll();
    })();

    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <div className="text-center max-w-md mx-auto p-8">
        {authed === null && (
          <>
            <Gem className="h-16 w-16 text-primary animate-pulse mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Confirming your payment…</h1>
            <p className="text-muted-foreground">One moment.</p>
          </>
        )}
        {authed === true && (
          <>
            <CheckCircle className="h-16 w-16 text-accent mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Welcome back!</h1>
            <p className="text-muted-foreground">{statusMsg}</p>
          </>
        )}
        {authed === false && (
          <>
            <Mail className="h-16 w-16 text-primary mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Payment received 🎉</h1>
            <p className="text-muted-foreground mb-4">
              We've created your Aurezo account. Check your inbox — we just sent you an email
              to <strong>set your password</strong> and sign in.
            </p>
            <p className="text-sm text-muted-foreground">
              Didn't get it within a few minutes? Check your spam folder or{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-primary underline"
              >
                go to login
              </button>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
