import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Eye, EyeOff, Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useClientDttFormConfig } from '@/hooks/useClientDttFormConfig';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getQuoteEstimatorVersionPreviewUrl } from '@/lib/diamond-form-embed';
import {
  QUOTE_VERSIONS,
  QUOTE_VERSION_META,
  quoteVersionName,
  resolveQuoteVersion,
  type QuoteVersion,
} from '@/lib/quote-estimator-version';
import { DttFormConfigure } from './DttFormConfigure';

/**
 * Sandbox lab only: one configuration panel per Quote Estimator version
 * (V1 · Classic, V2 · Glass, V3 · Atelier) with that version's preview docked
 * beside it. Each version keeps its own storage (see quoteVersionStorage), so
 * saving one never touches the others. The website — and therefore the embed
 * code, whose URL carries no version — always serves the version marked Live.
 */

/** Public test link for one version: renders its saved settings and never writes a lead. */
const quoteVersionPreviewUrl = (clientId: string, version: QuoteVersion) =>
  getQuoteEstimatorVersionPreviewUrl(clientId, version);

// Preview docks to the right of the panel only on very wide screens; below
// that it opens in a side sheet so the settings keep their full width.
const DOCK_QUERY = '(min-width: 1536px)';
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

const FRAME = {
  phone: { width: 390, height: 780 },
  desktop: { width: 1180, height: 860 },
} as const;

function VersionPreview({ clientId, version, live, reloadKey }: { clientId: string; version: QuoteVersion; live: boolean; reloadKey: number }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<keyof typeof FRAME>('phone');
  const [manualReload, setManualReload] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const url = quoteVersionPreviewUrl(clientId, version);
  const { width, height } = FRAME[mode];

  // Scale the fixed-width frame down to whatever width the column offers.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: `${quoteVersionName(version)} test link copied`, description: 'Anyone with the link can view the form. Nothing they enter is saved.' });
    } catch {
      toast({ title: 'Could not copy', description: url });
    }
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Preview · {quoteVersionName(version)}
            {live && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">Live</span>}
          </p>
          <p className="text-[11px] text-muted-foreground">Shows the saved {QUOTE_VERSION_META[version].label} settings and reloads after “Save Configuration”. Nothing entered here is saved or sent.</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded-md bg-muted p-0.5">
            <Button type="button" size="icon" variant={mode === 'phone' ? 'default' : 'ghost'} className="h-7 w-7" title="Phone layout" onClick={() => setMode('phone')}><Smartphone className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant={mode === 'desktop' ? 'default' : 'ghost'} className="h-7 w-7" title="Desktop layout" onClick={() => setMode('desktop')}><Monitor className="h-3.5 w-3.5" /></Button>
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Reload preview" onClick={() => setManualReload(n => n + 1)}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Copy test link" onClick={copyLink}><Copy className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Open in a new tab" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
          </Button>
        </div>
      </div>
      <div ref={frameRef} className="w-full overflow-hidden rounded-lg border bg-white" style={{ height: Math.round(height * scale) }}>
        <div className={mode === 'phone' ? 'mx-auto' : undefined} style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <iframe
            key={`${version}-${reloadKey}-${manualReload}`}
            title={`${quoteVersionName(version)} preview`}
            src={url}
            style={{ width, height, border: 0, display: 'block' }}
          />
        </div>
      </div>
    </Card>
  );
}

export function QuoteEstimatorVersionPanels({ clientId }: { clientId: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // V2 storage carries `live_version` for the whole account.
  const { data: liveConfig, isLoading } = useClientDttFormConfig(clientId);
  const liveVersion = resolveQuoteVersion(clientId, liveConfig?.live_version, null);
  const requested = searchParams.get('version');
  const [picked, setPicked] = useState<QuoteVersion | null>(
    QUOTE_VERSIONS.some(v => v === requested) ? (requested as QuoteVersion) : null,
  );
  // Opens on the live version unless the link names one (?version=v3).
  const version: QuoteVersion = picked ?? liveVersion;
  const [dirty, setDirty] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const docked = useMediaQuery(DOCK_QUERY);
  const [showDock, setShowDock] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);
  const onSaved = useCallback(() => setReloadKey(k => k + 1), []);

  const selectVersion = (v: QuoteVersion) => {
    if (v === version) return;
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setDirty(false);
    setPicked(v);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('version', v);
      return next;
    }, { replace: true });
  };

  const makeLive = async () => {
    if (!clientId) return;
    if (!window.confirm(`Make ${quoteVersionName(version)} live on your website? The embed code stays the same — it will start showing ${QUOTE_VERSION_META[version].label} straight away.`)) return;
    setSwitching(true);
    const { error } = await supabase.from('client_dtt_form_config').update({ live_version: version }).eq('client_id', clientId);
    if (error) {
      toast({ title: 'Could not switch live version', description: error.message, variant: 'destructive' });
    } else {
      await qc.invalidateQueries({ queryKey: ['client-dtt-form-config', clientId] });
      toast({ title: `${quoteVersionName(version)} is now live`, description: 'Your embedded form and the Embed Code tab now reflect this version.' });
    }
    setSwitching(false);
  };

  if (!clientId) return null;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading Quote Estimator versions…</p>;

  const meta = QUOTE_VERSION_META[version];
  const isLive = version === liveVersion;
  const dockOpen = docked && showDock;
  const preview = <VersionPreview clientId={clientId} version={version} live={isLive} reloadKey={reloadKey} />;
  const makeLiveReason = meta.testOnly
    ? 'V3 remains test-only until final images and submission checks are complete'
    : dirty ? 'Save your changes first' : undefined;

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Quote Estimator versions</h3>
          <p className="text-sm text-muted-foreground">
            Each version has its own settings and is saved separately. Your website — and the embed code — always show the version marked <span className="font-medium text-foreground">Live</span>.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3" role="tablist" aria-label="Quote Estimator version">
          {QUOTE_VERSIONS.map(v => {
            const m = QUOTE_VERSION_META[v];
            const selected = v === version;
            const live = v === liveVersion;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectVersion(v)}
                className={`rounded-lg border p-4 text-left transition-colors ${selected ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{m.label} · {m.title}</span>
                  <span className="flex shrink-0 gap-1">
                    {live && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">Live</span>}
                    {m.testOnly && !live && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Test only</span>}
                    {selected && <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">Editing</span>}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{m.description}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            You are configuring <span className="font-semibold text-foreground">{quoteVersionName(version)}</span>
            {isLive ? ' — this is what your website shows.' : ` — your website currently shows ${quoteVersionName(liveVersion)}.`}
          </span>
          {dirty && <span className="font-medium text-amber-600">Unsaved changes</span>}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {!isLive && (
              <Button type="button" size="sm" variant="outline" disabled={!!makeLiveReason || switching} title={makeLiveReason} onClick={makeLive}>
                Make {meta.label} live
              </Button>
            )}
            {docked ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowDock(s => !s)}>
                {showDock ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
                {showDock ? 'Hide preview' : 'Show preview'}
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
                <Eye className="mr-1.5 h-4 w-4" />Preview {meta.label}
              </Button>
            )}
          </span>
        </div>
      </Card>

      <div className={`grid items-start gap-6 ${dockOpen ? '2xl:grid-cols-[minmax(0,1fr)_420px]' : ''}`}>
        {/* Keyed by version so each panel hydrates from its own storage with a clean draft. */}
        <DttFormConfigure
          key={version}
          clientId={clientId}
          version={version}
          layout={dockOpen ? 'split' : 'full'}
          onDirtyChange={onDirtyChange}
          onSaved={onSaved}
        />
        {dockOpen && <div className="2xl:sticky 2xl:top-4">{preview}</div>}
      </div>

      {!docked && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>{quoteVersionName(version)} preview</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{preview}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
