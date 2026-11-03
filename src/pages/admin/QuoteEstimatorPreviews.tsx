import { stickyHeaderTableClass } from "@/components/ui/table";
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getQuoteEstimatorThemePreviewUrl, getQuoteEstimatorVersionPreviewUrl } from '@/lib/diamond-form-embed';
import { DEFAULT_QUOTE_THEME, isQuoteLabClient, isQuoteTheme, QUOTE_THEME_META, type QuoteTheme } from '@/lib/quote-estimator-theme';

/**
 * One place to grab a shareable Quote Estimator Theme 2 · Glass preview link
 * for every account, so each jeweler can review the new look on their own
 * form (their colours, copy and option images) before it goes live.
 *
 * A preview link renders the real public form with `?quoteTheme=glass`:
 * nothing entered on it is saved, emailed, synced to the CRM or sent to ad
 * pixels, and it opens from a messenger or email client without the account's
 * domain whitelist. Read-only: this page never changes an account.
 */

interface PreviewRow {
  id: string;
  company_name: string;
  email: string | null;
  status: string | null;
  quoteEstimatorEnabled: boolean;
  liveTheme: QuoteTheme;
  isLab: boolean;
}

async function fetchPreviewRows(): Promise<PreviewRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Same scoping as the Clients page: staff with explicit client access only
  // see those accounts; everyone else sees all.
  let allowedClientIds: string[] | null = null;
  const { data: adminStaff } = await supabase
    .from('admin_staff_members')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminStaff) {
    const { data: accessData } = await supabase
      .from('admin_staff_client_access')
      .select('client_id')
      .eq('admin_staff_id', adminStaff.id);
    if (accessData && accessData.length > 0) {
      allowedClientIds = accessData.map((a) => a.client_id);
    }
  }

  let query = supabase
    .from('clients')
    .select('id, company_name, email, status, enabled_features')
    .order('company_name');
  if (allowedClientIds !== null) query = query.in('id', allowedClientIds);
  const { data: clients, error } = await query;
  if (error) throw error;

  // The saved theme lives in the V2 settings row (public-read, like the embed).
  const { data: configs } = await supabase
    .from('client_dtt_form_config')
    .select('client_id, form_content');
  const themeByClient = new Map<string, QuoteTheme>();
  for (const row of (configs || []) as { client_id: string; form_content: unknown }[]) {
    const saved = (row.form_content as { quoteTheme?: unknown } | null)?.quoteTheme;
    themeByClient.set(row.client_id, isQuoteTheme(saved) ? saved : DEFAULT_QUOTE_THEME);
  }

  type ClientRow = { id: string; company_name: string | null; email: string | null; status: string | null; enabled_features: unknown };
  return ((clients || []) as ClientRow[]).map((c) => {
    const features = (c.enabled_features || {}) as Record<string, boolean>;
    return {
      id: c.id,
      company_name: c.company_name || 'Unnamed account',
      email: c.email ?? null,
      status: c.status ?? null,
      // Mirrors the public form's gate: the Quote Estimator only loads when
      // dtt_v2 is explicitly on, so a preview link for other accounts shows
      // "not enabled" until the module is switched on for them.
      quoteEstimatorEnabled: features.dtt_v2 === true,
      liveTheme: themeByClient.get(c.id) ?? DEFAULT_QUOTE_THEME,
      isLab: isQuoteLabClient(c.id),
    };
  });
}

/** Theme 2 preview for an account; the Sandbox lab previews its V2 directly. */
function theme2PreviewUrl(row: PreviewRow): string {
  return row.isLab
    ? getQuoteEstimatorVersionPreviewUrl(row.id, 'v2')
    : getQuoteEstimatorThemePreviewUrl(row.id, 'glass');
}

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error('Could not copy', { description: text });
  }
}

export default function QuoteEstimatorPreviews() {
  const [search, setSearch] = useState('');
  const [onlyEnabled, setOnlyEnabled] = useState(true);
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['admin-quote-estimator-previews'],
    queryFn: fetchPreviewRows,
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyEnabled && !r.quoteEstimatorEnabled) return false;
      if (!q) return true;
      return r.company_name.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q) || r.id.includes(q);
    });
  }, [rows, search, onlyEnabled]);

  const enabledCount = rows.filter((r) => r.quoteEstimatorEnabled).length;

  const copyAll = () => {
    const lines = visible.map((r) => `${r.company_name} — ${theme2PreviewUrl(r)}`);
    if (!lines.length) return;
    void copyText(lines.join('\n'), `${lines.length} preview link${lines.length === 1 ? '' : 's'} copied`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Quote Estimator Previews</h1>
        <p className="text-sm text-muted-foreground">
          Shareable Theme 2 · Glass preview link for every account. Each link opens that account's own form (its
          colours, copy and option images) in the new theme. Nothing entered on a preview is saved, emailed, synced
          to the CRM or sent to ads, and the account's live theme is not changed.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company, email or account id"
              className="pl-8"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={onlyEnabled} onChange={(e) => setOnlyEnabled(e.target.checked)} />
            Only accounts with the Quote Estimator enabled ({enabledCount}/{rows.length})
          </label>
          <Button variant="outline" size="sm" onClick={copyAll} disabled={!visible.length}>
            <Copy className="h-4 w-4 mr-1" />Copy all {visible.length} links
          </Button>
        </div>
      </Card>

      <Card>
        {error ? (
          <p className="p-6 text-sm text-destructive">Could not load accounts. Please refresh and try again.</p>
        ) : isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading accounts…</p>
        ) : !visible.length ? (
          <p className="p-6 text-sm text-muted-foreground">No accounts match.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table containerClassName={stickyHeaderTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Quote Estimator</TableHead>
                  <TableHead>Live theme</TableHead>
                  <TableHead>Theme 2 · Glass preview link</TableHead>
                  <TableHead className="text-right">Theme 1</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => {
                  const url = theme2PreviewUrl(row);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{row.company_name}</div>
                        {row.email && <div className="text-xs text-muted-foreground">{row.email}</div>}
                        {row.status && row.status !== 'active' && (
                          <Badge variant="outline" className="mt-1 text-[10px]">{row.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.quoteEstimatorEnabled
                          ? <Badge variant="secondary">Enabled</Badge>
                          : <Badge variant="outline" title="Turn on the Quote Estimator for this account under Settings → Client Features before sharing the link.">Not enabled</Badge>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {row.isLab
                          ? <span className="text-muted-foreground">Sandbox lab</span>
                          : `${QUOTE_THEME_META[row.liveTheme].label} · ${QUOTE_THEME_META[row.liveTheme].title}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[320px]">
                          <Input readOnly value={url} className="h-8 text-xs font-mono bg-muted" onFocus={(e) => e.currentTarget.select()} />
                          <Button variant="outline" size="sm" className="h-8" onClick={() => void copyText(url, `${row.company_name}: Theme 2 preview link copied`)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8" asChild>
                            <a href={url} target="_blank" rel="noopener noreferrer" title="Open preview in a new tab">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.isLab ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-8" asChild>
                            <a href={getQuoteEstimatorThemePreviewUrl(row.id, 'classic')} target="_blank" rel="noopener noreferrer">Open</a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
