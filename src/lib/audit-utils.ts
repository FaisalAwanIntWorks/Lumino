import { supabase } from '@/integrations/supabase/client';

export type AuditSeverity = 'info' | 'warning' | 'critical';

interface AuditEventParams {
  action_type: string;
  resource_type?: string;
  resource_id?: string;
  changes?: Record<string, any>;
  severity?: AuditSeverity;
  metadata?: Record<string, any>;
}

export const logAuditEvent = async ({
  action_type,
  resource_type,
  resource_id,
  changes,
  severity = 'info',
  metadata,
}: AuditEventParams) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.warn('Cannot log audit event: No authenticated user');
      return;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    const { error } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      user_email: user.email,
      user_role: roleData?.role || 'unknown',
      action_type,
      resource_type,
      resource_id,
      changes,
      severity,
      metadata,
    });

    if (error) {
      console.error('Failed to log audit event:', error);
    }
  } catch (error) {
    console.error('Error logging audit event:', error);
  }
};

export const logSecurityEvent = async (
  event_type: string,
  details: Record<string, any>,
  severity: 'info' | 'warning' | 'critical' = 'warning'
) => {
  try {
    // Log security events to audit_logs instead of deleted security_events table
    const { data: { user } } = await supabase.auth.getUser();
    
    await logAuditEvent({
      action_type: `security:${event_type}`,
      severity,
      metadata: { ...details, email_attempted: user?.email },
    });
  } catch (error) {
    console.error('Error logging security event:', error);
  }
};

export const startImpersonationSession = async (
  adminUserId: string,
  clientId: string
) => {
  try {
    const { data, error } = await supabase
      .from('impersonation_sessions')
      .insert({
        admin_user_id: adminUserId,
        client_id: clientId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error starting impersonation session:', error);
    return null;
  }
};

export const endImpersonationSession = async (sessionId: string) => {
  try {
    const { data: session } = await supabase
      .from('impersonation_sessions')
      .select('started_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (session) {
      const duration = Math.floor(
        (new Date().getTime() - new Date(session.started_at).getTime()) / 1000
      );

      const { error } = await supabase
        .from('impersonation_sessions')
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
        })
        .eq('id', sessionId);

      if (error) throw error;
    }
  } catch (error) {
    console.error('Error ending impersonation session:', error);
  }
};

export const logUnauthorizedAccess = async (
  attemptType: 'route_access' | 'embed_domain' | 'role_mismatch' | 'session_hijack',
  details: {
    attemptedRoute?: string;
    expectedRole?: string;
    actualRole?: string;
    domain?: string;
    clientId?: string;
    subdomain?: string;
  }
) => {
  try {
    const eventType = `unauthorized_${attemptType}`;
    const severity = attemptType === 'session_hijack' ? 'critical' : 'warning';

    await logAuditEvent({
      action_type: eventType,
      severity: severity as AuditSeverity,
      metadata: {
        ...details,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
        hostname: window.location.hostname,
        pathname: window.location.pathname,
      },
    });
  } catch (error) {
    console.error('Error logging unauthorized access:', error);
  }
};
