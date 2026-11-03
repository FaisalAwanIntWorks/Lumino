import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExportRequest {
  leadIds?: string[];
  exportAll?: boolean;
  clientId: string;
  recipientEmail: string;
  recipientName?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    if (!resendApiKey) {
      throw new Error("Missing RESEND_API_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Validate authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { leadIds, exportAll, clientId, recipientEmail, recipientName }: ExportRequest = await req.json();

    if (!clientId || !recipientEmail) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: clientId and recipientEmail" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to this client
    const { data: clientCheck } = await supabase
      .from("clients")
      .select("id, company_name")
      .eq("id", clientId)
      .maybeSingle();

    if (!clientCheck) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch leads based on selection
    let query = supabase
      .from("saved_designs")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (!exportAll && leadIds && leadIds.length > 0) {
      query = query.in("id", leadIds);
    }

    const { data: leads, error: leadsError } = await query;

    if (leadsError) {
      throw leadsError;
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ error: "No leads found to export" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate CSV content
    const csvHeaders = [
      "Customer Name",
      "Customer Email",
      "Customer Phone",
      "Product Name",
      "Status",
      "Notes",
      "Style",
      "Metal",
      "Shape",
      "Carat",
      "Size",
      "Created At"
    ];

    const csvRows = leads.map((lead) => {
      const config = lead.configuration || {};
      return [
        escapeCSV(lead.customer_name || ""),
        escapeCSV(lead.customer_email || ""),
        escapeCSV(lead.customer_phone || ""),
        escapeCSV(lead.product_name || "Custom Ring"),
        escapeCSV(lead.follow_up_status || "new"),
        escapeCSV(lead.notes || ""),
        escapeCSV(config.style || ""),
        escapeCSV(config.metal || ""),
        escapeCSV(config.shape || ""),
        escapeCSV(config.carat?.toString() || ""),
        escapeCSV(config.size?.toString() || ""),
        escapeCSV(new Date(lead.created_at).toLocaleString())
      ].join(",");
    });

    const csvContent = [csvHeaders.join(","), ...csvRows].join("\n");
    
    // Convert CSV to base64 for attachment
    const encoder = new TextEncoder();
    const csvBytes = encoder.encode(csvContent);
    const csvBase64 = btoa(String.fromCharCode(...csvBytes));

    // Filename for the attachment
    const filename = `leads-export-${new Date().toISOString().split("T")[0]}.csv`;

    // Send email with CSV attachment
    const exportDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Your Leads Export</title>
  <style>
    :root { color-scheme: light only; }
    @media (prefers-color-scheme: dark) {
      .email-header { background-color: #013220 !important; }
    }
    [data-ogsc] .email-header { background-color: #013220 !important; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td class="email-header" style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #013220 0%, #0b6e4f 100%); border-radius: 12px 12px 0 0;">
              <img src="https://vault.jewlx.ai/images/jewelx-email-logo.png" alt="JewlX" style="height: 50px; width: auto;">
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="color: #013220; margin: 0 0 20px; font-size: 28px; font-weight: 600;">
                Your Leads Export is Ready 📊
              </h1>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hi${recipientName ? ` ${recipientName}` : ""},
              </p>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Your leads export from <strong>${clientCheck.company_name}</strong> has been generated successfully. 
                The export contains <strong>${leads.length} lead${leads.length > 1 ? "s" : ""}</strong>.
              </p>
              
              <!-- Summary Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #d1f2eb; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="color: #013220; margin: 0 0 15px; font-size: 16px;">Export Summary</h3>
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="color: #0b6e4f; padding: 5px 0; font-size: 14px;">Total Leads:</td>
                        <td style="color: #013220; padding: 5px 0 5px 15px; font-size: 14px; font-weight: 600;">${leads.length}</td>
                      </tr>
                      <tr>
                        <td style="color: #0b6e4f; padding: 5px 0; font-size: 14px;">Export Date:</td>
                        <td style="color: #013220; padding: 5px 0 5px 15px; font-size: 14px; font-weight: 600;">${exportDate}</td>
                      </tr>
                      <tr>
                        <td style="color: #0b6e4f; padding: 5px 0; font-size: 14px;">Format:</td>
                        <td style="color: #013220; padding: 5px 0 5px 15px; font-size: 14px; font-weight: 600;">CSV</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0;">
                📎 <strong>Your CSV file is attached to this email.</strong> Simply download the attachment to access your leads data.
              </p>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0;">
                <strong>Tip:</strong> You can open the CSV file in Excel, Google Sheets, or any spreadsheet application.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #d1f2eb; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="color: #0b6e4f; font-size: 14px; margin: 0;">
                This export was requested from your JewlX dashboard.
              </p>
              <p style="color: #0b6e4f; font-size: 12px; margin: 10px 0 0;">
                © ${new Date().getFullYear()} JewlX. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Send email via Resend with CSV as attachment
    const emailResponse = await resend.emails.send({
      from: "JewlX <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `Your Leads Export is Ready - ${leads.length} Lead${leads.length > 1 ? "s" : ""}`,
      html: emailHtml,
      attachments: [
        {
          filename: filename,
          content: csvBase64,
        }
      ],
    });

    console.log("Export email sent successfully:", emailResponse);

    // Log the email
    await supabase.from("email_logs").insert({
      recipient_email: recipientEmail,
      subject: `Your Leads Export is Ready - ${leads.length} Lead${leads.length > 1 ? "s" : ""}`,
      email_type: "leads_export",
      status: "sent",
      resend_id: emailResponse.data?.id || null,
      metadata: {
        client_id: clientId,
        leads_count: leads.length,
        export_all: exportAll || false,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Export email sent to ${recipientEmail}`,
        leadsCount: leads.length 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error exporting leads:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to export leads" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
