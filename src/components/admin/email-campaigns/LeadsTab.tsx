import { stickyHeaderTableClass } from "@/components/ui/table";
import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/browser';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { guessMapping, prepareLeads, slugifyKey, STANDARD_LEAD_FIELDS } from '@/lib/marketing-email';

type Row = Record<string, unknown>;
const db = supabase as any;

export function LeadsTab() {
  const { canWrite } = useAdminAccess();
  const [lists, setLists] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [leadCount, setLeadCount] = useState(0);
  const [search, setSearch] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [listChoice, setListChoice] = useState<string>('new');
  const [newListName, setNewListName] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data: l } = await db.from('marketing_lists').select('id, name, created_at, marketing_list_members(count)').order('created_at', { ascending: false });
    setLists(l ?? []);
    let q = db.from('marketing_leads').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(100);
    if (search.trim()) q = q.or(`email.ilike.%${search.trim()}%,company.ilike.%${search.trim()}%,first_name.ilike.%${search.trim()}%`);
    const { data, count } = await q;
    setLeads(data ?? []);
    setLeadCount(count ?? 0);
  };
  useEffect(() => { load(); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (file: File) => {
    try {
      let parsed: Row[] = [];
      let hdrs: string[] = [];
      if (/\.xlsx$/i.test(file.name)) {
        const sheet: any[][] = await readSheet(file) as any;
        hdrs = (sheet[0] ?? []).map((h) => String(h ?? '').trim()).filter(Boolean);
        parsed = sheet.slice(1).map((r) => Object.fromEntries(hdrs.map((h, i) => [h, r[i] ?? ''])));
      } else {
        const res = Papa.parse<Row>(await file.text(), { header: true, skipEmptyLines: true });
        hdrs = (res.meta.fields ?? []).filter(Boolean);
        parsed = res.data;
      }
      if (!hdrs.length || !parsed.length) { toast.error('No rows found in that file.'); return; }
      setHeaders(hdrs);
      setRows(parsed);
      setMapping(guessMapping(hdrs));
      if (!newListName) setNewListName(file.name.replace(/\.[^.]+$/, ''));
    } catch (e: any) {
      toast.error('Could not read the file: ' + (e?.message ?? e));
    }
  };

  const preview = useMemo(() => (rows.length ? prepareLeads(rows, mapping) : null), [rows, mapping]);
  const hasEmail = Object.values(mapping).includes('email');

  const doImport = async () => {
    if (!preview || !hasEmail) return;
    setUploading(true);
    try {
      let added = 0, existing = 0, suppressed = 0, invalid = preview.invalid;
      let listId: string | null = listChoice === 'new' ? null : listChoice;
      const chunks = 2000;
      for (let i = 0; i < preview.leads.length; i += chunks) {
        const { data, error } = await supabase.functions.invoke('marketing-import-leads', {
          body: { leads: preview.leads.slice(i, i + chunks), list_id: listId, list_name: listId ? undefined : newListName || 'Untitled list' },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        listId = data.list_id;
        added += data.added; existing += data.existing; suppressed += data.suppressed; invalid += data.invalid;
      }
      toast.success(`Added ${added} new leads. ${existing + preview.duplicatesInFile} duplicates merged, ${invalid} invalid skipped${suppressed ? `, ${suppressed} previously unsubscribed/bounced (won't be emailed)` : ''}.`, { duration: 9000 });
      setRows([]); setHeaders([]); setNewListName(''); setListChoice('new');
      load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload leads</CardTitle>
            <CardDescription>CSV or Excel (.xlsx). Every email is checked for duplicates against all existing leads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-center gap-2 border border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-muted/40 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" /> Choose a file
              <input type="file" accept=".csv,.xlsx,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>

            {headers.length > 0 && (
              <>
                <div>
                  <p className="text-sm font-medium mb-2">Map columns ({rows.length} rows)</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {headers.map((h) => (
                      <div key={h} className="flex items-center gap-2 border border-border rounded-md p-2">
                        <span className="text-xs truncate flex-1" title={h}>{h}</span>
                        <Select value={mapping[h]} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                          <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STANDARD_LEAD_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                            <SelectItem value={`custom:${slugifyKey(h) || 'field'}`}>variable: {slugifyKey(h) || 'field'}</SelectItem>
                            <SelectItem value="ignore">ignore</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  {!hasEmail && <p className="text-xs text-destructive mt-2">Map one column to email.</p>}
                  <p className="text-xs text-muted-foreground mt-2">
                    Use in emails as {'{{first_name}}'}, {'{{company}}'}, or any variable name, with a fallback: {'{{first_name|there}}'}.
                  </p>
                </div>
                {preview && hasEmail && (
                  <p className="text-sm text-muted-foreground">
                    {preview.leads.length} unique valid · {preview.duplicatesInFile} duplicates in file · {preview.invalid} invalid
                  </p>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Add to list</Label>
                    <Select value={listChoice} onValueChange={setListChoice}>
                      <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New list</SelectItem>
                        {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {listChoice === 'new' && (
                    <div className="space-y-1">
                      <Label className="text-xs">List name</Label>
                      <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} className="w-[240px]" />
                    </div>
                  )}
                  <Button onClick={doImport} disabled={!hasEmail || uploading || !preview?.leads.length}>
                    {uploading ? 'Uploading…' : `Import ${preview?.leads.length ?? 0} leads`}
                  </Button>
                  <Button variant="ghost" onClick={() => { setRows([]); setHeaders([]); }}>Cancel</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Lists</CardTitle></CardHeader>
        <CardContent>
          {lists.length === 0 ? <p className="text-sm text-muted-foreground">No lists yet.</p> : (
            <div className="flex flex-wrap gap-2">
              {lists.map((l) => (
                <Badge key={l.id} variant="outline" className="text-sm py-1">
                  {l.name} · {l.marketing_list_members?.[0]?.count ?? 0}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Leads ({leadCount})</CardTitle>
          <Input placeholder="Search email, name or company" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Variables</TableHead><TableHead>Status</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm">{l.email}</TableCell>
                  <TableCell className="text-sm">{[l.first_name, l.last_name].filter(Boolean).join(' ')}</TableCell>
                  <TableCell className="text-sm">{l.company}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{Object.keys(l.custom_fields ?? {}).join(', ')}</TableCell>
                  <TableCell><Badge variant={l.status === 'subscribed' ? 'secondary' : 'outline'}>{l.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {leadCount > 100 && <p className="text-xs text-muted-foreground mt-2">Showing latest 100. Use search to find others.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
