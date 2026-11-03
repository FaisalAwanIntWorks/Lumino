/**
 * Global write guard for read-only admin staff.
 *
 * Only super admins (Faisal, Vikram, GSK) may change anything on the platform.
 * Every other agency admin is view-only on every screen, so instead of hunting
 * down each button in ~30 admin pages we intercept the Supabase client itself:
 * table writes, mutating RPCs, mutating edge functions and storage writes all
 * fail fast with a toast.
 *
 * This is the UX layer. The real enforcement lives in RLS
 * (jewlx_readonly_admin_no_* restrictive policies) and in the edge function
 * guard (_shared/admin-access.ts), both of which a devtools user cannot bypass.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- monkey-patching the
   Supabase client and proxying its builders is inherently untyped. */
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const READ_ONLY_MESSAGE =
  'View-only access. Only a Super Admin can make changes.';

let readOnly = false;
let installed = false;
let lastToastAt = 0;

export function setAdminReadOnly(value: boolean) {
  readOnly = value;
}

export function isAdminReadOnly() {
  return readOnly;
}

function notify() {
  const now = Date.now();
  // The same click can trip several calls - only surface one toast.
  if (now - lastToastAt < 1500) return;
  lastToastAt = now;
  toast.error(READ_ONLY_MESSAGE);
}

const readOnlyError = {
  message: READ_ONLY_MESSAGE,
  code: 'READ_ONLY_ADMIN',
  details: '',
  hint: 'Ask a Super Admin to perform this action.',
  name: 'ReadOnlyAdminError',
};

/**
 * A stand-in for a PostgrestFilterBuilder: any further chained call returns
 * itself, and awaiting it yields the standard `{ data, error }` shape so
 * existing `if (error) throw error` code paths keep working unchanged.
 */
function blockedResult() {
  const result = {
    data: null,
    error: readOnlyError,
    count: null,
    status: 403,
    statusText: 'Forbidden',
  };

  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: any, onRejected: any) =>
            Promise.resolve(result).then(onFulfilled, onRejected);
        }
        if (prop === 'catch') {
          return (onRejected: any) => Promise.resolve(result).catch(onRejected);
        }
        if (prop === 'finally') {
          return (onFinally: any) => Promise.resolve(result).finally(onFinally);
        }
        if (prop === Symbol.toStringTag) return 'Promise';
        // .select() / .eq() / .single() / ... keep chaining
        return () => proxy;
      },
    },
  );

  return proxy;
}

const TABLE_WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

/**
 * Writes a read-only admin must still be able to make: the append-only audit
 * trails (otherwise their logins and impersonations go unrecorded, and every
 * page view raises a toast) and their own notification read-state. Mirrors the
 * audit_insert_ok / audit_update_ok lists in the super_admin_readonly_staff
 * migration. Anything not listed here - DELETE included - stays blocked.
 */
const ALLOWED_WRITES: Record<string, ReadonlySet<string>> = {
  admin_activity_logs: new Set(['insert']),
  audit_logs: new Set(['insert']),
  client_activity_logs: new Set(['insert']),
  analytics_events: new Set(['insert']),
  impersonation_sessions: new Set(['insert', 'update']),
  admin_notifications: new Set(['update']),
};

const STORAGE_WRITE_METHODS = new Set([
  'upload',
  'uploadToSignedUrl',
  'update',
  'move',
  'copy',
  'remove',
  'createSignedUploadUrl',
]);

/**
 * Verbs that mean "this changes something". Matched against the hyphen /
 * underscore separated words of an edge function or RPC name, so
 * `unkey-create-key` and `mass_update_diamond_prices` are both caught while
 * `unkey-list-keys` and `get_client_branding` are not.
 */
const MUTATING_WORDS = new Set([
  'add',
  'apply',
  'approve',
  'archive',
  'assign',
  'backup',
  'cancel',
  'charge',
  'clear',
  'create',
  'credit',
  'debit',
  'delete',
  'deploy',
  'disable',
  'enable',
  'encrypt',
  'ensure',
  'export',
  'generate',
  'grant',
  'import',
  'insert',
  'issue',
  'mass',
  'merge',
  'migrate',
  'notify',
  'process',
  'purge',
  'push',
  'reconcile',
  'refund',
  'reject',
  'remove',
  'reset',
  'restore',
  'revoke',
  'save',
  'schedule',
  'seed',
  'send',
  'set',
  'snapshot',
  'submit',
  'swap',
  'sync',
  'toggle',
  'trigger',
  'update',
  'upload',
  'upsert',
]);

function isMutatingName(name: string) {
  return name
    .toLowerCase()
    .split(/[-_]/)
    .some((word) => MUTATING_WORDS.has(word));
}

/**
 * Patch the shared Supabase client once. Safe to call repeatedly; the guard
 * only does anything while `setAdminReadOnly(true)` is in effect.
 */
export function installAdminWriteGuard() {
  if (installed) return;
  installed = true;

  const client = supabase as any;

  // --- table writes ---------------------------------------------------------
  const originalFrom = client.from.bind(client);
  client.from = (table: string) => {
    const builder = originalFrom(table);
    if (!readOnly) return builder;

    const allowed = ALLOWED_WRITES[table];

    return new Proxy(builder, {
      get(target, prop, receiver) {
        const blocked =
          typeof prop === 'string' &&
          TABLE_WRITE_METHODS.has(prop) &&
          !allowed?.has(prop);

        if (blocked) {
          return () => {
            notify();
            return blockedResult();
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };

  // --- mutating RPCs --------------------------------------------------------
  const originalRpc = client.rpc.bind(client);
  client.rpc = (fn: string, args?: unknown, options?: unknown) => {
    if (readOnly && isMutatingName(fn)) {
      notify();
      return blockedResult();
    }
    return originalRpc(fn, args, options);
  };

  // --- mutating edge functions ---------------------------------------------
  const functions = client.functions;
  const originalInvoke = functions.invoke.bind(functions);
  functions.invoke = (name: string, options?: unknown) => {
    if (readOnly && isMutatingName(name)) {
      notify();
      return Promise.resolve({ data: null, error: readOnlyError });
    }
    return originalInvoke(name, options);
  };

  // --- storage writes -------------------------------------------------------
  const storage = client.storage;
  const originalStorageFrom = storage.from.bind(storage);
  storage.from = (bucket: string) => {
    const api = originalStorageFrom(bucket);
    if (!readOnly) return api;

    return new Proxy(api, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && STORAGE_WRITE_METHODS.has(prop)) {
          return () => {
            notify();
            return Promise.resolve({ data: null, error: readOnlyError });
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
}
