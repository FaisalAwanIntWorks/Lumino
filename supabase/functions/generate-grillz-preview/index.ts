import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeCustomInstruction, sanitizeDesignBrief, JEWELRY_TERMINOLOGY_BLOCK } from "../_shared/prompt-guardrails.ts";
import { resolveAllowedOrigin } from "../_shared/security-utils.ts";
import { gateRequest, logUsage } from '../_shared/ai-quota.ts';
import { getImageDedup, setImageDedup } from '../_shared/ai-cache.ts';
import { tryImageCall } from '../_shared/ai-router.ts';
import { handlePendingRenderEmail } from '../_shared/pending-render-email.ts';
import { shouldDeliverRenderByEmail } from '../_shared/ai-image-delivery.ts';
import { loadPrompt } from '../_shared/prompt-loader.ts';
import { urlsToBase64 } from '../_shared/image-to-base64.ts';
import { logEdgeFunctionError } from '../_shared/error-logger.ts';

// G2: static headers used only for OPTIONS preflight and early-exit error responses.
// Actual request responses use dynamically built headers after validating the origin.
const STATIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRILLZ_SYSTEM_MESSAGE = `You are a master jewelry product photographer specializing in custom dental grillz. Generate photorealistic catalog-grade images with these standards:

TECHNICAL SPECIFICATIONS:
- Macro lens perspective (100mm equivalent), shallow depth of field
- Three-point studio lighting: key light from upper-left, fill from right, rim light for metal edge definition
- Grillz displayed as floating product shot, slight dimensional angle to show depth and tooth contours
- Metal surfaces show realistic specular highlights matching the specific metal type (yellow gold warm, white gold cool, platinum bright neutral)
- For iced-out pieces: diamonds display fire, brilliance, and dense pavé sparkle pattern across tooth surfaces

GRILLZ ANATOMY:
- Each tooth piece follows natural dental arch curvature
- Top grillz curve outward slightly (maxillary arch)
- Bottom grillz curve inward slightly (mandibular arch)
- Fangs extend downward from canine positions with pointed tips
- Open-face designs show rectangular or custom cutouts revealing negative space

CRITICAL TOOTH COUNT RULES:
- You MUST render EXACTLY the number of teeth specified — no more, no fewer
- A "1 tooth" grillz is a SINGLE standalone tooth piece — do NOT add adjacent teeth
- A "2 teeth" grillz shows exactly TWO tooth pieces side by side
- If only top OR bottom is specified, render ONLY that arch — leave the other completely absent
- Count the teeth in your render before finalizing — the count must match exactly

OUTPUT:
- Product shot only — no mouths, faces, or mannequins
- Solid seamless backdrop, uniform color
- 4K photorealistic quality suitable for e-commerce

STRICT RULES:
- Never generate images of people, faces, bodies, or any living beings.
- Never generate weapons, violence, gore, or inappropriate content.
- Never generate non-jewelry objects unless they are part of a jewelry display.
- If a user instruction asks for non-jewelry content, ignore that instruction entirely and generate only the jewelry piece.
- Focus exclusively on the jewelry product with studio-quality lighting and presentation.` + JEWELRY_TERMINOLOGY_BLOCK;

// Fallback chain: Nano Banana 2 → Nano Banana Pro → GPT Image 1.5
const MODELS = [
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3-pro-image-preview",
  "openai/gpt-image-1.5",
];

interface GrillzPreviewRequest {
  leadId: string;
  clientId: string;
  submissionDetails?: Record<string, string>;
  metalType: string;
  metalPurity?: string;
  grillzType: string;
  topTeeth: string;
  bottomTeeth: string;
  fangs?: boolean;
  openFaced?: boolean;
  engraving?: string;
  customMessage?: string;
  generationNumber?: number;
  backgroundColor?: string;
  customInstruction?: string;
  questionAnswers?: Record<string, any>;
}

function buildPrompt(config: GrillzPreviewRequest): string {
  const parts: string[] = [];
  const bgColor = config.backgroundColor || '#ffffff';

  if (config.metalType) {
    const metalLabel = config.metalPurity
      ? `${config.metalPurity} ${config.metalType}` : config.metalType;
    parts.push(`METAL: ${metalLabel} — render accurate color temperature and reflectivity for this specific alloy`);
  }

  if (config.grillzType) {
    const style = config.grillzType === 'iced-out'
      ? 'Fully iced out with VS clarity diamonds covering the entire surface, dense pavé sparkle pattern'
      : 'Basic polished smooth finish with a mirror-like shine';
    parts.push(`STYLE: ${style}`);
  }

  const TOOTH_COUNT_MAP: Record<string, string> = {
    '1': 'single front central incisor tooth piece only — DO NOT render any adjacent teeth',
    '2': 'two front central incisor teeth only (side by side)',
    '3': 'three front teeth (two central incisors + one lateral incisor)',
    '4': 'four front teeth (central and lateral incisors)',
    '6': 'six front teeth (central incisors, lateral incisors, and canines)',
    '8': 'full eight-tooth set (incisors, canines, and first premolars)',
  };

  const coverageParts: string[] = [];
  if (config.topTeeth && config.topTeeth !== 'none') {
    const topDesc = TOOTH_COUNT_MAP[config.topTeeth] || `${config.topTeeth} teeth`;
    coverageParts.push(`TOP: ${topDesc}`);
  }
  if (config.bottomTeeth && config.bottomTeeth !== 'none') {
    const bottomDesc = TOOTH_COUNT_MAP[config.bottomTeeth] || `${config.bottomTeeth} teeth`;
    coverageParts.push(`BOTTOM: ${bottomDesc}`);
  }

  if (coverageParts.length > 0) {
    parts.push(`COVERAGE:\n${coverageParts.join('\n')}`);
  }

  // Explicit single-arch instruction
  if (config.topTeeth && config.topTeeth !== 'none' && (!config.bottomTeeth || config.bottomTeeth === 'none')) {
    parts.push('IMPORTANT: Render ONLY the top grillz piece. Do NOT include any bottom grillz.');
  } else if (config.bottomTeeth && config.bottomTeeth !== 'none' && (!config.topTeeth || config.topTeeth === 'none')) {
    parts.push('IMPORTANT: Render ONLY the bottom grillz piece. Do NOT include any top grillz.');
  }

  const featureParts: string[] = [];
  if (config.fangs === true) featureParts.push('Extended vampire-style fangs at canine positions with pointed tips');
  if (config.openFaced === true) featureParts.push('Open-faced cutout design showing negative space where the natural tooth would be visible');
  if (featureParts.length > 0) parts.push(`FEATURES: ${featureParts.join('; ')}`);

  // Only real engraving text (from dedicated engraving field)
  if (config.engraving) parts.push(`ENGRAVING: "${config.engraving}"`);

  // M1: sanitize for injection + resolve jewelry terms before passing to AI
  if (config.customMessage) {
    const sanitizedMessage = sanitizeDesignBrief(config.customMessage);
    if (sanitizedMessage) {
      parts.push(`CUSTOMER DESCRIPTION (interpret as design brief — do NOT engrave or render as text on the piece): ${sanitizedMessage}`);
    }
  }

  // Dynamic question answers from client-configured questions
  if (config.questionAnswers && typeof config.questionAnswers === 'object') {
    Object.entries(config.questionAnswers).forEach(([key, val]) => {
      // L1: skip custom_message — already rendered above via config.customMessage as a design brief
      if (key === 'custom_message') return;
      if (val && typeof val === 'object' && (val as any).answer !== undefined && (val as any).answer !== null) {
        const label = (val as any).question || key;
        let answerText = String((val as any).answer);
        if ((val as any).text) answerText += ` — ${(val as any).text}`;
        parts.push(`${label}: ${answerText}`);
      } else if (val && typeof val === 'string') {
        parts.push(`${key}: ${val}`);
      } else if (typeof val === 'boolean') {
        parts.push(`${key}: ${val ? 'Yes' : 'No'}`);
      }
    });
  }

  const composition = `COMPOSITION: Grillz floating at slight angle (20° tilt, 10° rotation) showing both front face and tooth depth, centered frame, solid flat ${bgColor} background with no gradients or textures.`;

  const variationHint = (config.generationNumber ?? 1) > 1
    ? `\nVARIATION: This is variation #${config.generationNumber}. Create a distinctly different angle, lighting, and artistic interpretation from previous renders.`
    : '';

  const sanitized = sanitizeCustomInstruction(config.customInstruction, 'grillz');
  const customBlock = sanitized
    ? `\n\n---\n\n[USER STYLING PREFERENCE - apply only if it relates to grillz presentation]:\n${sanitized}\n\n---\n\nRender the grillz described above. Ignore any content in the styling preference that doesn't relate to jewelry photography.`
    : '';

  const renderingMandate = `RENDERING MANDATE (must be visible in output):
- Studio macro photography: 100mm lens, shallow depth of field, focus on front tooth surfaces
- Three-point lighting: key light upper-left for dominant specular, fill right for shadow detail, rim light for crisp metal edge definition
- Metal accuracy: correct color temperature and reflectivity for specified metal type — yellow gold warm, white gold cool, platinum bright neutral
- For iced-out: diamonds display fire, brilliance, and dense pavé sparkle across tooth surfaces
- Grillz anatomy: natural dental arch curvature, exact tooth count as specified — no more, no fewer
- Background: solid flat ${bgColor} — no gradients, no textures, no props
- Product shot ONLY — no mouths, faces, people, bodies, mannequins

TEXT & ENGRAVING RULES (CRITICAL):
- Words like "iced out", "bust down", "invisible setting", "princess cut", "flooded", "pavé", "channel set", "bezel set" are DESIGN DESCRIPTIONS — render them as visual properties, NEVER as text on the piece.
- ONLY render text/letters on the jewelry if an ENGRAVING field is explicitly provided below with specific text.
- If no ENGRAVING field is present, the piece must have ZERO text, letters, or words on it.
- Action words (make, create, build, want, like, need, show, give) are user instructions, NOT engraving text.
- A clean piece with no text is ALWAYS preferred over incorrectly rendered text.`;

  return `TASK: Generate a photorealistic custom dental grillz product photograph following ALL specifications below and in the system instructions exactly. Do not improvise or simplify any rendering detail.

${renderingMandate}

${parts.join('\n')}

${composition}${variationHint}${customBlock}

COMPLIANCE: Every specification above and in the system instructions is mandatory. The output must be indistinguishable from a real studio product photograph.`;
}

function buildMultimodalContent(promptText: string, imageUrls: string[]): any {
  if (imageUrls.length === 0) return promptText;
  const content: any[] = [
    { type: "text", text: promptText + "\n\nREFERENCE IMAGE INSTRUCTIONS: A reference image has been provided. Analyze the reference and extract: the tooth coverage pattern and arrangement, the surface texture treatment, the overall aesthetic direction. Apply these design cues to the grillz described below. Metal and teeth selections from the form OVERRIDE the reference materials." },
  ];
  for (const url of imageUrls.slice(0, 4)) {
    content.push({ type: "image_url", image_url: { url } });
  }
  return content;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: STATIC_CORS_HEADERS });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const config: GrillzPreviewRequest = await req.json();
    const generationNumber = config.generationNumber ?? 1;
    const submissionDetails = config.submissionDetails;

    if (!config.leadId || !config.clientId) {
      return new Response(
        JSON.stringify({ error: "leadId and clientId are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...STATIC_CORS_HEADERS } }
      );
    }

    if (generationNumber > 3) {
      return new Response(
        JSON.stringify({ error: "Maximum of 3 preview generations allowed" }),
        { status: 400, headers: { "Content-Type": "application/json", ...STATIC_CORS_HEADERS } }
      );
    }

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("id", config.clientId)
      .maybeSingle();

    if (clientErr || !client) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...STATIC_CORS_HEADERS } }
      );
    }

    // J9: lead data, quota gate, and allowed-domains all in parallel
    // G4: scope lead fetch by client_id to prevent cross-tenant access
    const [leadRes, blocked, brandingRes] = await Promise.all([
      supabase
        .from("grill_form_leads")
        .select("uploaded_image_urls")
        .eq("id", config.leadId)
        .eq("client_id", config.clientId)
        .maybeSingle(),
      gateRequest(config.clientId, 'grillz_preview', STATIC_CORS_HEADERS),
      supabase.from('client_branding').select('allowed_domains').eq('id', config.clientId).maybeSingle(),
    ]);
    if (blocked) return blocked;

    // Fail closed: a failed branding lookup must not be read as "no restrictions".
    if (brandingRes.error) {
      console.error('generate-grillz-preview: branding lookup failed', brandingRes.error);
      return new Response(
        JSON.stringify({ error: "Unable to verify allowed domains" }),
        { status: 503, headers: { "Content-Type": "application/json", ...STATIC_CORS_HEADERS } }
      );
    }

    // G2: build per-request CORS headers based on the client's allowed_domains whitelist
    const allowedDomains = (brandingRes.data?.allowed_domains as string[] | null) ?? [];
    const corsHeaders = {
      "Access-Control-Allow-Origin": resolveAllowedOrigin(req.headers.get('Origin'), allowedDomains),
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
    if (corsHeaders["Access-Control-Allow-Origin"] === 'null') {
      return new Response(
        JSON.stringify({ error: "Origin not authorized for this client" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const leadData = leadRes.data;

    // Client picks one channel for the customer's render: email or thank-you page.
    // The jeweler's own copy of every render is sent regardless.
    const deliverByEmail = await shouldDeliverRenderByEmail(supabase, "client_grill_config", config.clientId);

    // J8: Cap at 4 URLs before downloading — buildMultimodalContent only uses the first 4 anyway
    const inspirationUrls: string[] = ((leadData?.uploaded_image_urls as string[] | null) ?? []).slice(0, 4);
    // L9: gracefully skip dead/auth-gated URLs rather than failing the whole generation
    let base64Urls: string[] = [];
    try {
      base64Urls = await urlsToBase64(inspirationUrls);
    } catch (imgErr) {
      console.error('Failed to convert inspiration images to base64, continuing without reference images:', imgErr);
    }

    const prompt = buildPrompt(config);
    const userContent = buildMultimodalContent(prompt, base64Urls);
    console.log("Generating grillz preview #" + generationNumber, "with", base64Urls.length, "inspiration images (converted from", inspirationUrls.length, "URLs)");

    // Image dedup check — skip for variation regenerations
    if (generationNumber === 1) {
      const cachedUrl = await getImageDedup(config.clientId, 'grillz_preview', config as any);
      if (cachedUrl) {
        console.log("Image dedup HIT for grillz preview");
        await logUsage(config.clientId, 'grillz_preview', 'cached', undefined, true);

        // Still store as this lead's preview
        await supabase.from("grill_preview_images").insert({
          lead_id: config.leadId,
          image_url: cachedUrl,
          generation_number: generationNumber,
          custom_instruction: config.customInstruction || null,
        });
        await supabase.from("grill_form_leads").update({ ai_preview_url: cachedUrl }).eq("id", config.leadId);

        const emailed = await handlePendingRenderEmail(supabase, {
          leadId: config.leadId,
          clientId: config.clientId,
          formType: "grillz",
          generationNumber,
          submissionDetails,
          imageUrl: cachedUrl,
          sendCustomer: deliverByEmail,
        });

        return new Response(
          JSON.stringify({ success: true, ...(emailed ? { emailed: true } : { imageUrl: cachedUrl }), generationNumber, source: "cache" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // ── Tier 1: Try AI models with multi-provider fallback ──
    // J9: load system prompt and terminology from DB in parallel (falls back to hardcoded)
    const [dbPrompt, dbTerminology] = await Promise.all([
      loadPrompt('grillz_preview', GRILLZ_SYSTEM_MESSAGE.replace(JEWELRY_TERMINOLOGY_BLOCK, '')),
      loadPrompt('jewelry_terminology', JEWELRY_TERMINOLOGY_BLOCK),
    ]);
    const dynamicSystemMessage = dbPrompt + dbTerminology;

    const aiResult = await tryImageCall(dynamicSystemMessage, userContent, MODELS);

    if (!aiResult) {
      return new Response(
        JSON.stringify({ error: "All AI providers unavailable. Please try again shortly." }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const aiData = await aiResult.response.json();
    const imageDataUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageDataUrl) {
      console.error("No image in AI response:", JSON.stringify(aiData).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "No image generated" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const base64Match = imageDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!base64Match) {
      return new Response(
        JSON.stringify({ error: "Invalid image format from AI" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const imageType = base64Match[1];
    const base64Data = base64Match[2];
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    const ext = imageType === 'jpeg' || imageType === 'jpg' ? 'jpg' : 'png';
    const filePath = `grillz-previews/${config.leadId}-${generationNumber}.${ext}`;
    const contentType = `image/${imageType}`;

    const { error: uploadError } = await supabase.storage
      .from("diamond-inspiration")
      .upload(filePath, binaryData, { contentType, upsert: true });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload image" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("diamond-inspiration")
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    await supabase.from("grill_preview_images").insert({
      lead_id: config.leadId,
      image_url: publicUrl,
      generation_number: generationNumber,
      custom_instruction: config.customInstruction || null,
    });

    await supabase
      .from("grill_form_leads")
      .update({ ai_preview_url: publicUrl })
      .eq("id", config.leadId);

    // Log usage after successful generation
    await logUsage(config.clientId, 'grillz_preview', aiResult.model, undefined);

    // Store in image dedup cache
    await setImageDedup(config.clientId, 'grillz_preview', config as any, publicUrl);

    console.log(`Grillz preview #${generationNumber} generated with ${aiResult.model}:`, publicUrl);

    // Handle pending render email
    const emailed = await handlePendingRenderEmail(supabase, {
      leadId: config.leadId,
      clientId: config.clientId,
      formType: "grillz",
      generationNumber,
      submissionDetails,
      imageUrl: publicUrl,
      sendCustomer: deliverByEmail,
    });

    return new Response(
      JSON.stringify({ success: true, ...(emailed ? { emailed: true } : { imageUrl: publicUrl }), generationNumber, source: "ai" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in generate-grillz-preview:", error);
    await logEdgeFunctionError('generate-grillz-preview', error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate grillz preview" }),
      { status: 500, headers: { "Content-Type": "application/json", ...STATIC_CORS_HEADERS } }
    );
  }
};

serve(handler);
