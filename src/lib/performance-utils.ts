import { supabase } from '@/integrations/supabase/client';

interface PerformanceMetric {
  endpoint: string;
  method?: string;
  duration_ms: number;
  status_code?: number;
  metadata?: Record<string, any>;
}

/**
 * Log performance metric to database
 */
export async function logPerformance(metric: PerformanceMetric) {
  try {
    // Only log if duration is significant (> 100ms) to reduce noise
    if (metric.duration_ms < 100) return;

    const { error } = await supabase
      .from('performance_logs' as any)
      .insert({
        endpoint: metric.endpoint,
        method: metric.method || 'GET',
        duration_ms: metric.duration_ms,
        status_code: metric.status_code,
        user_agent: navigator.userAgent,
        metadata: metric.metadata || {},
      });

    if (error) {
      console.error('Error logging performance:', error);
    }

    // Warn on slow queries
    if (metric.duration_ms > 1000) {
      console.warn(`[SLOW QUERY] ${metric.endpoint} took ${metric.duration_ms}ms`);
    }
  } catch (err) {
    // Silently fail - don't break the app
    console.error('Performance logging failed:', err);
  }
}

/**
 * Measure and log API call performance
 */
export async function measureApiCall<T>(
  endpoint: string,
  apiCall: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const startTime = performance.now();
  
  try {
    const result = await apiCall();
    const duration = performance.now() - startTime;
    
    await logPerformance({
      endpoint,
      duration_ms: Math.round(duration),
      status_code: 200,
      metadata,
    });
    
    return result;
  } catch (error: any) {
    const duration = performance.now() - startTime;
    
    await logPerformance({
      endpoint,
      duration_ms: Math.round(duration),
      status_code: 500,
      metadata: { error: error.message, ...metadata },
    });
    
    throw error;
  }
}

/**
 * Track page load performance
 */
export function trackPageLoad(pageName: string) {
  if (typeof window === 'undefined') return;

  // Use PerformanceObserver to track navigation timing
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        
        entries.forEach((entry: any) => {
          if (entry.entryType === 'navigation') {
            const loadTime = entry.loadEventEnd - entry.fetchStart;
            
            logPerformance({
              endpoint: pageName,
              method: 'PAGE_LOAD',
              duration_ms: Math.round(loadTime),
              metadata: {
                domContentLoaded: Math.round(entry.domContentLoadedEventEnd - entry.fetchStart),
                firstPaint: Math.round(entry.responseEnd - entry.fetchStart),
              },
            });
          }
        });
      });

      observer.observe({ entryTypes: ['navigation'] });
    } catch (err) {
      console.error('PerformanceObserver error:', err);
    }
  }
}

/**
 * Get performance statistics for admin dashboard
 */
export async function getPerformanceStats(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('performance_logs' as any)
    .select('*')
    .gte('timestamp', since.toISOString())
    .order('timestamp', { ascending: false });

  if (error || !data) {
    console.error('Error fetching performance stats:', error);
    return null;
  }

  // Calculate statistics
  const stats = {
    totalRequests: data.length,
    averageDuration: 0,
    p95Duration: 0,
    p99Duration: 0,
    slowestEndpoints: [] as any[],
    errorRate: 0,
  };

  if (data.length === 0) return stats;

  const logs = data as any[];

  // Average
  stats.averageDuration = Math.round(
    logs.reduce((sum, log) => sum + (log.duration_ms || 0), 0) / logs.length
  );

  // Percentiles
  const sorted = [...logs].sort((a, b) => (a.duration_ms || 0) - (b.duration_ms || 0));
  stats.p95Duration = sorted[Math.floor(sorted.length * 0.95)]?.duration_ms || 0;
  stats.p99Duration = sorted[Math.floor(sorted.length * 0.99)]?.duration_ms || 0;

  // Slowest endpoints
  const endpointStats = logs.reduce((acc: Record<string, any>, log) => {
    if (!acc[log.endpoint]) {
      acc[log.endpoint] = { count: 0, totalDuration: 0 };
    }
    acc[log.endpoint].count++;
    acc[log.endpoint].totalDuration += (log.duration_ms || 0);
    return acc;
  }, {});

  stats.slowestEndpoints = Object.entries(endpointStats)
    .map(([endpoint, data]: [string, any]) => ({
      endpoint,
      averageDuration: Math.round(data.totalDuration / data.count),
      requestCount: data.count,
    }))
    .sort((a, b) => b.averageDuration - a.averageDuration)
    .slice(0, 10);

  // Error rate
  const errors = logs.filter((log) => log.status_code && log.status_code >= 400).length;
  stats.errorRate = Math.round((errors / logs.length) * 100);

  return stats;
}
