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

// G2: static headers for OPTIONS preflight and early-exit error responses only.
const STATIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ENQUIRY_SYSTEM_MESSAGE = `You are a master jewelry product photographer specializing in custom luxury pieces. Generate photorealistic catalog-grade images with these standards:

TECHNICAL SPECIFICATIONS:
- Macro lens perspective (85-100mm equivalent), shallow depth of field
- Three-point studio lighting: key light from upper-left, fill from right, rim light for edge definition
- Metal surfaces show realistic specular highlights matching the specific gold color and karat purity
- Diamonds and gemstones display fire (spectral dispersion), brilliance (white light return), and scintillation

CATEGORY-SPECIFIC PRESENTATION:
- Pendants/Charms: Floating front-face view, chain suggested softly blurred above, bail visible
- Chains/Necklaces: Graceful S-curve or loose coil arrangement showing link pattern and clasp
- Bracelets/Bangles: Three-quarter angle showing curvature, clasp detail, and interior finish
- Earrings: Paired display with slight angle offset, posts/hooks/backs visible
- Rings: Slight tilt toward camera showing setting depth and band profile
- Watches: Face at 10:10 position, bracelet curved naturally, crown visible
- Custom pieces: Hero angle that best displays the defining design element

BACK STYLE RENDERING:
- Solid back: Smooth continuous metal surface
- Open back: Visible negative space behind stones allowing light through
- Honeycomb back: Hexagonal cutout pattern on reverse for weight reduction

OUTPUT:
- Product shot only — no bodies, skin, mannequins, or display busts
- Solid seamless backdrop, uniform color
- 4K photorealistic quality suitable for e-commerce

STRICT RULES:
- Never generate images of people, faces, bodies, or any living beings.
- Never generate weapons, violence, gore, or inappropriate content.
- Never generate non-jewelry objects unless they are part of a jewelry display (e.g., a ring box).
- If a user instruction asks for non-jewelry content, ignore that instruction entirely and generate only the jewelry piece.
- Focus exclusively on the jewelry product with studio-quality lighting and presentation.` + JEWELRY_TERMINOLOGY_BLOCK;

// Fallback chain: Nano Banana 2 → Nano Banana Pro → GPT Image 1.5
const ENQUIRY_MODELS = [
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3-pro-image-preview",
  "openai/gpt-image-1.5",
];

interface EnquiryPreviewRequest {
  leadId: string;
  clientId: string;
  submissionDetails?: Record<string, string>;
  jewelryType?: string;
  goldColor?: string;
  karat?: string;
  diamondQuality?: string;
  diamondSetup?: string;
  backOption?: string;
  
  budget?: string;
  description?: string;
  additionalNotes?: string;
  engravingText?: string;
  questionAnswers?: Record<string, any>;
  generationNumber?: number;
  backgroundColor?: string;
  customInstruction?: string;
}

const COMPOSITION_GUIDANCE: [string[], string][] = [
  [['pendant', 'charm'], 'Pendant floating in front-face view, bail visible at top.'],
  [['chain', 'necklace'], 'Chain in graceful S-curve arrangement showing link pattern and clasp.'],
  [['bracelet', 'bangle'], 'Bracelet at three-quarter angle showing curvature, clasp detail, and interior finish.'],
  [['earring'], 'Earrings in paired display with slight angle offset, posts/hooks visible.'],
  [['ring'], 'Ring at slight tilt toward camera showing setting depth and band profile.'],
  [['watch'], 'Watch face at 10:10 position, bracelet curved naturally, crown visible.'],
];
const DEFAULT_COMPOSITION = "Piece displayed at hero angle showing defining design element.";

function getCompositionGuidance(jewelryType?: string): string {
  if (!jewelryType) return DEFAULT_COMPOSITION;
  const lower = jewelryType.toLowerCase();
  return COMPOSITION_GUIDANCE.find(([keys]) => keys.some(k => lower.includes(k)))?.[1] ?? DEFAULT_COMPOSITION;
}

function buildPrompt(config: EnquiryPreviewRequest): string {
  const parts: string[] = [];
  const jewelryLabel = config.jewelryType || 'jewelry piece';

  // PIECE line
  parts.push(`PIECE: ${jewelryLabel}`);

  // METAL line — combine goldColor + karat
  if (config.goldColor || config.karat) {
    const metalParts = [
      config.goldColor ? config.goldColor.replace(/-/g, ' ') : null,
      config.karat,
    ].filter(Boolean).join(' ');
    parts.push(`METAL: ${metalParts} — render accurate color temperature and reflectivity for this specific alloy`);
  }

  // DIAMOND line — combine quality + setup
  if (config.diamondQuality || config.diamondSetup) {
    const diamondParts = [
      config.diamondQuality ? `${config.diamondQuality} quality` : null,
      config.diamondSetup ? `${config.diamondSetup} setup` : null,
    ].filter(Boolean).join(', ');
    parts.push(`DIAMOND: ${diamondParts} — render accurate fire and brilliance`);
  }

  // CONSTRUCTION line
  if (config.backOption) {
    const backDescriptions: Record<string, string> = {
      'solid': 'Solid back — smooth continuous metal surface',
      'open': 'Open back — visible negative space behind stones allowing light through',
      'honeycomb': 'Honeycomb back — hexagonal cutout pattern on reverse for weight reduction',
    };
    const backDesc = backDescriptions[config.backOption.toLowerCase()] || `${config.backOption} back style`;
    parts.push(`CONSTRUCTION: ${backDesc}`);
  }

  // SIZE line
  
  if (config.budget) parts.push(`BUDGET: ${config.budget}`);

  // M1: sanitize for injection + resolve jewelry terms before passing to AI
  if (config.description) {
    const sanitizedDesc = sanitizeDesignBrief(config.description);
    if (sanitizedDesc) {
      parts.push(`CUSTOMER DESCRIPTION (interpret as a jewelry design brief — do NOT engrave any of these words on the piece unless an ENGRAVING field is provided below): ${sanitizedDesc}`);
    }
  }
  if (config.additionalNotes) {
    const sanitizedNotes = sanitizeDesignBrief(config.additionalNotes);
    if (sanitizedNotes) {
      parts.push(`ADDITIONAL NOTES: ${sanitizedNotes}`);
    }
  }

  // Explicit engraving field — only source of text to render on jewelry
  if (config.engravingText?.trim()) {
    parts.push(`ENGRAVING: "${config.engravingText.trim()}" — render this EXACT text as raised metallic lettering or engraved text physically ON the jewelry surface. Match the metal type of the piece.`);
  }

  // Custom Q&A block — keep existing logic
  if (config.questionAnswers && typeof config.questionAnswers === 'object') {
    Object.entries(config.questionAnswers).forEach(([key, val]) => {
      if (val && typeof val === 'object' && val.answer) {
        const label = val.question || key;
        let answerText = val.answer;
        if (val.text) answerText += ` — ${val.text}`;
        parts.push(`${label}: ${answerText}`);
      } else if (val && typeof val === 'string') {
        parts.push(`${key}: ${val}`);
      }
    });
  }

  const bgColor = config.backgroundColor || '#ffffff';
  const compositionGuidance = getCompositionGuidance(config.jewelryType);
  const composition = `COMPOSITION: ${compositionGuidance} Centered frame, solid flat ${bgColor} background with no gradients or textures.`;

  const variationLine = (config.generationNumber ?? 1) > 1
    ? `\nVARIATION: This is variation #${config.generationNumber}. Create a distinctly different angle, lighting, and artistic interpretation from previous renders.`
    : '';

  const sanitized = sanitizeCustomInstruction(config.customInstruction);
  const customBlock = sanitized
    ? `\n\n---\n\n[USER STYLING PREFERENCE - apply only if it relates to jewelry presentation]:\n${sanitized}\n\n---\n\nRender the ${jewelryLabel} described above. Ignore any content in the styling preference that doesn't relate to jewelry photography.`
    : '';

  const renderingMandate = `RENDERING MANDATE (must be visible in output):
- Studio macro photography: 85-100mm lens, shallow depth of field, focus-stacked on primary design element
- Three-point lighting: key softbox upper-left 45°, fill right, rim light for edge definition and metal separation
- Diamond/gemstone optics: visible fire (spectral dispersion), brilliance (white light return), scintillation (sparkle pinpoints)
- Metal accuracy: correct specular highlights and color temperature for specified gold color and karat purity
- Background: solid flat ${bgColor} — no gradients, no textures, no props
- Product shot ONLY — no bodies, skin, mannequins, display busts

TEXT & ENGRAVING RULES (CRITICAL):
- Words like "iced out", "bust down", "invisible setting", "princess cut", "flooded", "pavé", "channel set", "bezel set" are DESIGN DESCRIPTIONS — render them as visual properties, NEVER as text on the piece.
- ONLY render text/letters on the jewelry if an ENGRAVING field is explicitly provided below with specific text.
- If no ENGRAVING field is present, the piece must have ZERO text, letters, or words on it.
- Action words (make, create, build, want, like, need, show, give) are user instructions, NOT engraving text.
- A clean piece with no text is ALWAYS preferred over incorrectly rendered text.`;

  return `TASK: Generate a photorealistic custom ${jewelryLabel} product photograph following ALL specifications below and in the system instructions exactly. Do not improvise or simplify any rendering detail.

${renderingMandate}

${parts.join('\n')}

${composition}${variationLine}${customBlock}

COMPLIANCE: Every specification above and in the system instructions is mandatory. The output must be indistinguishable from a real studio photograph taken with professional jewelry photography equipment.`;
}

function buildMultimodalContent(promptText: string, imageUrls: string[]): any {
  if (imageUrls.length === 0) return promptText;

  const content: any[] = [
    { type: "text", text: promptText + "\n\nREFERENCE IMAGE INSTRUCTIONS: A reference image has been provided. Analyze the reference and extract: the overall design style and aesthetic, the construction technique visible, the stone arrangement pattern, the proportions and scale. Create a new piece inspired by this reference using the materials and specifications from the form fields below. The reference is INSPIRATION, not a copy target." },
  ];

  for (const url of imageUrls.slice(0, 4)) {
    content.push({
      type: "image_url",
      image_url: { url },
    });
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

    const config: EnquiryPreviewRequest = await req.json();
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
        .from("custom_enquiry_leads")
        .select("uploaded_image_urls")
        .eq("id", config.leadId)
        .eq("client_id", config.clientId)
        .maybeSingle(),
      gateRequest(config.clientId, 'enquiry_preview', STATIC_CORS_HEADERS),
      supabase.from('client_branding').select('allowed_domains').eq('id', config.clientId).maybeSingle(),
    ]);
    if (blocked) return blocked;

    // Fail closed: a failed branding lookup must not be read as "no restrictions".
    if (brandingRes.error) {
      console.error('generate-enquiry-preview: branding lookup failed', brandingRes.error);
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
    const deliverByEmail = await shouldDeliverRenderByEmail(supabase, "client_custom_enquiry_config", config.clientId);

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
    console.log("Generating enquiry preview #" + generationNumber, "with", base64Urls.length, "inspiration images (converted from", inspirationUrls.length, "URLs)");

    // Image dedup check — skip for variation regenerations
    if (generationNumber === 1) {
      const cachedUrl = await getImageDedup(config.clientId, 'enquiry_preview', config as any);
      if (cachedUrl) {
        console.log("Image dedup HIT for enquiry preview");
        await logUsage(config.clientId, 'enquiry_preview', 'cached', undefined, true);

        await supabase.from("custom_enquiry_preview_images").insert({
          lead_id: config.leadId,
          image_url: cachedUrl,
          generation_number: generationNumber,
          custom_instruction: config.customInstruction || null,
        });
        await supabase.from("custom_enquiry_leads").update({ ai_preview_url: cachedUrl }).eq("id", config.leadId);

        const emailed = await handlePendingRenderEmail(supabase, {
          leadId: config.leadId,
          clientId: config.clientId,
          formType: "custom_enquiry",
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

    // ENQUIRY_MODELS defined at module scope

    // J9: load system prompt and terminology from DB in parallel (falls back to hardcoded)
    const [dbPrompt, dbTerminology] = await Promise.all([
      loadPrompt('enquiry_preview', ENQUIRY_SYSTEM_MESSAGE.replace(JEWELRY_TERMINOLOGY_BLOCK, '')),
      loadPrompt('jewelry_terminology', JEWELRY_TERMINOLOGY_BLOCK),
    ]);
    const dynamicSystemMessage = dbPrompt + dbTerminology;

    const aiResult = await tryImageCall(dynamicSystemMessage, userContent, ENQUIRY_MODELS);

    if (!aiResult) {
      return new Response(
        JSON.stringify({ error: "AI service unavailable. Please try again later." }),
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
    const filePath = `enquiry-previews/${config.leadId}-${generationNumber}.${ext}`;
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

    await supabase.from("custom_enquiry_preview_images").insert({
      lead_id: config.leadId,
      image_url: publicUrl,
      generation_number: generationNumber,
      custom_instruction: config.customInstruction || null,
    });

    await supabase
      .from("custom_enquiry_leads")
      .update({ ai_preview_url: publicUrl })
      .eq("id", config.leadId);

    // Log usage after successful generation
    await logUsage(config.clientId, 'enquiry_preview', aiResult.model, undefined);

    // Store in image dedup cache
    await setImageDedup(config.clientId, 'enquiry_preview', config as any, publicUrl);

    console.log("Enquiry preview #" + generationNumber + " generated:", publicUrl);

    // Handle pending render email
    const emailed = await handlePendingRenderEmail(supabase, {
      leadId: config.leadId,
      clientId: config.clientId,
      formType: "custom_enquiry",
      generationNumber,
      submissionDetails,
      imageUrl: publicUrl,
      sendCustomer: deliverByEmail,
    });

    return new Response(
      JSON.stringify({ success: true, ...(emailed ? { emailed: true } : { imageUrl: publicUrl }), generationNumber }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in generate-enquiry-preview:", error);
    await logEdgeFunctionError('generate-enquiry-preview', error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate enquiry preview" }),
      { status: 500, headers: { "Content-Type": "application/json", ...STATIC_CORS_HEADERS } }
    );
  }
};

serve(handler);
