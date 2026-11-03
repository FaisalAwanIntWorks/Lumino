import { supabase } from '@/integrations/supabase/client';

const CACHE_PREFIX = 'jewelx_product_cache_';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Get cached products for a client
 */
export async function getCachedProducts(clientId: string) {
  const cacheKey = `${CACHE_PREFIX}${clientId}`;
  
  try {
    // Check localStorage cache
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      const entry: CacheEntry<any> = JSON.parse(cached);
      const age = Date.now() - entry.timestamp;
      
      // Return cached data if still fresh
      if (age < CACHE_TTL) {
        console.log(`[Cache HIT] Products for client ${clientId} (age: ${Math.round(age / 1000)}s)`);
        return entry.data;
      } else {
        console.log(`[Cache EXPIRED] Products for client ${clientId}`);
      }
    }
  } catch (err) {
    console.error('Error reading cache:', err);
  }

  // Cache miss or expired - fetch from database
  console.log(`[Cache MISS] Fetching products for client ${clientId}`);
  
  const { data, error } = await supabase
    .from('client_products')
    .select(`
      *,
      products (*),
      product_variations (*)
    `)
    .eq('client_id', clientId)
    .eq('is_enabled', true);

  if (error) {
    console.error('Error fetching products:', error);
    throw error;
  }

  // Store in cache
  try {
    const cacheEntry: CacheEntry<any> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    console.log(`[Cache SET] Cached ${data?.length || 0} products for client ${clientId}`);
  } catch (err) {
    console.error('Error writing cache:', err);
  }

  return data;
}

/**
 * Invalidate product cache for a client
 */
export function invalidateProductCache(clientId: string) {
  const cacheKey = `${CACHE_PREFIX}${clientId}`;
  localStorage.removeItem(cacheKey);
  console.log(`[Cache INVALIDATE] Cleared cache for client ${clientId}`);
}

/**
 * Clear all product caches
 */
export function clearAllProductCaches() {
  const keys = Object.keys(localStorage);
  let cleared = 0;
  
  keys.forEach(key => {
    if (key.startsWith(CACHE_PREFIX)) {
      localStorage.removeItem(key);
      cleared++;
    }
  });
  
  console.log(`[Cache CLEAR] Cleared ${cleared} product caches`);
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const keys = Object.keys(localStorage);
  const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
  
  const stats = cacheKeys.map(key => {
    try {
      const entry: CacheEntry<any> = JSON.parse(localStorage.getItem(key) || '{}');
      const age = Date.now() - entry.timestamp;
      const clientId = key.replace(CACHE_PREFIX, '');
      
      return {
        clientId,
        age: Math.round(age / 1000),
        expired: age >= CACHE_TTL,
        recordCount: entry.data?.length || 0,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  return {
    totalCaches: cacheKeys.length,
    caches: stats,
  };
}
