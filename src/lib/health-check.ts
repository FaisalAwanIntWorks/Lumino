import { supabase } from '@/integrations/supabase/client';

export interface HealthCheckResult {
  ok: boolean;
  errorMessage?: string;
}

/**
 * Checks if the backend (Supabase) is reachable from the frontend.
 * Performs a lightweight query to verify connectivity.
 */
export async function checkBackendHealth(): Promise<HealthCheckResult> {
  try {
    // Lightweight query to test connectivity
    const { error } = await supabase
      .from('user_roles')
      .select('user_id')
      .limit(1);

    // Even if we get a 401/403 or data is empty, it means we reached the backend
    // Only network-level failures (TypeError: Load failed) indicate backend is unreachable
    if (error && error.message.includes('Load failed')) {
      return {
        ok: false,
        errorMessage: 'Cannot reach backend server. Please check your connection.',
      };
    }

    return { ok: true };
  } catch (err: any) {
    // Catch network-level errors
    if (err?.name === 'TypeError' || err?.message?.includes('Load failed')) {
      return {
        ok: false,
        errorMessage: 'Backend connection failed. Network error detected.',
      };
    }

    // Other errors still indicate we reached the backend
    return { ok: true };
  }
}
