import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAdminActivityLogger } from '@/hooks/useAdminActivityLogger';

export interface DeleteClientTarget {
  id: string;
  company_name: string;
  email: string;
}

interface DeleteClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: DeleteClientTarget | null;
  onDeleted?: () => void;
}

/**
 * Permanent client delete, guarded by a 6-digit OTP sent to the acting admin's email.
 * Removes all related rows, the client record and the auth user.
 */
export function DeleteClientDialog({ open, onOpenChange, client, onDeleted }: DeleteClientDialogProps) {
  const { logClientDelete } = useAdminActivityLogger();
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'otp'>('confirm');
  const [deleteOtp, setDeleteOtp] = useState('');
  const [sendingDeleteOtp, setSendingDeleteOtp] = useState(false);
  const [adminEmailForOtp, setAdminEmailForOtp] = useState<string>('');
  const [deletingClient, setDeletingClient] = useState(false);

  const resetState = () => {
    setDeleteStep('confirm');
    setDeleteOtp('');
    setAdminEmailForOtp('');
  };

  const handleSendDeleteOtp = async () => {
    if (!client) return;
    try {
      setSendingDeleteOtp(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        toast.error('Could not identify your admin account. Please sign in again.');
        return;
      }
      setAdminEmailForOtp(user.email);
      const { error } = await supabase.functions.invoke('send-admin-action-otp', {
        body: {
          action_type: 'delete_client',
          target_id: client.id,
          target_label: client.company_name,
        },
      });
      if (error) throw error;
      setDeleteStep('otp');
      setDeleteOtp('');
      toast.success(`Verification code sent to ${user.email}`);
    } catch (err: any) {
      console.error('Failed to send delete OTP:', err);
      toast.error(err.message || 'Failed to send verification code');
    } finally {
      setSendingDeleteOtp(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!client) return;
    if (!deleteOtp || deleteOtp.trim().length !== 6) {
      toast.error('Enter the 6-digit code from your email');
      return;
    }

    try {
      setDeletingClient(true);

      // Verify OTP first
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        'verify-admin-action-otp',
        {
          body: {
            action_type: 'delete_client',
            target_id: client.id,
            otp: deleteOtp.trim(),
          },
        },
      );
      if (verifyError || !(verifyData as any)?.verified) {
        toast.error('Invalid or expired verification code');
        setDeletingClient(false);
        return;
      }

      // Get the user_id for this client
      const { data: clientData, error: fetchError } = await supabase
        .from('clients')
        .select('user_id')
        .eq('id', client.id)
        .single();

      if (fetchError) throw fetchError;

      // Delete in order: all related tables first, then clients table, then auth user
      // Delete related records first - ALL tables with foreign keys to clients
      await supabase.from('analytics_events').delete().eq('client_id', client.id);
      await supabase.from('client_products').delete().eq('client_id', client.id);
      await supabase.from('client_ring_catalog').delete().eq('client_id', client.id);
      await supabase.from('client_carat_options').delete().eq('client_id', client.id);
      await supabase.from('client_metal_variants').delete().eq('client_id', client.id);
      await supabase.from('client_option_prices').delete().eq('client_id', client.id);
      await supabase.from('client_size_options').delete().eq('client_id', client.id);
      await supabase.from('client_onboarding_preferences').delete().eq('client_id', client.id);
      await supabase.from('client_activity_logs').delete().eq('client_id', client.id);
      await supabase.from('client_notification_preferences').delete().eq('client_id', client.id);
      await supabase.from('client_diamond_presets').delete().eq('client_id', client.id);
      await supabase.from('ai_chat_sessions').delete().eq('client_id', client.id);
      await supabase.from('ai_training_examples').delete().eq('client_id', client.id);
      await supabase.from('crm_integrations').delete().eq('client_id', client.id);
      await supabase.from('design_comparisons').delete().eq('client_id', client.id);
      await supabase.from('design_requests').delete().eq('client_id', client.id);
      await supabase.from('orders').delete().eq('client_id', client.id);
      await supabase.from('saved_designs').delete().eq('client_id', client.id);
      await supabase.from('usage_snapshots').delete().eq('client_id', client.id);
      await supabase.from('admin_staff_client_access').delete().eq('client_id', client.id);

      // Delete user role
      if (clientData?.user_id) {
        await supabase.from('user_roles').delete().eq('user_id', clientData.user_id);
      }

      // Delete client record
      const { error: deleteError } = await supabase
        .from('clients')
        .delete()
        .eq('id', client.id);

      if (deleteError) throw deleteError;

      // Delete the auth user as well (prevents orphaned accounts blocking re-signup)
      if (clientData?.user_id) {
        const { error: authDeleteError } = await supabase.functions.invoke('delete-auth-user', {
          body: { userId: clientData.user_id },
        });
        if (authDeleteError) throw authDeleteError;
      }

      // Log the activity
      await logClientDelete(client.company_name, client.id);

      // Notify all other admins about the deletion
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          await supabase.functions.invoke('notify-admins-client-status', {
            body: {
              client_company: client.company_name,
              client_email: client.email,
              action_type: 'deleted',
              performed_by_admin_email: user.email,
              performed_by_admin_name: user.user_metadata?.name || user.email,
            },
          });
        }
      } catch (notifyErr) {
        // Don't fail deletion if notification fails
        console.error('Failed to notify admins about deletion:', notifyErr);
      }

      toast.success(`Client "${client.company_name}" deleted successfully`);
      resetState();
      onOpenChange(false);
      onDeleted?.();
    } catch (error: any) {
      console.error('Error deleting client:', error);
      toast.error(error.message || 'Failed to delete client');
    } finally {
      setDeletingClient(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetState();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deleteStep === 'confirm' ? 'Delete Client' : 'Verify Your Identity'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deleteStep === 'confirm' ? (
              <>
                Are you sure you want to permanently delete <strong>"{client?.company_name}"</strong>?
                This action cannot be undone and will remove all associated data including orders,
                saved designs, catalog items, and the login account.
                <br /><br />
                For your security, we'll send a 6-digit verification code to your admin email before deleting.
              </>
            ) : (
              <>
                We sent a 6-digit verification code to <strong>{adminEmailForOtp}</strong>.
                Enter it below to permanently delete <strong>"{client?.company_name}"</strong>.
                The code expires in 10 minutes.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {deleteStep === 'otp' && (
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-otp">Verification code</Label>
            <Input
              id="delete-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={deleteOtp}
              onChange={(e) => setDeleteOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-lg tracking-[0.5em] font-mono"
              disabled={deletingClient}
            />
            <button
              type="button"
              onClick={handleSendDeleteOtp}
              disabled={sendingDeleteOtp || deletingClient}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              {sendingDeleteOtp ? 'Resending...' : 'Resend code'}
            </button>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletingClient || sendingDeleteOtp}>
            Cancel
          </AlertDialogCancel>
          {deleteStep === 'confirm' ? (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleSendDeleteOtp();
              }}
              disabled={sendingDeleteOtp}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {sendingDeleteOtp ? 'Sending code...' : 'Send Verification Code'}
            </AlertDialogAction>
          ) : (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteClient();
              }}
              disabled={deletingClient || deleteOtp.length !== 6}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingClient ? 'Deleting...' : 'Verify & Delete'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
