import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, ArrowRight, Users, Store, FileText } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePageSearchContext } from '@/contexts/PageSearchContext';
import { useClientFeatures } from '@/hooks/useClientFeatures';
import { getClientNavItems } from '@/lib/client-nav-config';
import { canView, staffCanSeeLeads } from '@/lib/staff-permissions';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutDashboard, Package, Settings, Database, Bell, Upload, Bug,
  ShoppingCart, Eye, Code, Bot, TrendingUp, Gem, CalendarDays, Ruler, Calculator
} from 'lucide-react';

interface SearchItem {
  label: string;
  href: string;
  icon: React.ElementType;
  keywords: string[];
}

interface DbSearchResult {
  label: string;
  href: string;
  icon: React.ElementType;
  type: string;
}

const adminSearchItems: SearchItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, keywords: ['overview', 'home', 'stats', 'analytics'] },
  { label: 'Clients', href: '/admin/clients', icon: Users, keywords: ['users', 'jewelers', 'accounts', 'sub-accounts'] },
  { label: 'Products', href: '/admin/products', icon: Package, keywords: ['rings', 'catalog', 'inventory', 'master', 'diamonds'] },
  { label: 'CAD Design Requests', href: '/admin/cad-requests', icon: Gem, keywords: ['cad', 'design', 'resize', 'requests', 'custom'] },
  { label: 'Quote Estimator Previews', href: '/admin/quote-estimator-previews', icon: Eye, keywords: ['quote', 'estimator', 'theme', 'glass', 'preview', 'share', 'link', 'dtt'] },
  { label: 'AI Wallet', href: '/admin/ai-cost-calculator', icon: Calculator, keywords: ['ai', 'wallet', 'credits', 'billing', 'usage', 'cost'] },
  
  { label: 'Settings', href: '/admin/settings', icon: Settings, keywords: ['config', 'email', 'branding', 'preferences', 'staff', 'api', 'security'] },
];

export function DashboardSearch() {
  const { role, staffInfo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pageItems, pageName } = usePageSearchContext();
  const { features, clientId } = useClientFeatures();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dbResults, setDbResults] = useState<DbSearchResult[]>([]);
  const [dbSearching, setDbSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isAdmin = role === 'agency_admin';

  // Derive client search items dynamically from nav config
  const dynamicClientItems = useMemo((): SearchItem[] => {
    if (isAdmin) return [];
    const permissions = staffInfo?.permissions as Record<string, string | boolean | undefined> | undefined;
    const hasCatalogAccess = role !== 'staff' || canView(permissions?.catalog_access);
    const hasCustomXAccess = role !== 'staff' || canView(permissions?.custom_x_access);
    const hasLeadsAccess = role !== 'staff' || !!permissions?.leads_access;
    const hasStaffViewAccess = role !== 'staff' || canView(permissions?.catalog_access) || canView(permissions?.custom_x_access) || !!permissions?.leads_access;
    const hasMetalIQAccess = role !== 'staff' || canView(permissions?.metal_buying_access);

    const sections = getClientNavItems({
      routePrefix: '/dashboard',
      role: role,
      hasCatalogAccess,
      hasCustomXAccess,
      hasLeadsAccess,
      hasStaffViewAccess,
      hasMetalIQAccess,
      features,
      clientId,
      hideLeads: role === 'staff' && !staffCanSeeLeads(permissions),
    });

    const items: SearchItem[] = [];
    for (const section of sections) {
      for (const item of section.items ?? []) {
        if (item.locked) continue;
        items.push({ label: item.label, href: item.href, icon: item.icon, keywords: [section.section.toLowerCase()] });
      }
      for (const group of section.groups ?? []) {
        for (const item of group.items) {
          if (item.locked) continue;
          items.push({ label: item.label, href: item.href, icon: item.icon, keywords: [group.subSection.toLowerCase(), section.section.toLowerCase()] });
        }
      }
    }
    return items;
  }, [isAdmin, role, staffInfo, features, clientId]);

  const navItems = isAdmin ? adminSearchItems : dynamicClientItems;
  const hasPageItems = pageItems.length > 0;

  // DB search for admin - search clients by company name
  const searchDb = useCallback(async (q: string) => {
    if (!isAdmin || q.length < 2) {
      setDbResults([]);
      return;
    }
    setDbSearching(true);
    try {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, company_name')
        .ilike('company_name', `%${q}%`)
        .limit(5);

      const results: DbSearchResult[] = [];
      if (clients) {
        for (const c of clients) {
          results.push({
            label: c.company_name || 'Unnamed',
            href: `/admin/clients/${c.id}`,
            icon: Store,
            type: 'Client',
          });
        }
      }
      setDbResults(results);
    } catch {
      setDbResults([]);
    } finally {
      setDbSearching(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length >= 2) {
      debounceRef.current = setTimeout(() => searchDb(query.trim()), 300);
    } else {
      setDbResults([]);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchDb]);

  const filteredPageItems = useMemo(() => {
    if (!hasPageItems) return [];
    if (!query.trim()) return pageItems.slice(0, 15);
    const q = query.toLowerCase();
    return pageItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    ).slice(0, 15);
  }, [query, pageItems, hasPageItems]);

  const filteredNavItems = useMemo(() => {
    if (!query.trim()) return navItems;
    const q = query.toLowerCase();
    return navItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.keywords.some(k => k.includes(q))
    );
  }, [query, navItems]);

  const showPageResults = hasPageItems;
  const totalResults = (showPageResults ? filteredPageItems.length : 0) + filteredNavItems.length + dbResults.length;

  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setOpen(false); setQuery(''); }, [location.pathname]);

  const handleSelectNav = (href: string) => {
    navigate(href);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleSelectPage = (action: () => void) => {
    action();
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, totalResults - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      let idx = selectedIndex;
      if (showPageResults) {
        if (idx < filteredPageItems.length) {
          handleSelectPage(filteredPageItems[idx].action);
          return;
        }
        idx -= filteredPageItems.length;
      }
      if (idx < filteredNavItems.length) {
        handleSelectNav(filteredNavItems[idx].href);
        return;
      }
      idx -= filteredNavItems.length;
      if (idx < dbResults.length) {
        handleSelectNav(dbResults[idx].href);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm lg:max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={hasPageItems ? `Search ${pageName || 'this page'}…` : 'Search…'}
          className="pl-9 h-9 text-sm bg-muted/50 border-border/50 focus:bg-background"
        />
      </div>

      {open && totalResults > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 overflow-hidden max-h-80 overflow-y-auto">
          {showPageResults && filteredPageItems.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                {pageName || 'This Page'}
              </div>
              {filteredPageItems.map((item, i) => (
                <button
                  key={`page-${i}`}
                  onClick={() => handleSelectPage(item.action)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    selectedIndex === i ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                  }`}
                >
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.description && <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{item.description}</span>}
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
              ))}
            </>
          )}

          {filteredNavItems.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                Navigation
              </div>
              {filteredNavItems.map((item, i) => {
                const globalIdx = (showPageResults ? filteredPageItems.length : 0) + i;
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    onClick={() => handleSelectNav(item.href)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      selectedIndex === globalIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </>
          )}

          {dbResults.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                Clients
              </div>
              {dbResults.map((item, i) => {
                const globalIdx = (showPageResults ? filteredPageItems.length : 0) + filteredNavItems.length + i;
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    onClick={() => handleSelectNav(item.href)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      selectedIndex === globalIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground">{item.type}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
