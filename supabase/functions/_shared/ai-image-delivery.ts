/**
 * AI render delivery channel for the CustomX forms (Ring Builder, Grillz
 * Builder, Custom Enquiry).
 *
 * The client picks one channel in the form configurator
 * (`ai_image_delivery`): 'email' sends the render to the customer's inbox,
 * 'thank_you_page' shows it on the thank-you screen and sends no render email.
 *
 * Read server-side so the channel cannot be changed from the browser.
 */
export async function shouldDeliverRenderByEmail(
  supabase: any,
  configTable: "client_ring_form_config" | "client_grill_config" | "client_custom_enquiry_config",
  clientId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(configTable)
    .select("ai_image_delivery")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    // Falls back to the thank-you page so the customer still sees their render.
    console.error(`ai_image_delivery lookup failed for ${configTable}:`, error);
    return false;
  }
  return data?.ai_image_delivery === "email";
}
