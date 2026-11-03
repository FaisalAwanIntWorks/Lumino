import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// DEPRECATED: This function is no longer needed as password_plain column has been removed
// from the clients table for security reasons. Passwords are now managed exclusively
// through Supabase Auth.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ 
      success: false, 
      message: "This function is deprecated. Password synchronization is no longer supported.",
      deprecated: true 
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
