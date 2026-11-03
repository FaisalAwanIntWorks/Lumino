// enforce-subscription-grace — RETIRED (2026-09-08).
//
// This daily cron used to switch every widget module off for clients whose
// subscription had been past_due / unpaid / incomplete for more than 7 days.
// Widget access now follows the Stripe status directly (see
// `subscription_status_allows_widgets` and migration
// 20261102120000_widgets_off_on_failed_payment.sql): the first failed payment
// turns widgets off and the next successful payment turns them back on, with
// no grace period, so there is nothing left for this job to enforce.
//
// The pg_cron schedule was removed in the same migration. The function stays
// deployed as a harmless no-op so any stale invocation (an old cron row, a
// manual call) cannot deactivate a client's widgets by accident.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log(
    "[ENFORCE-SUBSCRIPTION-GRACE] retired — widget access follows the Stripe status directly; no action taken",
  );

  return new Response(
    JSON.stringify({
      ok: true,
      retired: true,
      processed: 0,
      results: [],
      message:
        "Auto-pause retired: widget access follows the Stripe subscription status (off on a failed payment, on once paid).",
    }),
    { headers: { "Content-Type": "application/json", ...corsHeaders } },
  );
});
