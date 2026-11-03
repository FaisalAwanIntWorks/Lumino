import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Package, ShoppingBag, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';

interface SearchResults {
  clients: any[];
  products: any[];
  orders: any[];
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({ clients: [], products: [], orders: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { impersonatedClientId } = useAdminImpersonation();

  // Compute open state
  const open = query.length >= 2 && inputFocused;

  useEffect(() => {
    if (query.length < 2) {
      setResults({ clients: [], products: [], orders: [] });
      return;
    }

    const timer = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [query, user?.id, role, impersonatedClientId]);

  const performSearch = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const searchTerm = `%${query.toLowerCase()}%`;
      const isAgency = role === 'agency_admin' && !impersonatedClientId;

      // Search clients (agency only)
      let clientsData = [];
      if (isAgency) {
        const { data } = await supabase
          .from('clients')
          .select('id, company_name, email, logo_url, status')
          .or(`company_name.ilike.${searchTerm},email.ilike.${searchTerm}`)
          .limit(5);
        clientsData = data || [];
      }

      // Search products
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name, description, base_cost, image_urls, category')
        .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
        .limit(5);

      // Search orders
      const clientId = impersonatedClientId || (isAgency ? null : user.id);
      let ordersQuery = supabase
        .from('orders')
        .select('id, customer_name, customer_email, total_amount, status, created_at')
        .or(`customer_name.ilike.${searchTerm},customer_email.ilike.${searchTerm},id.ilike.${searchTerm}`)
        .limit(5);

      if (clientId) {
        ordersQuery = ordersQuery.eq('client_id', clientId);
      }

      const { data: ordersData } = await ordersQuery;

      setResults({
        clients: clientsData,
        products: productsData || [],
        orders: ordersData || [],
      });
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClientSelect = (clientId: string) => {
    if (role === 'agency_admin') {
      navigate(`/admin/clients/${clientId}`);
    } else {
      navigate('/dashboard');
    }
    handleClose();
  };

  const handleProductSelect = (productId: string) => {
    navigate(`/product/${productId}`);
    handleClose();
  };

  const handleOrderSelect = (orderId: string) => {
    const isAgency = role === 'agency_admin' && !impersonatedClientId;
    if (isAgency) {
      navigate(`/admin/orders?search=${orderId}`);
    } else {
      navigate(`/dashboard/orders?search=${orderId}`);
    }
    handleClose();
  };

  const handleClose = () => {
    setQuery('');
    setInputFocused(false);
    inputRef.current?.blur();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const totalResults = results.clients.length + results.products.length + results.orders.length;

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleClose();
      }
    }}>
      <PopoverTrigger asChild>
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search clients, products, orders..."
            className="pl-10 pr-10 bg-background/50 border-border"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleClose();
              }
            }}
          />
          {query && (
            <button
              onClick={handleClose}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-0 bg-popover border-border shadow-lg"
        align="start"
        sideOffset={8}
      >
        <Command>
          <CommandList>
            {loading && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Searching...
              </div>
            )}
            
            {!loading && query.length >= 2 && totalResults === 0 && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}

            {!loading && results.clients.length > 0 && (
              <CommandGroup heading={
                <div className="flex items-center justify-between">
                  <span>Clients</span>
                  <Badge variant="secondary" className="text-xs">{results.clients.length}</Badge>
                </div>
              }>
                {results.clients.map((client) => (
                  <CommandItem
                    key={client.id}
                    onSelect={() => handleClientSelect(client.id)}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {getInitials(client.company_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{client.company_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                    </div>
                    <User className="h-4 w-4 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!loading && results.products.length > 0 && (
              <CommandGroup heading={
                <div className="flex items-center justify-between">
                  <span>Products</span>
                  <Badge variant="secondary" className="text-xs">{results.products.length}</Badge>
                </div>
              }>
                {results.products.map((product) => (
                  <CommandItem
                    key={product.id}
                    onSelect={() => handleProductSelect(product.id)}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                  >
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                    </div>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!loading && results.orders.length > 0 && (
              <CommandGroup heading={
                <div className="flex items-center justify-between">
                  <span>Orders</span>
                  <Badge variant="secondary" className="text-xs">{results.orders.length}</Badge>
                </div>
              }>
                {results.orders.map((order) => (
                  <CommandItem
                    key={order.id}
                    onSelect={() => handleOrderSelect(order.id)}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                  >
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                      <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{order.customer_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{order.customer_email}</p>
                    </div>
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
