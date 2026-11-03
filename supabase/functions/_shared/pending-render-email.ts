import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Sends a render-preview email to the customer IMMEDIATELY after each
 * AI image generation. One email per generation — no debouncing, no cron.
 *
 * The previous version used a 5-minute sliding window backed by a
 * per-minute cron job (very expensive). This version triggers the
 * email right when the image is produced.
 *
 * The account holder (jeweler) always gets a copy of each render. The
 * customer email is optional (`sendCustomer`, default true) — Grillz and
 * Custom Enquiry only send it when the client chose "Email" delivery.
 *
 * Resolves to true only when the CUSTOMER email was actually sent, so
 * callers that deliver the render by email can fall back to showing it on
 * screen.
 */
export async function handlePendingRenderEmail(
  supabase: any,
  params: {
    leadId: string;
    clientId: string;
    formType: string;
    generationNumber: number;
    submissionDetails?: Record<string, string>;
    imageUrl?: string;
    sendCustomer?: boolean;
  }
): Promise<boolean> {
  const { leadId, clientId, formType, generationNumber, submissionDetails, imageUrl, sendCustomer = true } = params;

  try {
    // Fetch customer info from the appropriate lead table
    let customerEmail = "";
    let customerName = "";

    if (formType === "ring_builder") {
      const { data } = await supabase
        .from("design_requests")
        .select("customer_email, customer_name")
        .eq("id", leadId)
        .maybeSingle();
      customerEmail = data?.customer_email || "";
      customerName = data?.customer_name || "";
    } else if (formType === "grillz") {
      const { data } = await supabase
        .from("grill_form_leads")
        .select("customer_email, customer_name")
        .eq("id", leadId)
        .maybeSingle();
      customerEmail = data?.customer_email || "";
      customerName = data?.customer_name || "";
    } else if (formType === "custom_enquiry") {
      const { data } = await supabase
        .from("custom_enquiry_leads")
        .select("customer_email, customer_name")
        .eq("id", leadId)
        .maybeSingle();
      customerEmail = data?.customer_email || "";
      customerName = data?.customer_name || "";
    }

    if (!customerEmail) {
      console.warn("No customer email found for lead:", leadId);
      return false;
    }

    // Upsert pending_render_emails (kept for record-keeping / preferences lookup).
    // IMPORTANT: only write `details` when caller actually provided a non-empty
    // object — otherwise we'd blank the saved submission summary on every
    // regeneration (the client only sends submissionDetails on gen #1 in some
    // flows), which caused custom questions to disappear from later
    // per-generation render emails.
    const upsertRow: Record<string, any> = {
      lead_id: leadId,
      client_id: clientId,
      form_type: formType,
      customer_email: customerEmail,
      customer_name: customerName,
      send_after: new Date().toISOString(),
      status: "pending",
    };
    if (submissionDetails && Object.keys(submissionDetails).length > 0) {
      upsertRow.details = submissionDetails;
    }
    await supabase.from("pending_render_emails").upsert(upsertRow, { onConflict: "lead_id" });

    // Trigger the email immediately for THIS generation
    console.log(
      `Sending immediate render email for lead ${leadId}, generation #${generationNumber}`
    );
    const { data, error } = await supabase.functions.invoke("send-consolidated-render-email", {
      body: {
        lead_id: leadId,
        client_id: clientId,
        form_type: formType,
        generation_number: generationNumber,
        image_url: imageUrl,
        send_customer: sendCustomer,
      },
    });
    if (error) {
      console.error("Render email failed:", error);
      return false;
    }
    return data?.success === true;
  } catch (err) {
    // Non-blocking — log but don't fail the generation
    console.error("Error sending render email:", err);
    return false;
  }
}
