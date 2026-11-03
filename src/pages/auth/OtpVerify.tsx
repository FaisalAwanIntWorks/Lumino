import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Bot, Shield, LayoutGrid, Coins, ArrowLeft, Mail, RefreshCw } from 'lucide-react';
import { SigningInDialog } from '@/components/auth/SigningInDialog';
import iconBlackBg from '@/assets/branding/icon-black-bg-v2.png';
import { getPortalType, PRODUCTION_DOMAINS } from '@/lib/domain-config';
import { logSecurityEvent } from '@/lib/audit-utils';
import { resolveRoleForPortal, type UserRole } from '@/lib/auth-utils';

const RESEND_COOLDOWN = 60;

export default function OtpVerify() {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [canResend, setCanResend] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const email = searchParams.get('email') || '';
  const portalType = getPortalType(window.location.hostname);

  // Redirect back to login if no email provided
  useEffect(() => {
    if (!email) {
      navigate('/login', { replace: true });
    }
  }, [email, navigate]);

  // Start countdown timer on mount
  useEffect(() => {
    startResendTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startResendTimer = () => {
    setCanResend(false);
    setResendCooldown(RESEND_COOLDOWN);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Auto-verify when all 6 digits are entered
  useEffect(() => {
    if (otp.length === 6) {
      handleVerify(otp);
    }
  }, [otp]);

  const handlePostLoginRedirect = async (userId: string) => {
    // Fetch ALL roles — a user may have several (e.g. client + staff).
    // Using .maybeSingle() here would 406 and leave userRole undefined,
    // causing the redirect to silently fall through.
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const roles = (roleRows || []).map((r) => r.role as UserRole);
    const userRole = resolveRoleForPortal(roles);

    if (portalType === 'admin' && userRole !== 'agency_admin') {
      await supabase.auth.signOut();
      await logSecurityEvent('wrong_portal_login', {
        attemptedPortal: 'admin',
        userRole,
        email,
      }, 'warning');
      toast({
        variant: 'destructive',
        title: 'Access Denied',
        description: 'This portal is for administrators only. Please use vault.jewlx.ai',
      });
      return;
    }

    if (portalType === 'client' && userRole === 'agency_admin') {
      await supabase.auth.signOut();
      toast({ title: 'Wrong Portal', description: 'Please use admin.jewlx.ai for admin access.' });
      window.location.href = `https://${PRODUCTION_DOMAINS.admin}/login`;
      return;
    }

    if (userRole === 'client') {
      const { data: clientData } = await supabase
        .from('clients')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();
      if (clientData?.status === 'inactive') {
        await supabase.auth.signOut();
        toast({
          variant: 'destructive',
          title: 'Account Deactivated',
          description: 'Your account has been deactivated. Please contact support.',
        });
        return;
      }
    }

    if (userRole === 'staff') {
      const { data: staffData } = await supabase
        .from('staff_members')
        .select('status, client_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (staffData?.status === 'inactive') {
        await supabase.auth.signOut();
        toast({
          variant: 'destructive',
          title: 'Account Deactivated',
          description: 'Your account has been deactivated. Please contact your administrator.',
        });
        return;
      }

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
            description: 'Your company account has been deactivated.',
          });
          return;
        }
      }
    }

    toast({ title: 'Welcome back!', description: 'Successfully signed in.' });

    if (userRole === 'agency_admin') {
      window.location.href = '/admin/dashboard';
    } else {
      window.location.href = '/dashboard';
    }
  };

  const handleVerify = async (code: string) => {
    if (!email || code.length !== 6) return;
    setLoading(true);

    try {
      // Step 1: Verify OTP via edge function — returns a token_hash on success
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-login-otp', {
        body: { email, otp: code },
      });

      if (verifyError) throw verifyError;
      if (!verifyData?.success || !verifyData?.token_hash) {
        throw new Error(verifyData?.error || 'Verification failed');
      }

      // Step 2: Exchange token_hash for a real Supabase session
      const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: verifyData.token_hash,
        type: 'magiclink',
      });

      if (sessionError) throw sessionError;

      if (sessionData.user) {
        await handlePostLoginRedirect(sessionData.user.id);
      }
    } catch (error: any) {
      setOtp('');
      const msg = error.message || '';
      toast({
        variant: 'destructive',
        title: 'Verification Failed',
        description: msg.includes('expired')
          ? 'This code has expired. Please request a new one.'
          : msg.includes('Incorrect')
          ? 'The code you entered is incorrect. Please try again.'
          : msg || 'Could not verify code. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend || !email) return;

    try {
      const { error } = await supabase.functions.invoke('send-login-otp', {
        body: { email },
      });

      if (error) throw error;

      toast({ title: 'Code Sent', description: 'A new verification code has been sent to your email.' });
      setOtp('');
      startResendTimer();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to Resend',
        description: 'Could not resend code. Please try again.',
      });
    }
  };

  const maskedEmail = email
    ? email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(Math.max(b.length, 3)) + c)
    : '';

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />

        <div className="relative text-center text-white space-y-8 z-10">
          <div className="flex justify-center mb-8 animate-float">
            <div className="bg-primary-dark p-6 rounded-3xl shadow-2xl">
              <img src={iconBlackBg} alt="JewlX" className="h-28 w-28 object-contain" />
            </div>
          </div>

          <h1 className="text-6xl font-bold mb-4 drop-shadow-lg">JewlX</h1>
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

      {/* Right side - OTP Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="bg-primary p-5 rounded-3xl shadow-lg mb-4">
              <img src={iconBlackBg} alt="JewlX" className="h-20 w-20 object-contain" />
            </div>
            <h1 className="text-4xl font-bold gradient-text">JewlX</h1>
          </div>

          <Card className="p-8 shadow-luxury border-border bg-card text-card-foreground">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="bg-primary/10 rounded-full p-4">
                <Mail className="h-8 w-8 text-primary" />
              </div>
            </div>

            <div className="mb-8 text-center">
              <h2 className="text-3xl font-semibold mb-2 text-foreground">Check Your Email</h2>
              <p className="text-muted-foreground text-sm">
                We sent a 6-digit verification code to
              </p>
              <p className="text-foreground font-medium mt-1">{maskedEmail}</p>
            </div>

            <div className="space-y-6">
              {/* OTP Input */}
              <div className="flex flex-col items-center gap-4">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={setOtp}
                  disabled={loading}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="h-14 w-12 text-xl border-border" />
                    <InputOTPSlot index={1} className="h-14 w-12 text-xl border-border" />
                    <InputOTPSlot index={2} className="h-14 w-12 text-xl border-border" />
                    <InputOTPSlot index={3} className="h-14 w-12 text-xl border-border" />
                    <InputOTPSlot index={4} className="h-14 w-12 text-xl border-border" />
                    <InputOTPSlot index={5} className="h-14 w-12 text-xl border-border" />
                  </InputOTPGroup>
                </InputOTP>

                <p className="text-xs text-muted-foreground text-center">
                  Enter the code to automatically verify
                </p>
              </div>

              {/* Verify Button */}
              <button
                onClick={() => handleVerify(otp)}
                disabled={loading || otp.length !== 6}
                style={{
                  width: '100%',
                  height: '48px',
                  fontSize: '16px',
                  fontWeight: 500,
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading || otp.length !== 6 ? 'not-allowed' : 'pointer',
                  opacity: loading || otp.length !== 6 ? 0.5 : 1,
                }}
              >
                Verify Code
              </button>

              {/* Resend */}
              <div className="text-center">
                {canResend ? (
                  <button
                    onClick={handleResend}
                    className="flex items-center gap-2 mx-auto text-sm text-primary hover:underline font-medium"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Resend Code
                  </button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Resend code in{' '}
                    <span className="font-medium text-foreground tabular-nums">{resendCooldown}s</span>
                  </p>
                )}
              </div>

              {/* Back to login */}
              <div className="text-center">
                <Link
                  to="/login"
                  className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Login
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <SigningInDialog open={loading} />
    </div>
  );
}
