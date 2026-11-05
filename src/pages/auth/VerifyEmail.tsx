import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import iconBlackBg from '@/assets/branding/icon-black-bg-v2.png';

export default function VerifyEmail() {
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const token = searchParams.get('token');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setError('No verification token provided');
        setVerifying(false);
        return;
      }

      try {
        const { data, error: invokeError } = await supabase.functions.invoke('verify-email-token', {
          body: { token },
        });

        if (invokeError || !data?.success) {
          setError(data?.error || 'Failed to verify email');
          setSuccess(false);
        } else {
          setSuccess(true);
          toast({
            title: 'Email Verified!',
            description: 'Your email has been successfully verified.',
          });

          // Redirect to login after 3 seconds
          setTimeout(() => {
            navigate('/login');
          }, 3000);
        }
      } catch (err: any) {
        console.error('Email verification error:', err);
        setError(err.message || 'Failed to verify email');
      } finally {
        setVerifying(false);
      }
    };

    verifyEmail();
  }, [token, navigate, toast]);

  // Loading state
  if (verifying) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
          <div className="w-full max-w-md p-8">
            <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
              <div className="flex flex-col items-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <h2 className="text-xl font-semibold text-foreground">Verifying your email...</h2>
                <p className="text-muted-foreground mt-2">Please wait a moment</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
          <div className="w-full max-w-md p-8">
            <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
              <div className="flex flex-col items-center mb-8">
                <div className="mb-4">
                  <img src={iconBlackBg} alt="Aurezo" className="h-16 w-16 object-contain rounded-2xl" />
                </div>
                <div className="bg-destructive/10 p-4 rounded-full mb-4">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold text-foreground text-center">Verification Failed</h1>
                <p className="text-muted-foreground text-sm mt-2 text-center">
                  {error}
                </p>
              </div>

              <div className="space-y-4">
                <Button asChild className="w-full">
                  <Link to="/signup">Create New Account</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/login">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Login
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
        <div className="w-full max-w-md p-8">
          <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
            <div className="flex flex-col items-center mb-8">
              <div className="mb-4">
                <img src={iconBlackBg} alt="Aurezo" className="h-16 w-16 object-contain rounded-2xl" />
              </div>
              <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-full mb-4">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-foreground text-center">Email Verified!</h1>
              <p className="text-muted-foreground text-sm mt-2 text-center">
                Your email has been successfully verified. Redirecting you to login...
              </p>
            </div>

            <Button asChild className="w-full">
              <Link to="/login">Continue to Login</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
