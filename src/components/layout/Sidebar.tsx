import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, X, Lock, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import iconTransparent from '@/assets/branding/icon-transparent-v2.png';
import { ThemedLogo } from '@/components/common/ThemedLogo';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface SidebarItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  locked?: boolean;
}

interface SidebarSubSection {
  subSection: string;
  icon?: React.ComponentType<{ className?: string }>;
  items: SidebarItem[];
}

interface SidebarSection {
  section?: string;
  items?: SidebarItem[];
  groups?: SidebarSubSection[];
}

interface SidebarProps {
  items: SidebarSection[];
  footer?: React.ReactNode;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onNavClick?: (href: string) => boolean;
}
function renderSidebarItem(
  item: SidebarItem,
  location: ReturnType<typeof useLocation>,
  collapsed: boolean,
  onLinkClick?: () => void,
  isSubSectionItem?: boolean,
  onNavClick?: (href: string) => boolean
) {
  const Icon = item.icon;
  const [hrefPath, hrefSearch] = item.href.split('?');
  const isActive = hrefSearch 
    ? location.pathname === hrefPath && location.search === `?${hrefSearch}`
    : location.pathname === item.href;
  const isLocked = item.locked === true;

  if (isLocked) {
    return (
      <li key={item.href}>
        <div
          className={cn(
            'group relative flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200',
            'text-muted-foreground/50 cursor-not-allowed overflow-hidden',
            collapsed && 'justify-center'
          )}
          title={`${item.label} is locked`}
        >
          <Icon className="h-[18px] w-[18px] shrink-0 relative z-10 opacity-40" />
          {!collapsed && (
            <>
              <span className="text-sm font-medium relative z-10 opacity-40 flex-1">
                {item.label}
              </span>
              <Lock className="h-4 w-4 shrink-0 relative z-10 opacity-60" />
            </>
          )}
        </div>
      </li>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    if (onNavClick?.(item.href)) {
      e.preventDefault();
      onLinkClick?.();
      return;
    }
    onLinkClick?.();
  };

  return (
    <li key={item.href}>
      <Link
        to={item.href.startsWith('#') ? '#' : item.href}
        onClick={handleClick}
        className={cn(
          'group relative flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200',
          'text-foreground overflow-hidden',
          isActive ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary' : 'hover:bg-muted',
          collapsed && 'justify-center'
        )}
      >
        {!isSubSectionItem && (
          <Icon className={cn(
            "h-[18px] w-[18px] shrink-0 relative z-10 transition-transform duration-200 group-hover:scale-110",
            isActive ? "text-primary-foreground" : "text-foreground"
          )} />
        )}
        {!collapsed && (
          <span className={cn(
            "text-sm font-medium relative z-10",
            isActive ? "text-primary-foreground" : isSubSectionItem ? "text-foreground/60" : "text-foreground"
          )}>
            {item.label}
          </span>
        )}
      </Link>
    </li>
  );
}

function SidebarContent({ items, collapsed, footer, onLinkClick, onNavClick }: { 
  items: SidebarSection[]; 
  collapsed: boolean; 
  footer?: React.ReactNode;
  onLinkClick?: () => void;
  onNavClick?: (href: string) => boolean;
}) {
  const location = useLocation();
  const { role } = useAuth();
  const logoHref = role === 'agency_admin' ? '/admin/dashboard' : '/dashboard';

  return (
    <>
      <div className="p-5 border-b border-border flex items-center justify-center relative">
        {!collapsed && (
          <Link to={logoHref} className="flex items-center justify-center group" onClick={onLinkClick}>
            <ThemedLogo className="h-14 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
          </Link>
        )}
        {collapsed && (
          <Link to={logoHref} className="flex items-center justify-center group" onClick={onLinkClick}>
            <img src={iconTransparent} alt="Aurezo" className="h-12 w-12 object-contain transition-transform duration-300 group-hover:scale-110" />
          </Link>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-6 scrollbar-hide">
        <div className="space-y-6 px-3">
          {items.map((group, idx) => (
            <div key={idx} className="animate-slide-in" style={{ animationDelay: `${idx * 0.1}s` }}>
              {group.section && !collapsed && (
                <div className="px-4 mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {group.section}
                  </p>
                </div>
              )}
              {/* Render top-level items */}
              {group.items && group.items.length > 0 && (
                <ul className="space-y-1">
                  {group.items.map((item) => renderSidebarItem(item, location, collapsed, onLinkClick, false, onNavClick))}
                </ul>
              )}
              {/* Render sub-section groups */}
              {group.groups?.map((sub, subIdx) => {
                const isSubActive = sub.items.some((item) => {
                  const [hrefPath, hrefSearch] = item.href.split('?');
                  return hrefSearch
                    ? location.pathname === hrefPath && location.search === `?${hrefSearch}`
                    : location.pathname === item.href;
                });

                if (collapsed && sub.icon) {
                  const firstItem = sub.items[0];
                  if (!firstItem) return null;
                  const SubIcon = sub.icon;
                  return (
                    <ul key={subIdx} className="space-y-1">
                      <li>
                        <Link
                          to={firstItem.href}
                          onClick={onLinkClick}
                          className={cn(
                            'group relative flex items-center justify-center px-4 py-2.5 rounded-lg transition-all duration-200',
                            'text-foreground overflow-hidden',
                            isSubActive ? 'bg-primary text-primary-foreground hover:bg-primary' : 'hover:bg-muted'
                          )}
                          title={sub.subSection}
                        >
                          <SubIcon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110", isSubActive ? "text-primary-foreground" : "text-foreground")} />
                        </Link>
                      </li>
                    </ul>
                  );
                }

                return (
                  <Collapsible key={subIdx} defaultOpen={isSubActive} className={subIdx === 0 && (!group.items || group.items.length === 0) ? 'mt-2' : 'mt-4'}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full px-4 mb-2 group/trigger cursor-pointer">
                      <div className="flex items-center gap-2">
                        {sub.icon && <sub.icon className="h-[18px] w-[18px] text-foreground" />}
                        <p className="text-sm font-semibold tracking-wide text-foreground">
                          {sub.subSection}
                        </p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-foreground stroke-[2] transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="space-y-1">
                        {sub.items.map((item) => renderSidebarItem(item, location, collapsed, onLinkClick, true, onNavClick))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      {footer && !collapsed && (
        <div className="p-4 border-t border-border">{footer}</div>
      )}
    </>
  );
}

export function Sidebar({ items, footer, mobileOpen, onMobileClose, onNavClick }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();

  // On mobile, use the Sheet component as a drawer
  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose?.()}>
        <SheetContent side="left" className="p-0 w-72 bg-card border-r border-border">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <div className="h-full flex flex-col">
            <SidebarContent 
              items={items} 
              collapsed={false} 
              footer={footer} 
              onLinkClick={onMobileClose}
              onNavClick={onNavClick}
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop sidebar
  return (
    <aside
      className={cn(
        'border-r border-border bg-card h-screen flex-col transition-all duration-300 relative hidden md:flex',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      <SidebarContent items={items} collapsed={collapsed} footer={footer} onNavClick={onNavClick} />
      
      <div className="absolute -right-3 top-20 z-10">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-6 w-6 rounded-full bg-card border border-border hover:bg-primary/10 shadow-md"
        >
          {collapsed ? <ChevronRight className="h-3 w-3 text-primary" /> : <ChevronLeft className="h-3 w-3 text-primary" />}
        </Button>
      </div>
    </aside>
  );
}
