import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminImpersonation } from "@/contexts/AdminImpersonationContext";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Search, Pin } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";


interface Client {
  id: string;
  company_name: string;
  email: string;
  status: string;
  logo_url: string | null;
  user_id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  plan: {
    name: string;
  } | null;
}

const SubAccounts = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [pinnedClients, setPinnedClients] = useState<string[]>([]);
  const { startImpersonation, stopImpersonation, isImpersonating } = useAdminImpersonation();
  const navigate = useNavigate();

  useEffect(() => {
    fetchClients();
    loadPinnedClients();
  }, []);

  const loadPinnedClients = () => {
    try {
      const stored = localStorage.getItem('admin_pinned_clients');
      if (stored) {
        setPinnedClients(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load pinned clients:', error);
    }
  };

  // Select only non-sensitive columns - exclude encrypted tokens
  const ADMIN_CLIENTS_COLUMNS = `
    id, agency_id, user_id, company_name, email, logo_url, status, plan_id,
    shopify_store_url, created_at, subscription_ends_at, branding_config,
    address_line1, address_line2, city, state, postal_code, country,
    plan:subscription_plans(name)
  `;

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select(ADMIN_CLIENTS_COLUMNS)
        .order("company_name");

      if (error) throw error;
      setClients((data || []) as unknown as Client[]);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    
    const query = searchQuery.toLowerCase();
    return clients.filter(
      (client) =>
        client.company_name.toLowerCase().includes(query) ||
        client.email.toLowerCase().includes(query) ||
        client.city?.toLowerCase().includes(query) ||
        client.state?.toLowerCase().includes(query)
    );
  }, [clients, searchQuery]);

  const sortedClients = useMemo(() => {
    const pinned = filteredClients.filter(c => pinnedClients.includes(c.id));
    const unpinned = filteredClients.filter(c => !pinnedClients.includes(c.id));
    return [...pinned, ...unpinned];
  }, [filteredClients, pinnedClients]);

  const togglePin = (clientId: string) => {
    const newPinned = pinnedClients.includes(clientId)
      ? pinnedClients.filter(id => id !== clientId)
      : [...pinnedClients, clientId];
    
    setPinnedClients(newPinned);
    try {
      localStorage.setItem('admin_pinned_clients', JSON.stringify(newPinned));
    } catch (error) {
      console.error('Failed to save pinned clients:', error);
    }
  };

  const handleImpersonate = (client: Client) => {
    startImpersonation(client.id, client.company_name);
    toast.success(`Now viewing as ${client.company_name}`);
    // Navigate to embedded client view within admin portal
    navigate("/admin/view-as/dashboard");
  };

  const handleSwitchToAgencyView = () => {
    if (isImpersonating) {
      stopImpersonation();
    }
    navigate("/admin/dashboard");
    toast.success("Returned to agency view");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatAddress = (client: Client) => {
    if (client.city && client.state) {
      const parts = [
        client.address_line1,
        client.city,
        client.state
      ].filter(Boolean);
      return parts.join(", ");
    }
    return client.email;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto py-8 px-4">
          <Skeleton className="h-12 w-full mb-6" />
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
          <Input
            placeholder="Search for a sub-account"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 text-base border-2 focus:border-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground text-2xl"
            >
              ×
            </button>
          )}
        </div>

        {/* Switch to Agency View Button */}
        <Button
          onClick={handleSwitchToAgencyView}
          variant="ghost"
          className="mb-8 -ml-2 text-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Switch to Agency View
        </Button>

        {/* ALL ACCOUNTS Header */}
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            ALL ACCOUNTS ({sortedClients.length})
          </h2>
        </div>

        {/* Clients List */}
        <div className="space-y-2">
          {sortedClients.map((client) => (
            <Card
              key={client.id}
              className="hover:shadow-md transition-all cursor-pointer border-2 hover:border-primary/50 group"
              onClick={() => handleImpersonate(client)}
            >
              <div className="flex items-center gap-4 p-4">
                {/* Avatar */}
                <Avatar className="h-12 w-12 flex-shrink-0">
                  <AvatarImage src={client.logo_url || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getInitials(client.company_name)}
                  </AvatarFallback>
                </Avatar>

                {/* Company Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base text-foreground truncate">
                    {client.company_name}
                  </h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {formatAddress(client)}
                  </p>
                </div>

                {/* Pin Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(client.id);
                  }}
                  className="flex-shrink-0 p-2 hover:bg-accent rounded-md transition-colors"
                >
                  <Pin
                    className={`h-5 w-5 transition-colors ${
                      pinnedClients.includes(client.id)
                        ? "fill-primary text-primary"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                </button>
              </div>
            </Card>
          ))}
        </div>

        {/* No Results State */}
        {sortedClients.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-2">No sub-accounts found</p>
            {searchQuery && (
              <Button
                variant="link"
                onClick={() => setSearchQuery("")}
                className="text-primary"
              >
                Clear search
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubAccounts;
