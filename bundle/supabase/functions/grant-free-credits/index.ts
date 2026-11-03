import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase.rpc("grant_monthly_free_credits");

  if (error) {
    console.error("Failed to grant monthly free credits:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`Granted free credits to ${data} clients`);
  return new Response(JSON.stringify({ granted: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
