import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, Layers, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PlanRow {
  plan_id: string;
  plan_name: string;
  price_monthly: number;
  chat_quota: number;
  image_quota: number;
  chat_rpm: number;
  image_rpm: number;
  cost_estimate_rpm: number;
  defaults_id: string | null;
  dirty: boolean;
}

const EMPTY_NEW_PLAN = {
  plan_name: '',
  price_monthly: 0,
  chat_quota: 2000,
  image_quota: 100,
  chat_rpm: 32,
  image_rpm: 7,
  cost_estimate_rpm: 10,
};

export function PlanManager() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlanRow | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newPlan, setNewPlan] = useState(EMPTY_NEW_PLAN);
  const [addingSaving, setAddingSaving] = useState(false);
  const { toast } = useToast();

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const { data: spData, error: spError } = await supabase
        .from('subscription_plans')
        .select('id, name, price_monthly')
        .order('price_monthly', { ascending: true });

      if (spError) throw spError;

      const { data: padData, error: padError } = await supabase
        .from('plan_ai_defaults' as any)
        .select('*');

      if (padError) throw padError;

      const padMap = new Map((padData || []).map((d: any) => [d.plan_id, d]));

      const merged: PlanRow[] = (spData || []).map((sp: any) => {
        const pad = padMap.get(sp.id) as any;
        return {
          plan_id: sp.id,
          plan_name: sp.name,
          price_monthly: Number(sp.price_monthly),
          chat_quota: pad?.chat_quota ?? 2000,
          image_quota: pad?.image_quota ?? 100,
          chat_rpm: pad?.chat_rpm ?? 32,
          image_rpm: pad?.image_rpm ?? 7,
          cost_estimate_rpm: pad?.cost_estimate_rpm ?? 10,
          defaults_id: pad?.id ?? null,
          dirty: false,
        };
      });

      setPlans(merged);
    } catch (err: any) {
      toast({ title: 'Error loading plans', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlans(); }, []);

  const updateField = (planId: string, field: keyof PlanRow, value: number | string) => {
    setPlans(prev =>
      prev.map(p => p.plan_id === planId ? { ...p, [field]: value, dirty: true } : p)
    );
  };

  const savePlan = async (plan: PlanRow) => {
    setSaving(plan.plan_id);
    try {
      const { error: spError } = await supabase
        .from('subscription_plans')
        .update({
          name: plan.plan_name,
          price_monthly: plan.price_monthly,
        })
        .eq('id', plan.plan_id);

      if (spError) throw spError;

      const { error: padError } = await supabase
        .from('plan_ai_defaults' as any)
        .upsert({
          ...(plan.defaults_id ? { id: plan.defaults_id } : {}),
          plan_id: plan.plan_id,
          chat_quota: plan.chat_quota,
          image_quota: plan.image_quota,
          chat_rpm: plan.chat_rpm,
          image_rpm: plan.image_rpm,
          cost_estimate_rpm: plan.cost_estimate_rpm,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'plan_id' });

      if (padError) throw padError;

      setPlans(prev => prev.map(p => p.plan_id === plan.plan_id ? { ...p, dirty: false } : p));
      toast({ title: 'Plan saved', description: `"${plan.plan_name}" updated successfully` });
    } catch (err: any) {
      toast({ title: 'Error saving plan', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const deletePlan = async (plan: PlanRow) => {
    setDeleting(plan.plan_id);
    try {
      // Delete defaults first (FK dependency)
      await supabase.from('plan_ai_defaults' as any).delete().eq('plan_id', plan.plan_id);

      const { error } = await supabase
        .from('subscription_plans')
        .delete()
        .eq('id', plan.plan_id);

      if (error) throw error;

      setPlans(prev => prev.filter(p => p.plan_id !== plan.plan_id));
      toast({ title: 'Plan deleted', description: `"${plan.plan_name}" has been removed` });
    } catch (err: any) {
      toast({ title: 'Error deleting plan', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  };

  const addPlan = async () => {
    if (!newPlan.plan_name.trim()) {
      toast({ title: 'Plan name required', variant: 'destructive' });
      return;
    }
    setAddingSaving(true);
    try {
      const { data: spData, error: spError } = await supabase
        .from('subscription_plans')
        .insert({
          name: newPlan.plan_name.trim(),
          price_monthly: newPlan.price_monthly,
          features: '[]',
          // Legacy column still NOT NULL on the live DB (drop migration never
          // applied); send 0 so the insert succeeds. Commission is unused.
          commission_rate: 0,
        } as any)
        .select('id')
        .single();

      if (spError) throw spError;

      // The trg_ensure_plan_ai_defaults trigger already inserts a
      // plan_ai_defaults row for every new plan, so upsert to overwrite it
      // with the values entered in the dialog instead of colliding on plan_id.
      const { error: padError } = await supabase
        .from('plan_ai_defaults' as any)
        .upsert({
          plan_id: (spData as any).id,
          chat_quota: newPlan.chat_quota,
          image_quota: newPlan.image_quota,
          chat_rpm: newPlan.chat_rpm,
          image_rpm: newPlan.image_rpm,
          cost_estimate_rpm: newPlan.cost_estimate_rpm,
        } as any, { onConflict: 'plan_id' });

      if (padError) {
        // Don't leave a half-created plan behind.
        await supabase.from('subscription_plans').delete().eq('id', (spData as any).id);
        throw padError;
      }

      toast({ title: 'Plan created', description: `"${newPlan.plan_name}" added` });
      setShowAddDialog(false);
      setNewPlan(EMPTY_NEW_PLAN);
      await fetchPlans();
    } catch (err: any) {
      toast({ title: 'Error creating plan', description: err.message, variant: 'destructive' });
    } finally {
      setAddingSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Subscription Plan Manager</CardTitle>
                <CardDescription>
                  Edit plan prices, quotas, and rate limits. Changes reflect instantly for all clients on that plan.
                </CardDescription>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Plan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>Plan Name</TableHead>
                <TableHead className="text-right">Price / mo</TableHead>
                <TableHead className="text-center">Chat Quota</TableHead>
                <TableHead className="text-center">Image Quota</TableHead>
                <TableHead className="text-center">Chat RPM</TableHead>
                <TableHead className="text-center">Image RPM</TableHead>
                <TableHead className="text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.plan_id}>
                  <TableCell>
                    <Input
                      value={plan.plan_name}
                      onChange={(e) => updateField(plan.plan_id, 'plan_name', e.target.value)}
                      className="h-8 w-36 text-sm font-medium"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="relative inline-flex items-center">
                      <span className="absolute left-2.5 text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={plan.price_monthly}
                        onChange={(e) => updateField(plan.plan_id, 'price_monthly', Math.max(0, Number(e.target.value)))}
                        className="h-8 w-28 text-right text-sm pl-5"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      value={plan.chat_quota}
                      onChange={(e) => updateField(plan.plan_id, 'chat_quota', Math.max(0, Number(e.target.value)))}
                      className="h-8 w-24 text-center text-sm mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      value={plan.image_quota}
                      onChange={(e) => updateField(plan.plan_id, 'image_quota', Math.max(0, Number(e.target.value)))}
                      className="h-8 w-20 text-center text-sm mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      value={plan.chat_rpm}
                      onChange={(e) => updateField(plan.plan_id, 'chat_rpm', Math.max(1, Number(e.target.value)))}
                      className="h-8 w-16 text-center text-sm mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      value={plan.image_rpm}
                      onChange={(e) => updateField(plan.plan_id, 'image_rpm', Math.max(1, Number(e.target.value)))}
                      className="h-8 w-16 text-center text-sm mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant={plan.dirty ? 'default' : 'ghost'}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => savePlan(plan)}
                        disabled={!plan.dirty || saving === plan.plan_id}
                        title="Save plan"
                      >
                        {saving === plan.plan_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(plan)}
                        disabled={deleting === plan.plan_id}
                        title="Delete plan"
                      >
                        {deleting === plan.plan_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-[11px] text-muted-foreground mt-3">
            Price and quota changes are reflected immediately. Clients already on a plan inherit updated defaults unless they have custom overrides set in Client Quota Manager.
          </p>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.plan_name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this plan and its AI quota defaults. Clients currently on this plan will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deletePlan(deleteTarget)}
            >
              Delete Plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Plan Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Subscription Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Plan Name</Label>
                <Input
                  value={newPlan.plan_name}
                  onChange={(e) => setNewPlan(p => ({ ...p, plan_name: e.target.value }))}
                  placeholder="e.g. Pro"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price / month ($)</Label>
                <Input
                  type="number"
                  value={newPlan.price_monthly}
                  onChange={(e) => setNewPlan(p => ({ ...p, price_monthly: Math.max(0, Number(e.target.value)) }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Chat Quota / mo</Label>
                <Input
                  type="number"
                  value={newPlan.chat_quota}
                  onChange={(e) => setNewPlan(p => ({ ...p, chat_quota: Math.max(0, Number(e.target.value)) }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Image Quota / mo</Label>
                <Input
                  type="number"
                  value={newPlan.image_quota}
                  onChange={(e) => setNewPlan(p => ({ ...p, image_quota: Math.max(0, Number(e.target.value)) }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Chat RPM</Label>
                <Input
                  type="number"
                  value={newPlan.chat_rpm}
                  onChange={(e) => setNewPlan(p => ({ ...p, chat_rpm: Math.max(1, Number(e.target.value)) }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Image RPM</Label>
                <Input
                  type="number"
                  value={newPlan.image_rpm}
                  onChange={(e) => setNewPlan(p => ({ ...p, image_rpm: Math.max(1, Number(e.target.value)) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setNewPlan(EMPTY_NEW_PLAN); }}>
              Cancel
            </Button>
            <Button onClick={addPlan} disabled={addingSaving}>
              {addingSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Create Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
