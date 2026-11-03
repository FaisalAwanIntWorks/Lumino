import { supabase } from '@/integrations/supabase/client';

/**
 * Tiny in-memory stale-while-revalidate cache for dashboard tabs.
 * Pages seed their state from the last result so switching tabs renders
 * instantly, then refresh in the background. Lives only for the browser
 * session (cleared on full reload); keys always include the client/user id
 * so accounts never see each other's data.
 */
const pageCache = new Map<string, unknown>();

export function getPageCache<T>(key: string | null | undefined): T | undefined {
  if (!key) return undefined;
  return pageCache.get(key) as T | undefined;
}

export function setPageCache<T>(key: string | null | undefined, value: T): void {
  if (!key) return;
  pageCache.set(key, value);
}

export function clearPageCache(): void {
  pageCache.clear();
  ownClientIdByUser.clear();
}

const ownClientIdByUser = new Map<string, Promise<string | null>>();

/**
 * Resolve the `clients.id` owned by a user, once per session.
 * Failed lookups are not cached so the next call retries.
 */
export function resolveOwnClientId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return Promise.resolve(null);
  const existing = ownClientIdByUser.get(userId);
  if (existing) return existing;
  const pending = (async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data?.id as string | undefined) ?? null;
  })();
  ownClientIdByUser.set(userId, pending);
  pending.then(
    (id) => { if (!id) ownClientIdByUser.delete(userId); },
    () => ownClientIdByUser.delete(userId),
  );
  return pending;
}
