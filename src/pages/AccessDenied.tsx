import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, ArrowLeft, LogIn } from 'lucide-react';
import iconBlackBg from '@/assets/branding/icon-black-bg-v2.png';
import { PRODUCTION_DOMAINS, getPortalType } from '@/lib/domain-config';
import EmbedMaintenanceScreen from '@/components/embed/EmbedMaintenanceScreen';

interface AccessDeniedProps {
  reason?: 'unauthorized' | 'wrong_portal' | 'inactive_account' | 'unauthorized_domain' | 'feature_disabled' | 'billing_paused';
  message?: string;
}

export default function AccessDenied({ reason = 'unauthorized', message }: AccessDeniedProps) {
  // Public embeds (widget inside a customer's site) get a calm "back shortly"
  // maintenance screen instead of the red-shield denial; portal reasons keep
  // the original page.
  if (reason === 'unauthorized_domain' || reason === 'feature_disabled' || reason === 'billing_paused') {
    // Some embeds still report a disabled module as `unauthorized_domain` with
    // a "not enabled" message; keep the tiny reference line accurate for them.
    const embedReason =
      reason === 'unauthorized_domain' && /not enabled/i.test(message ?? '') ? 'feature_disabled' : reason;
    return <EmbedMaintenanceScreen reason={embedReason} />;
  }

  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const portalType = getPortalType(hostname);
  
  const isProduction = typeof window !== 'undefined' && 
    (hostname === PRODUCTION_DOMAINS.admin || hostname === PRODUCTION_DOMAINS.client || hostname === PRODUCTION_DOMAINS.builder);

  const getContent = () => {
    switch (reason) {
      case 'wrong_portal':
        return {
          title: 'Wrong Portal',
          description: portalType === 'admin' 
            ? 'This portal is for administrators only. Please use the client portal to access your account.'
            : 'This portal is for clients and jewelers. Administrators should use the admin portal.',
          action: portalType === 'admin' 
            ? { label: 'Go to Client Portal', url: isProduction ? `https://${PRODUCTION_DOMAINS.client}/login` : '/login' }
            : { label: 'Go to Admin Portal', url: isProduction ? `https://${PRODUCTION_DOMAINS.admin}/login` : '/login' },
        };
      case 'inactive_account':
        return {
          title: 'Account Deactivated',
          description: 'Your account has been deactivated. Please contact your administrator for assistance.',
          action: { label: 'Back to Login', url: '/login' },
        };
      default:
        return {
          title: 'Access Denied',
          description: message || 'You do not have permission to access this page. Please log in with an authorized account.',
          action: { label: 'Go to Login', url: '/login' },
        };
    }
  };

  const content = getContent();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-destructive/5 to-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <img src={iconBlackBg} alt="JewlX" className="h-16 w-16 object-contain rounded-2xl" />
        </div>

        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <Shield className="h-10 w-10 text-destructive" />
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">{content.title}</h1>
          <p className="text-muted-foreground">{content.description}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-4">
          {content.action && (
            <Button asChild size="lg" className="gap-2">
              <a href={content.action.url}>
                <LogIn className="h-4 w-4" />
                {content.action.label}
              </a>
            </Button>
          )}
          
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
