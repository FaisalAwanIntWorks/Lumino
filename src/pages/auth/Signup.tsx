import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import iconBlackBg from '@/assets/branding/icon-black-bg-v2.png';
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator';
import { signupSchema, getValidationErrorMessage } from '@/lib/auth-validation';
import { Eye, EyeOff } from 'lucide-react';

export default function Signup() {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // If a user is already logged in, they shouldn't be on the signup page.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate('/dashboard');
      }
    });
  }, [navigate]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = signupSchema.safeParse({
      companyName,
      email,
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

    setLoading(true);

    try {
      // Use backend function to create user with proper permissions (bypasses RLS)
      const { data: result, error: fnError } = await supabase.functions.invoke('create-client-user', {
        body: {
          email: validation.data.email,
          password: validation.data.password,
          companyName: validation.data.companyName,
        },
      });

      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);

      // Send verification email (non-blocking; account creation should still succeed)
      if (result?.userId) {
        const verifyRedirectUrl = import.meta.env.PROD ? 'https://vault.jewlx.ai' : window.location.origin;

        const { error: verifyEmailError } = await supabase.functions.invoke('send-verification-email', {
          body: {
            user_id: result.userId,
            email: validation.data.email,
            company_name: validation.data.companyName,
            redirect_url: verifyRedirectUrl,
          },
        });

        if (verifyEmailError) {
          console.warn('Failed to send verification email:', verifyEmailError);
        }
      }

      // If this is an existing account (e.g., a previously-failed signup),
      // do not attempt to sign in with the newly entered password.
      if (result?.existingUser) {
        toast({
          title: 'Account already exists',
          description: 'We found your existing account. Please verify your email (if needed) and sign in.',
        });
        navigate('/login');
        return;
      }

      // IMPORTANT: do not auto-sign-in here because new accounts are not confirmed yet.
      // Users must verify email first, then sign in.
      toast({
        title: 'Account created!',
        description: "We've sent a verification email to your inbox. Please verify your email, then sign in.",
      });

      navigate('/login');
      return;
    } catch (error: any) {
      console.error('Signup error:', error);

      // Generic error message to prevent user enumeration
      let message = 'Could not create account. Please try again.';
      let redirectToLogin = false;

      const errMsg = (error?.message ?? '').toLowerCase();

      // Duplicate account / existing user (covers 409 + various backend messages)
      if (
        errMsg.includes('already registered') ||
        errMsg.includes('account already exists') ||
        errMsg.includes('email_exists') ||
        errMsg.includes('edge function returned 409')
      ) {
        toast({
          title: 'Account already exists',
          description: 'Please sign in. If you forgot your password, use “Forgot password”.',
        });
        navigate('/login');
        return;
      }

      // Email confirmation required
      if (errMsg.includes('email not confirmed') || errMsg.includes('confirm your email')) {
        message = 'Please verify your email first, then sign in.';
        redirectToLogin = true;
      }

      toast({
        variant: 'destructive',
        title: 'Signup failed',
        description: message,
      });

      if (redirectToLogin) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <div className="w-full max-w-md p-8">
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-4">
              <img src={iconBlackBg} alt="JewlX" className="h-16 w-16 object-contain rounded-2xl" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">JewlX</h1>
            <p className="text-muted-foreground text-sm mt-2">Create your account</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSignup} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                type="text"
                placeholder="Your Company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                disabled={loading}
                maxLength={100}
                autoComplete="organization"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                maxLength={255}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
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
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          {/* Login link */}
          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
