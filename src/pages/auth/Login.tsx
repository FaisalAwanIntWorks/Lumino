import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import iconBlackBg from '@/assets/branding/icon-black-bg-v2.png';
import { RememberMeCheckbox } from '@/components/auth/RememberMeCheckbox';
import { getPortalType, PRODUCTION_DOMAINS } from '@/lib/domain-config';
import { logSecurityEvent } from '@/lib/audit-utils';
import { resolveRoleForPortal, type UserRole } from '@/lib/auth-utils';
import { SigningInDialog } from '@/components/auth/SigningInDialog';


export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('aurezo_remember_me') === 'true';
  });
  const [failedAttempts, setFailedAttempts] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  const portalType = getPortalType(window.location.hostname);

  // Save remember me preference
  useEffect(() => {
    localStorage.setItem('aurezo_remember_me', String(rememberMe));
  }, [rememberMe]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current || loading) return;
    
    // Set loading state immediately on click
    setLoading(true);
    submittingRef.current = true;
    
    // Read form values
    const formData = new FormData(e.currentTarget);
    const submittedEmail = String(formData.get('email') ?? email).trim();
    const submittedPassword = String(formData.get('password') ?? password);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: submittedEmail,
        password: submittedPassword,
      });

      if (error) {
        setFailedAttempts(prev => prev + 1);
        
        // Log failed login attempt
        await supabase.functions.invoke('log-failed-login', {
          body: {
            email: submittedEmail,
            reason: error.message,
            userAgent: navigator.userAgent,
          },
        });
        
        throw error;
      }

      if (data.user) {
        // Reset failed attempts on success
        setFailedAttempts(0);
        
        // Get user roles to redirect appropriately. Users may hold multiple
        // roles (e.g. client + staff), so we fetch all and resolve by portal.
        const { data: roleRows } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', data.user.id);

        const roles = (roleRows || []).map((r) => r.role as UserRole);
        const userRole = resolveRoleForPortal(roles);

        // Check if user is on correct portal (in production)
        if (portalType === 'admin' && userRole !== 'agency_admin') {
          await supabase.auth.signOut();
          await logSecurityEvent('wrong_portal_login', { 
            attemptedPortal: 'admin',
            userRole,
            email: submittedEmail,
          }, 'warning');
          toast({
            variant: 'destructive',
            title: 'Access Denied',
            description: 'This portal is for administrators only. Please use studio.aurezotech.com',
          });
          return;
        }

        if (portalType === 'client' && userRole === 'agency_admin') {
          // Redirect admin to admin portal
          await supabase.auth.signOut();
          toast({
            title: 'Wrong Portal',
            description: 'Please use studioadmin.aurezotech.com for admin access.',
          });
          window.location.href = `https://${PRODUCTION_DOMAINS.admin}/login`;
          return;
        }

        // Credentials are valid — discard the password-only session.
        // Real session is created after OTP verification.
        await supabase.auth.signOut();

        // Send OTP to user's email
        const { error: otpError } = await supabase.functions.invoke('send-login-otp', {
          body: { email: submittedEmail },
        });

        if (otpError) {
          toast({
            variant: 'destructive',
            title: 'Could not send code',
            description: 'Please try signing in again in a moment.',
          });
          return;
        }

        toast({
          title: 'Check your email',
          description: 'We sent you a 6-digit verification code.',
        });

        navigate('/otp-verify', { state: { email: submittedEmail } });
      }
    } catch (error: any) {
      const remainingAttempts = 5 - failedAttempts;
      toast({
        variant: 'destructive',
        title: 'Login failed',
        description: remainingAttempts > 0 
          ? `Invalid email or password. ${remainingAttempts} attempt(s) remaining.`
          : 'Too many failed attempts. Please try again later.',
      });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  // Get portal-specific messaging
  const getPortalInfo = () => {
    if (portalType === 'admin') {
      return {
        title: 'Admin Portal',
        subtitle: 'Sign in to manage Aurezo platform',
        showSignup: false,
      };
    }
    return {
      title: 'Aurezo',
      subtitle: 'Sign in to your account',
      showSignup: true,
    };
  };

  const portalInfo = getPortalInfo();

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
            <h1 className="text-3xl font-bold text-foreground">{portalInfo.title}</h1>
            <p className="text-muted-foreground text-sm mt-2">{portalInfo.subtitle}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  disabled={loading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <RememberMeCheckbox 
                checked={rememberMe} 
                onCheckedChange={setRememberMe}
                disabled={loading}
              />
              <Link to="/forgot-password" className="text-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit" 
              className="w-full h-12 bg-primary text-primary-foreground rounded-lg text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={loading}
            >
              Sign in
            </button>
          </form>

          {/* Separate loading dialog (no button effects) */}
          <SigningInDialog open={loading} />

          {/* Sign up link */}
          {portalInfo.showSignup && (
            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Don't have an account? </span>
              <Link to="/signup" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
