import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Mail } from 'lucide-react';
import iconBlackBg from '@/assets/branding/icon-black-bg-v2.png';
import { getPortalType, PRODUCTION_DOMAINS } from '@/lib/domain-config';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Determine correct redirect URL based on portal type
      const portalType = getPortalType(window.location.hostname);
      let redirectUrl = window.location.origin;
      if (portalType === 'admin') {
        redirectUrl = `https://${PRODUCTION_DOMAINS.admin}`;
      } else if (portalType === 'client') {
        redirectUrl = `https://${PRODUCTION_DOMAINS.client}`;
      }
      
      // Use custom Resend-powered password reset
      const { error } = await supabase.functions.invoke('request-password-reset', {
        body: {
          email: email.trim().toLowerCase(),
          redirect_url: redirectUrl,
        },
      });

      if (error) throw error;

      setEmailSent(true);
      toast({
        title: 'Check your email',
        description: 'If an account exists, we sent you a password reset link.',
      });
    } catch (error: any) {
      console.error('Password reset error:', error);
      // Don't reveal if email exists or not
      toast({
        title: 'Check your email',
        description: 'If an account exists, we sent you a password reset link.',
      });
      setEmailSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
        <div className="w-full max-w-md p-8">
          <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <div className="mb-4">
                <img src={iconBlackBg} alt="Aurezo" className="h-16 w-16 object-contain rounded-2xl" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Reset Password</h1>
              <p className="text-muted-foreground text-sm mt-2 text-center">
                {emailSent 
                  ? 'Check your email for the reset link'
                  : 'Enter your email to receive a reset link'}
              </p>
            </div>

            {emailSent ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center py-8">
                  <div className="bg-primary/10 p-4 rounded-full mb-4">
                    <Mail className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-center text-muted-foreground">
                    If an account exists for <strong>{email}</strong>, we've sent a password reset link. 
                    Please check your inbox and click the link to reset your password.
                  </p>
                </div>
                
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => {
                    setEmailSent(false);
                    setEmail('');
                  }}
                >
                  Try a different email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </form>
            )}

            {/* Back to login */}
            <div className="mt-6">
              <Link 
                to="/login" 
                className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
