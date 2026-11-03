import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Eye, EyeOff, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import iconBlackBg from '@/assets/branding/icon-black-bg-v2.png';
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator';
import { resetPasswordSchema, getValidationErrorMessage } from '@/lib/auth-validation';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const token = searchParams.get('token');

  useEffect(() => {
    const verifyToken = async () => {
      // Only custom token-based reset is supported (via Resend emails)
      if (!token) {
        setTokenError('Invalid or expired reset link. Please request a new one.');
        setTokenValid(false);
        setVerifying(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('verify-reset-token', {
          body: { token },
        });

        if (error || !data?.valid) {
          setTokenError(data?.error || 'Invalid or expired reset link');
          setTokenValid(false);
        } else {
          setTokenValid(true);
          setUserEmail(data.email);
        }
      } catch (err) {
        console.error('Token verification error:', err);
        setTokenError('Failed to verify reset link');
        setTokenValid(false);
      }
      setVerifying(false);
    };

    verifyToken();
  }, [token]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate with Zod schema
    const validation = resetPasswordSchema.safeParse({
      password,
      confirmPassword,
    });

    if (!validation.success) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: getValidationErrorMessage(validation.error),
      });
      return;
    }

    if (!token) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Invalid reset token. Please request a new password reset link.',
      });
      return;
    }

    setLoading(true);

    try {
      // Use custom token-based password reset via Resend
      const { data, error } = await supabase.functions.invoke('verify-reset-token', {
        body: { token, new_password: validation.data.password },
      });

      if (error || !data?.success) {
        // A 4xx from the function (e.g. a weak or leaked password) arrives as
        // an error with the real reason in the response body — surface it.
        let message = data?.error as string | undefined;
        if (!message && error) {
          try {
            const body = await (error as any)?.context?.json?.();
            message = body?.error;
          } catch {
            // fall through to the generic message
          }
        }
        throw new Error(message || 'Failed to reset password');
      }

      setSuccess(true);
      toast({
        title: 'Password updated!',
        description: 'Your password has been successfully reset.',
      });

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (error: any) {
      console.error('Password update error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update password. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Loading state while verifying token
  if (verifying) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
          <div className="w-full max-w-md p-8">
            <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
              <div className="flex flex-col items-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <h2 className="text-xl font-semibold text-foreground">Verifying reset link...</h2>
                <p className="text-muted-foreground mt-2">Please wait a moment</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (!tokenValid) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
          <div className="w-full max-w-md p-8">
            <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
              <div className="flex flex-col items-center mb-8">
                <div className="mb-4">
                  <img src={iconBlackBg} alt="JewlX" className="h-16 w-16 object-contain rounded-2xl" />
                </div>
                <div className="bg-destructive/10 p-4 rounded-full mb-4">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold text-foreground text-center">Link Expired</h1>
                <p className="text-muted-foreground text-sm mt-2 text-center">
                  {tokenError || 'This password reset link is invalid or has expired.'}
                </p>
              </div>

              <div className="space-y-4">
                <Button asChild className="w-full">
                  <Link to="/forgot-password">Request New Link</Link>
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

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
        <div className="w-full max-w-md p-8">
          <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <div className="mb-4">
                <img src={iconBlackBg} alt="JewlX" className="h-16 w-16 object-contain rounded-2xl" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">
                {success ? 'Password Updated!' : 'Set New Password'}
              </h1>
              <p className="text-muted-foreground text-sm mt-2 text-center">
                {success 
                  ? 'Redirecting you to login...'
                  : userEmail 
                    ? `Enter a new password for ${userEmail}`
                    : 'Enter your new password below'}
              </p>
            </div>

            {success ? (
              <div className="flex flex-col items-center py-8">
                <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-full mb-4">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-center text-muted-foreground">
                  Your password has been successfully updated. You will be redirected to the login page shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleUpdatePassword} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      maxLength={128}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <PasswordStrengthIndicator password={password} />
                  <p className="text-xs text-muted-foreground mt-2">
                    Do not use your first name, last name, or email in your password.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                      maxLength={128}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
