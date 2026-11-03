import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { dollarsToCredits } from '@/lib/credit-utils';

export default function CreditsSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [credited, setCredited] = useState(0);
  const [balance, setBalance] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      setStatus('error');
      setErrorMsg('Missing session ID');
      return;
    }
    verify(sessionId);
  }, []);

  const verify = async (sessionId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('verify-credit-purchase', {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCredited(data.credited || Number(data.balance));
      setBalance(data.balance);
      setStatus('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification failed');
      setStatus('error');
    }
  };

  const creditedCredits = dollarsToCredits(credited);
  const balanceCredits = dollarsToCredits(balance);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === 'verifying' && <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />}
          {status === 'success' && <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />}
          {status === 'error' && <XCircle className="h-12 w-12 text-destructive mx-auto" />}
          <CardTitle className="mt-4">
            {status === 'verifying' && 'Verifying purchase...'}
            {status === 'success' && 'Credits Added!'}
            {status === 'error' && 'Verification Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === 'success' && (
            <>
              <p className="text-muted-foreground">
                <span className="text-2xl font-bold font-mono text-foreground">{creditedCredits.toLocaleString()}</span>
                {' '}credits have been added to your wallet.
              </p>
              <p className="text-sm text-muted-foreground">
                New balance: <span className="font-mono font-semibold">{balanceCredits.toLocaleString()} credits</span>
              </p>
            </>
          )}
          {status === 'error' && (
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          )}
          <Button onClick={() => navigate('/dashboard/usage')} className="w-full">
            {status === 'success' ? 'Go to Usage Dashboard' : 'Back to Dashboard'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
