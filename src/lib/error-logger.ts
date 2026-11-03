import { supabase } from "@/integrations/supabase/client";

export type ErrorSource = 'edge_function' | 'frontend' | 'database' | 'external_api';
export type ErrorType = 'network' | 'auth' | 'database' | 'validation' | 'timeout' | 'permission' | 'unknown';
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SystemErrorLog {
  error_source: ErrorSource;
  function_name: string;
  error_type: ErrorType;
  error_message: string;
  error_stack?: string;
  severity?: ErrorSeverity;
  client_id?: string;
  user_id?: string;
  endpoint?: string;
  request_metadata?: Record<string, unknown>;
}

// Batch errors to prevent flooding
const errorQueue: SystemErrorLog[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 2000; // 2 seconds
const MAX_QUEUE_SIZE = 10;

async function flushErrorQueue() {
  if (errorQueue.length === 0) return;

  const errors = [...errorQueue];
  errorQueue.length = 0;

  try {
    // Log errors in batch
    for (const error of errors) {
      await supabase.functions.invoke('log-system-error', {
        body: error
      });
    }
  } catch (e) {
    // Fallback to console if logging fails
    console.error('[ErrorLogger] Failed to flush errors:', e);
    errors.forEach(err => console.error('[ErrorLogger] Unflushed:', err));
  }
}

function scheduleFlush() {
  if (flushTimeout) return;
  
  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushErrorQueue();
  }, FLUSH_INTERVAL);
}

/**
 * Log a system error to the centralized monitoring system
 */
export async function logSystemError(error: SystemErrorLog): Promise<void> {
  // Add to queue
  errorQueue.push(error);

  // Flush immediately if queue is full or severity is critical
  if (errorQueue.length >= MAX_QUEUE_SIZE || error.severity === 'critical') {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    await flushErrorQueue();
  } else {
    scheduleFlush();
  }
}

/**
 * Create an error logger for a specific component/function
 */
export function createErrorLogger(functionName: string, defaultSource: ErrorSource = 'frontend') {
  return {
    log: (error: Omit<SystemErrorLog, 'function_name' | 'error_source'> & { error_source?: ErrorSource }) => 
      logSystemError({
        ...error,
        function_name: functionName,
        error_source: error.error_source || defaultSource,
      }),
    
    logError: (error: Error, additionalInfo?: Partial<SystemErrorLog>) =>
      logSystemError({
        function_name: functionName,
        error_source: defaultSource,
        error_type: 'unknown',
        error_message: error.message,
        error_stack: error.stack,
        ...additionalInfo,
      }),

    logNetworkError: (endpoint: string, status: number, message: string, additionalInfo?: Partial<SystemErrorLog>) =>
      logSystemError({
        function_name: functionName,
        error_source: defaultSource,
        error_type: 'network',
        error_message: `[${status}] ${message}`,
        endpoint,
        severity: status >= 500 ? 'high' : 'medium',
        ...additionalInfo,
      }),
  };
}

/**
 * Wrap a fetch call with automatic error logging
 */
export function createMonitoredFetch(functionName: string) {
  const logger = createErrorLogger(functionName);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const endpoint = typeof input === 'string' ? input : input.toString();
    const startTime = Date.now();

    try {
      const response = await fetch(input, init);
      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.clone().text().catch(() => 'Unable to read response');
        
        logger.logNetworkError(endpoint, response.status, errorText, {
          request_metadata: {
            method: init?.method || 'GET',
            duration,
          }
        });
      }

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Network request failed';

      logger.log({
        error_type: errorMessage.includes('timeout') ? 'timeout' : 'network',
        error_message: errorMessage,
        error_stack: error instanceof Error ? error.stack : undefined,
        endpoint,
        severity: 'high',
        request_metadata: {
          method: init?.method || 'GET',
          duration,
        }
      });

      throw error;
    }
  };
}

/**
 * Log edge function errors with proper context
 */
export function logEdgeFunctionError(
  functionName: string,
  error: Error | unknown,
  context?: {
    clientId?: string;
    userId?: string;
    endpoint?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  return logSystemError({
    error_source: 'edge_function',
    function_name: functionName,
    error_type: detectErrorType(errorMessage),
    error_message: errorMessage,
    error_stack: errorStack,
    severity: detectSeverity(errorMessage),
    client_id: context?.clientId,
    user_id: context?.userId,
    endpoint: context?.endpoint,
    request_metadata: context?.metadata,
  });
}

function detectErrorType(message: string): ErrorType {
  const lowercaseMessage = message.toLowerCase();
  
  if (lowercaseMessage.includes('timeout')) return 'timeout';
  if (lowercaseMessage.includes('network') || lowercaseMessage.includes('fetch')) return 'network';
  if (lowercaseMessage.includes('auth') || lowercaseMessage.includes('unauthorized')) return 'auth';
  if (lowercaseMessage.includes('permission') || lowercaseMessage.includes('forbidden')) return 'permission';
  if (lowercaseMessage.includes('database') || lowercaseMessage.includes('postgres') || lowercaseMessage.includes('supabase')) return 'database';
  if (lowercaseMessage.includes('validation') || lowercaseMessage.includes('invalid')) return 'validation';
  
  return 'unknown';
}

function detectSeverity(message: string): ErrorSeverity {
  const lowercaseMessage = message.toLowerCase();
  
  if (lowercaseMessage.includes('critical') || lowercaseMessage.includes('fatal')) return 'critical';
  if (lowercaseMessage.includes('timeout') || lowercaseMessage.includes('500') || lowercaseMessage.includes('internal')) return 'high';
  if (lowercaseMessage.includes('validation') || lowercaseMessage.includes('400')) return 'low';
  
  return 'medium';
}
