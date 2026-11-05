import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Bot, Shield, LayoutGrid, Coins, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { SigningInDialog } from '@/components/auth/SigningInDialog';
import iconBlackBg from '@/assets/branding/icon-black-bg-v2.png';
import { checkRateLimit } from '@/lib/rate-limit-client';
import { loginSchema, getValidationErrorMessage } from '@/lib/auth-validation';
import { getPortalType, PRODUCTION_DOMAINS } from '@/lib/domain-config';
import { logSecurityEvent } from '@/lib/audit-utils';
import { resolveRoleForPortal, type UserRole } from '@/lib/auth-utils';



interface LockoutStatus {
  locked: boolean;
  remainingAttempts: number;
  lockedUntil?: string;
  requiresEmailUnlock?: boolean;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lockoutStatus, setLockoutStatus] = useState<LockoutStatus | null>(null);
  
  const navigate = useNavigate();
  const { toast } = useToast();

  const portalType = getPortalType(window.location.hostname);

  // Check account lockout status
  const checkLockoutStatus = async (emailToCheck: string): Promise<LockoutStatus | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('account-lockout-check', {
        body: { email: emailToCheck, action: 'check' },
      });
      if (error) return null;
      return data as LockoutStatus;
    } catch {
      return null;
    }
  };

  // Increment failed attempt count
  const incrementFailedAttempt = async (emailToCheck: string): Promise<LockoutStatus | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('account-lockout-check', {
        body: { email: emailToCheck, action: 'increment' },
      });
      if (error) return null;
      return data as LockoutStatus;
    } catch {
      return null;
    }
  };

  // Log failed login attempt (fire and forget - don't block UI)
  const logFailedLogin = (emailAttempt: string, reason: string) => {
    supabase.functions.invoke('log-failed-login', {
      body: { 
        email: emailAttempt, 
        reason,
        userAgent: navigator.userAgent,
      },
    }).catch(() => {
      // Silently fail - logging shouldn't break login flow
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Show loading immediately on click
    setLoading(true);

    // Step 1: Validate input with Zod
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      setLoading(false);
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: getValidationErrorMessage(validation.error),
      });
      return;
    }

    // Step 2: Check account lockout BEFORE any login attempt
    const currentLockout = await checkLockoutStatus(validation.data.email);
    if (currentLockout?.locked) {
      setLoading(false);
      setLockoutStatus(currentLockout);
      const lockedUntil = currentLockout.lockedUntil 
        ? new Date(currentLockout.lockedUntil).toLocaleTimeString() 
        : 'a while';
      toast({
        variant: 'destructive',
        title: 'Account Locked',
        description: `Too many failed attempts. Try again after ${lockedUntil} or reset your password.`,
      });
      return;
    }

    // Step 3: Check rate limit
    const rateLimitResult = await checkRateLimit('login');
    if (!rateLimitResult.allowed) {
      setLoading(false);
      toast({
        variant: 'destructive',
        title: 'Too Many Attempts',
        description: `Please wait ${Math.ceil((rateLimitResult.retryAfter || 300) / 60)} minutes before trying again.`,
      });
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: validation.data.email,
        password: validation.data.password,
      });

      if (error) {
        // Log failed login attempt (generic reason to prevent enumeration)
        logFailedLogin(validation.data.email, 'invalid_credentials');
        throw error;
      }

      if (data.user) {
        // Fetch ALL roles to handle dual-role users (e.g. client owner + staff).
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
            email: validation.data.email,
          }, 'warning');
          toast({
            variant: 'destructive',
            title: 'Access Denied',
            description: 'This portal is for administrators only. Please use studio.aurezotech.com',
          });
          setLoading(false);
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

        // Check if client account is inactive
        if (userRole === 'client') {
          const { data: clientData } = await supabase
            .from('clients')
            .select('status')
            .eq('user_id', data.user.id)
            .maybeSingle();

          if (clientData?.status === 'inactive') {
            await supabase.auth.signOut();
            toast({
              variant: 'destructive',
              title: 'Account Deactivated',
              description: 'Your account has been deactivated by the administrator. Please contact support.',
            });
            setLoading(false);
            return;
          }
        }

        // If staff, check if they are active AND if parent client is active
        if (userRole === 'staff') {
          const { data: staffData } = await supabase
            .from('staff_members')
            .select('status, client_id')
            .eq('user_id', data.user.id)
            .maybeSingle();

          if (staffData?.status === 'inactive') {
            await supabase.auth.signOut();
            toast({
              variant: 'destructive',
              title: 'Account Deactivated',
              description: 'Your account has been deactivated. Please contact your administrator.',
            });
            setLoading(false);
            return;
          }

          // Check if parent client is inactive
          if (staffData?.client_id) {
            const { data: parentClient } = await supabase
              .from('clients')
              .select('status')
              .eq('id', staffData.client_id)
              .maybeSingle();

            if (parentClient?.status === 'inactive') {
              await supabase.auth.signOut();
              toast({
                variant: 'destructive',
                title: 'Company Account Deactivated',
                description: 'Your company account has been deactivated. Please contact your administrator.',
              });
              setLoading(false);
              return;
            }
          }
        }

        if (userRole === 'agency_admin') {
          // Check if this admin is in admin_staff_members and inactive
          const { data: adminStaffData } = await supabase
            .from('admin_staff_members' as any)
            .select('status')
            .eq('user_id', data.user.id)
            .single();

          // If found in admin_staff_members and inactive, block login
          if (adminStaffData && (adminStaffData as any).status === 'inactive') {
            await supabase.auth.signOut();
            toast({
              variant: 'destructive',
              title: 'Account Deactivated',
              description: 'Your admin account has been deactivated. Please contact your administrator.',
            });
            setLoading(false);
            return;
          }
        }

        // Temporary: until a sending domain is verified, emails only reach the Resend
        // account owner, so clients/staff could never receive their code. With
        // VITE_SKIP_CLIENT_LOGIN_OTP=true they keep the password session instead.
        // Admins always go through the emailed code.
        if (import.meta.env.VITE_SKIP_CLIENT_LOGIN_OTP === 'true' && userRole !== 'agency_admin') {
          toast({ title: 'Welcome back!', description: 'Successfully signed in.' });
          window.location.href = '/dashboard';
          return;
        }

        // Credentials are valid. Now require OTP verification before granting session.
        const submittedEmail = validation.data.email;

        // Discard the password-only session — user is not "signed in" until OTP is verified.
        await supabase.auth.signOut();

        const { error: otpError } = await supabase.functions.invoke('send-login-otp', {
          body: { email: submittedEmail },
        });

        if (otpError) {
          toast({
            variant: 'destructive',
            title: 'Failed to Send Code',
            description: 'We verified your password but could not send the verification code. Please try again.',
          });
          setLoading(false);
          return;
        }

        toast({
          title: 'Check your email',
          description: 'We sent a 6-digit verification code to your email.',
        });
        navigate(`/verify-otp?email=${encodeURIComponent(submittedEmail)}`);
        return;
      }
    } catch (error: any) {
      // Log failed attempt and increment lockout counter
      logFailedLogin(validation.data.email, 'invalid_credentials');
      const newLockout = await incrementFailedAttempt(validation.data.email);
      
      if (newLockout?.locked) {
        setLockoutStatus(newLockout);
        toast({
          variant: 'destructive',
          title: 'Account Locked',
          description: 'Too many failed attempts. Please reset your password or try again later.',
        });
      } else {
        // Generic error message prevents user enumeration attacks
        const remaining = newLockout?.remainingAttempts ?? 'several';
        toast({
          variant: 'destructive',
          title: 'Login failed',
          description: `Invalid email or password. ${remaining} attempt(s) remaining.`,
        });
      }
    } finally {
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
      title: 'Welcome Back',
      subtitle: 'Sign in to continue to your account',
      showSignup: false,
    };
  };

  const portalInfo = getPortalInfo();

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
        
        <div className="relative text-center text-white space-y-8 z-10">
          <div className="flex justify-center mb-8 animate-float">
            <div className="bg-primary-dark p-6 rounded-3xl shadow-2xl">
              <img src={iconBlackBg} alt="Aurezo" className="h-28 w-28 object-contain" />
            </div>
          </div>
          
          <h1 className="text-6xl font-bold mb-4 drop-shadow-lg">Aurezo</h1>
          <p className="text-2xl font-medium opacity-90 max-w-md mx-auto">
            Premium Jewelry Configurator Platform
          </p>
          
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-12 max-w-3xl mx-auto">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6 hover:bg-white/20 transition-all duration-300 hover:-translate-y-1 text-white">
              <svg className="h-10 w-10 mx-auto mb-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="17" rx="7" ry="4" />
                <path d="M12 13 L9 8 L12 3 L15 8 Z" />
              </svg>
              <p className="text-sm font-bold tracking-wider text-white">RING OS</p>
            </Card>
            
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6 hover:bg-white/20 transition-all duration-300 hover:-translate-y-1 text-white">
              <LayoutGrid className="h-10 w-10 mx-auto mb-3 text-white" />
              <p className="text-sm font-bold tracking-wider text-white">CUSTOM X</p>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6 hover:bg-white/20 transition-all duration-300 hover:-translate-y-1 text-white">
              <Coins className="h-10 w-10 mx-auto mb-3 text-white" />
              <p className="text-sm font-bold tracking-wider text-white">METAL IQ</p>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 p-6 hover:bg-white/20 transition-all duration-300 hover:-translate-y-1 text-white">
              <Bot className="h-10 w-10 mx-auto mb-3 text-white" />
              <p className="text-sm font-bold tracking-wider text-white">AI AGENT</p>
            </Card>
          </div>

          <div className="flex items-center justify-center gap-3 mt-12">
            <Shield className="h-5 w-5 text-white/80" />
            <p className="text-sm opacity-80 uppercase tracking-wider font-semibold">Trusted by Jewelers Worldwide</p>
          </div>
        </div>
      </div>
      
      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="bg-primary p-5 rounded-3xl shadow-lg mb-4">
              <img src={iconBlackBg} alt="Aurezo" className="h-20 w-20 object-contain" />
            </div>
            <h1 className="text-4xl font-bold gradient-text">Aurezo</h1>
          </div>

          <Card className="p-8 shadow-luxury border-border bg-card text-card-foreground">
            <div className="mb-6">
              <h2 className="text-3xl font-semibold mb-2 text-foreground">{portalInfo.title}</h2>
              <p className="text-muted-foreground">{portalInfo.subtitle}</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              {lockoutStatus?.locked && (
                <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Account Temporarily Locked</p>
                    <p className="text-muted-foreground mt-1">
                      Too many failed login attempts. Please{' '}
                      <Link to="/forgot-password" className="text-primary hover:underline">
                        reset your password
                      </Link>{' '}
                      or try again later.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-base font-medium text-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  maxLength={255}
                  autoComplete="email"
                  className="h-12 text-base focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-base font-medium text-foreground">Password</Label>
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    className="h-12 text-base focus:ring-2 focus:ring-primary pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  height: '48px',
                  fontSize: '16px',
                  fontWeight: 500,
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                Sign In
              </button>
            </form>

            <SigningInDialog open={loading} />

            {portalInfo.showSignup && (
              <div className="mt-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{' '}
                  <Link to="/signup" className="text-primary font-medium hover:underline">
                    Sign up
                  </Link>
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
