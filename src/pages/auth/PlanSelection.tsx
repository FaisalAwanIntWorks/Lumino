import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Check, Gem, Star, Mail, Loader2 } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  tagline: string | null;
  price_monthly: number;
  price_note: string | null;
  features: string[];
  cta_text: string | null;
  is_highlighted: boolean;
  stripe_price_id: string | null;
  payment_link_url: string | null;
  display_order: number;
}

export default function PlanSelection() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    const fetchPlans = async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, name, tagline, price_monthly, price_note, features, cta_text, is_highlighted, stripe_price_id, payment_link_url, display_order')
        .eq('is_visible', true)
        .order('display_order', { ascending: true });

      if (error) {
        toast({ variant: 'destructive', title: 'Error loading plans', description: error.message });
      } else {
        setPlans(
          (data || []).map((p: any) => ({
            ...p,
            features: Array.isArray(p.features) ? p.features : [],
          }))
        );
      }
      setLoadingPlans(false);
    };

    fetchPlans();
  }, []);

  const handleSelectPlan = async (plan: Plan) => {
    if (!plan.stripe_price_id) {
      window.location.href =
        'mailto:sales@jewlx.ai?subject=' + encodeURIComponent(plan.name + ' Plan Inquiry');
      return;
    }

    // Logged-out visitors → Stripe Payment Link (auto-onboards new account on payment)
    if (!user && plan.payment_link_url) {
      setCheckoutLoading(plan.id);
      window.location.href = plan.payment_link_url;
      return;
    }

    setCheckoutLoading(plan.id);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { plan_name: plan.name },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data?.error || 'No checkout URL returned');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error starting checkout',
        description: error.message,
      });
      setCheckoutLoading(null);
    }
  };

  const gridCols =
    plans.length <= 2
      ? 'md:grid-cols-2'
      : plans.length === 3
      ? 'md:grid-cols-3'
      : 'md:grid-cols-2 xl:grid-cols-4';

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="bg-primary/10 p-4 rounded-2xl w-fit mx-auto mb-4">
            <Gem className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Choose Your Plan</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Choose the plan that fits your business. Cancel anytime.
          </p>
        </div>

        {loadingPlans ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className={`grid grid-cols-1 ${gridCols} gap-6`}>
            {plans.map((plan) => {
              const isContactSales = !plan.stripe_price_id;
              const isThisLoading = checkoutLoading === plan.id;

              return (
                <Card
                  key={plan.id}
                  className={`p-6 flex flex-col relative ${
                    plan.is_highlighted ? 'border-primary border-2 shadow-lg shadow-primary/10' : ''
                  }`}
                >
                  {plan.is_highlighted && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                      <Star className="h-3 w-3 mr-1" /> Most Popular
                    </Badge>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                    {plan.tagline && (
                      <p className="text-sm text-muted-foreground mt-1">{plan.tagline}</p>
                    )}
                  </div>

                  <div className="mb-6">
                    <span className="text-3xl font-bold text-foreground">
                      ${plan.price_monthly.toLocaleString()}
                    </span>
                    {plan.price_note && (
                      <p className="text-xs text-muted-foreground mt-1">{plan.price_note}</p>
                    )}
                  </div>

                  <ul className="space-y-2.5 mb-8 flex-1">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isThisLoading}
                    variant={
                      plan.is_highlighted ? 'default' : isContactSales ? 'outline' : 'secondary'
                    }
                    className="w-full"
                    size="lg"
                  >
                    {isContactSales && !isThisLoading && <Mail className="h-4 w-4 mr-2" />}
                    {isThisLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Redirecting...
                      </>
                    ) : (
                      plan.cta_text || (isContactSales ? 'Request a Call' : `Get ${plan.name}`)
                    )}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
