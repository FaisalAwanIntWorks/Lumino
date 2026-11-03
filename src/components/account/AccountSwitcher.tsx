import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Clock, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { toast } from 'sonner';

interface AccountSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountSwitcher({ open, onOpenChange }: AccountSwitcherProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { impersonatedClientId, impersonatedClientName, startImpersonation, stopImpersonation, recentImpersonations } = useAdminImpersonation();

  useEffect(() => {
    if (open) {
      fetchClients();
    }
  }, [open, role, user?.id]);

  const fetchClients = async () => {
    try {
      if (role === 'agency_admin') {
        const { data } = await supabase
          .from('clients')
          .select('id, company_name, email, logo_url, city, state, user_id')
          .order('company_name');
        setClients(data || []);
      } else if (role === 'client') {
        const { data, error } = await supabase
          .from('clients')
          .select('id, company_name, email, logo_url, city, state, user_id')
          .eq('user_id', user?.id)
          .maybeSingle();
        if (error && error.code !== 'PGRST116') console.error('Error fetching client:', error);
        setClients(data ? [data] : []);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const cleanupTheme = () => {
    // Remove all custom CSS properties from document root to prevent theme bleeding
    const root = document.documentElement;
    const style = root.style;
    for (let i = style.length - 1; i >= 0; i--) {
      const prop = style[i];
      if (prop.startsWith('--')) {
        style.removeProperty(prop);
      }
    }
    // Remove glassmorphism injected styles
    const glassEl = document.getElementById('glass-ui-styles');
    if (glassEl) glassEl.remove();
    // Remove glass-ui class
    root.classList.remove('glass-ui');
  };

  const handleSwitchToAgency = () => {
    cleanupTheme();
    stopImpersonation();
    navigate('/admin/dashboard');
    onOpenChange(false);
    toast.success('Switched to agency view');
  };

  const handleClientSelect = (client: any) => {
    cleanupTheme();
    if (role === 'agency_admin') {
      startImpersonation(client.id, client.company_name);
      navigate('/dashboard');
      onOpenChange(false);
      toast.success(`Switched to ${client.company_name}`);
    } else {
      navigate('/dashboard');
      onOpenChange(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const filteredClients = clients.filter(client =>
    client.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const recentClients = recentImpersonations
    .map(recent => clients.find(c => c.id === recent.clientId))
    .filter(Boolean)
    .slice(0, 3);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 animate-scale-in">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl">Switch Account</DialogTitle>
          <DialogDescription>
            {role === 'agency_admin' ? 'Select a client account to manage' : 'Your account'}
          </DialogDescription>
        </DialogHeader>

        <Command className="border-t">
          <div className="px-3 py-2">
            <CommandInput
              placeholder="Search accounts..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="h-10"
            />
          </div>

          <CommandList className="max-h-[400px]">
            {role === 'agency_admin' && (
              <>
                {impersonatedClientId && (
                  <CommandGroup heading="Current View">
                    <CommandItem
                      onSelect={handleSwitchToAgency}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    >
                      <ArrowLeft className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">Switch to Agency View</p>
                        <p className="text-xs text-muted-foreground">
                          Currently viewing: {impersonatedClientName}
                        </p>
                      </div>
                    </CommandItem>
                  </CommandGroup>
                )}

                {!impersonatedClientId && (
                  <CommandGroup heading="Current View">
                    <CommandItem className="flex items-center gap-3 px-4 py-3 opacity-60 cursor-default">
                      <Building2 className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">Agency View</p>
                        <p className="text-xs text-muted-foreground">Viewing all accounts</p>
                      </div>
                    </CommandItem>
                  </CommandGroup>
                )}

                {recentClients.length > 0 && (
                  <CommandGroup heading="Recent">
                    {recentClients.map((client) => (
                      <CommandItem
                        key={client.id}
                        onSelect={() => handleClientSelect(client)}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={client.logo_url} />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(client.company_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-medium text-sm truncate">{client.company_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {client.city && client.state ? `${client.city}, ${client.state}` : client.email}
                          </p>
                        </div>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                <CommandGroup heading="All Clients">
                  {filteredClients.length === 0 ? (
                    <CommandEmpty className="py-6 text-center text-sm">
                      No clients found
                    </CommandEmpty>
                  ) : (
                    filteredClients.map((client) => (
                      <CommandItem
                        key={client.id}
                        onSelect={() => handleClientSelect(client)}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={client.logo_url} />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(client.company_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-medium text-sm truncate">{client.company_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {client.city && client.state ? `${client.city}, ${client.state}` : client.email}
                          </p>
                        </div>
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
              </>
            )}

            {role === 'client' && (
              <CommandGroup heading="Your Store">
                {filteredClients.map((client) => (
                  <CommandItem
                    key={client.id}
                    onSelect={() => handleClientSelect(client)}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={client.logo_url} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(client.company_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <p className="font-medium text-sm truncate">{client.company_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {client.city && client.state ? `${client.city}, ${client.state}` : client.email}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
