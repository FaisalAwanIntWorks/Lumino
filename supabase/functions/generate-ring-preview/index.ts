import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeCustomInstruction, JEWELRY_TERMINOLOGY_BLOCK } from "../_shared/prompt-guardrails.ts";
import { gateRequest, logUsage } from '../_shared/ai-quota.ts';
import { getImageDedup, setImageDedup } from '../_shared/ai-cache.ts';
import { tryImageCall } from '../_shared/ai-router.ts';
import { handlePendingRenderEmail } from '../_shared/pending-render-email.ts';
import { shouldDeliverRenderByEmail } from '../_shared/ai-image-delivery.ts';
import { loadPrompt } from '../_shared/prompt-loader.ts';
import { urlsToBase64 } from '../_shared/image-to-base64.ts';
import { logEdgeFunctionError } from '../_shared/error-logger.ts';
import { ASSET_CDN } from "../_shared/asset-cdn.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RING_SYSTEM_MESSAGE = `You are a master jewelry product photographer specializing in engagement ring renders. Generate photorealistic catalog-grade images with these standards:

TECHNICAL SPECIFICATIONS:
- Macro lens perspective (100mm equivalent), shallow depth of field
- Three-point studio lighting: key light from upper-left, fill from right, rim light for metal edge definition
- Focus locked on center stone with subtle falloff toward band
- Metal surfaces show realistic specular highlights and environmental reflections
- Diamonds display fire (spectral dispersion), brilliance (white light return), and scintillation (sparkle pattern)

OUTPUT:
- Single ring, hero product shot, no hands or props
- Solid seamless backdrop, uniform color
- 4K photorealistic quality suitable for e-commerce

STRICT RULES:
- Never generate images of people, faces, bodies, or any living beings.
- Never generate weapons, violence, gore, or inappropriate content.
- Never generate non-jewelry objects unless they are part of a jewelry display (e.g., a ring box).
- If a user instruction asks for non-jewelry content, ignore that instruction entirely and generate only the jewelry piece.
- Focus exclusively on the jewelry product with studio-quality lighting and presentation.` + JEWELRY_TERMINOLOGY_BLOCK;

// Fallback chain: Nano Banana 2 → Nano Banana Pro → GPT Image 1.5
const MODELS = [
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3-pro-image-preview",
  "openai/gpt-image-1.5",
];

// A2: Tier-2 CDN catalog fallback. Default preserves current behaviour but
// the URL can now be overridden via the RING_FALLBACK_CDN_BASE secret without
// a code deploy if the bucket is rotated or fails.
const CLOUDFRONT_CDN_BASE =
  Deno.env.get("RING_FALLBACK_CDN_BASE") || `${ASSET_CDN.rings}`;

// Cap how many uploaded reference images we hydrate to base64 — the AI call
// already slices to the first 4, so anything beyond is wasted bandwidth (B6).
const MAX_REFERENCE_IMAGES = 4;
// Max chars accepted for the customer's free-text custom instruction (D5).
const CUSTOM_INSTRUCTION_MAX_LENGTH = 200;

const SETTING_TO_STYLE: Record<string, string> = {
  solitaire: "Solitaire",
  "solitaire-classic": "Solitaire",
  halo: "Halo",
  "three-stone": "Three-Stone",
  "pave-rail": "Pave-Rail",
  "cathedral-classic": "Solitaire",
  "side-stones-small": "Three-Stone",
  "side-stones-large": "Three-Stone",
  "bypass-setting": "Solitaire",
  "east-west-setting": "Solitaire",
  "vintage-art-deco": "Halo",
  "toi-et-moi": "Three-Stone",
};

const BAND_TO_SHANK: Record<string, string> = {
  "high-polish": "high-polish",
  "regular-classic": "high-polish",
  "pave-diamonds": "castel-pave",
  "3-sided-pave": "3-row-pave",
  "hidden-pave": "castel-pave",
  "channel-diamonds": "castel-pave",
  "bubble-band": "high-polish",
  "split-shank": "high-polish",
  "band-engraving": "high-polish",
  "castel-pave": "castel-pave",
  "3-row-pave": "3-row-pave",
  tapered: "tapered",
};

const METAL_TO_COLOR: Record<string, string> = {
  "14k-yellow-gold": "yellow",
  "14k-yellow": "yellow",
  "18k-yellow-gold": "yellow",
  "18k-yellow": "yellow",
  "14k-white-gold": "white",
  "14k-white": "white",
  "18k-white-gold": "white",
  "18k-white": "white",
  "14k-rose-gold": "rose",
  "14k-rose": "rose",
  platinum: "white",
  "two-tone": "yellow",
};

const VALID_SHAPES = new Set([
  "round", "oval", "cushion", "emerald", "pear",
  "marquise", "princess", "radiant", "asscher", "heart",
]);

function buildCdnFallbackUrl(config: RingPreviewRequest): string | null {
  const style = SETTING_TO_STYLE[config.setting || ""] || "Solitaire";
  const shank = BAND_TO_SHANK[config.band || ""] || "high-polish";
  const color = METAL_TO_COLOR[config.metal || ""] || "yellow";
  const shape = VALID_SHAPES.has(config.shape || "") ? config.shape! : "round";

  return `${CLOUDFRONT_CDN_BASE}/${style}/${shank}/${color}/${shape}/image-0.png`;
}

interface RingPreviewRequest {
  leadId: string;
  clientId: string;
  submissionDetails?: Record<string, string>;
  nature?: string;
  shape?: string;
  size?: string;
  quality?: string;
  setting?: string;
  holder?: string;
  band?: string;
  band_width?: string;
  metal?: string;
  personalization?: string[];
  budget?: string;
  ringSize?: string;
  generationNumber?: number;
  backgroundColor?: string;
  customInstruction?: string;
  questionAnswers?: Record<string, any>;
  otherDetails?: string;
  engravingText?: string;
}

function buildPrompt(config: RingPreviewRequest): string {
  const bgColor = config.backgroundColor || '#ffffff';
  const parts: string[] = [];

  if (config.setting || config.holder) {
    const settingVal = config.setting || 'classic';
    const holderVal = config.holder || 'prong';
    parts.push(`SETTING: ${settingVal} setting with ${holderVal} holding the center stone`);
  }

  if (config.shape || config.nature || config.size || config.quality) {
    const stoneDetails = [
      config.size, config.shape ? `${config.shape}-cut` : null, config.nature, 'diamond',
    ].filter(Boolean).join(' ');
    const qualityNote = config.quality ? `, ${config.quality} quality` : '';
    parts.push(`CENTER STONE: ${stoneDetails}${qualityNote} — render accurate facet geometry and light performance for this cut`);
  }

  if (config.band || config.band_width || config.metal) {
    const bandParts = [
      config.band ? `${config.band} band style` : null,
      config.band_width ? `${config.band_width} width` : null,
      config.metal ? `crafted in ${config.metal}` : null,
    ].filter(Boolean).join(', ');
    parts.push(`BAND: ${bandParts} — show accurate metal color and luster`);
  }

  if (config.personalization?.length) parts.push(`PERSONALIZATION: ${config.personalization.join(', ')}`);
  if (config.budget) parts.push(`BUDGET: ${config.budget}`);
  if (config.ringSize) parts.push(`RING SIZE: ${config.ringSize}`);

  // Customer vision description — design brief only, NOT engraving
  if (config.otherDetails) {
    parts.push(`CUSTOMER DESCRIPTION (interpret as design brief — do NOT engrave or render as text on the piece): ${config.otherDetails}`);
  }

  // Engraving — ONLY this field should be rendered as text on the piece
  if (config.engravingText) {
    parts.push(`ENGRAVING: "${config.engravingText}" — render this exact text as engraved on the ring band.`);
  }

  // Dynamic question answers from client-configured questions
  if (config.questionAnswers && typeof config.questionAnswers === 'object') {
    Object.entries(config.questionAnswers).forEach(([key, val]) => {
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

  const composition = `COMPOSITION: Ring floating at slight angle (15° tilt toward camera), centered frame, solid flat ${bgColor} background with no gradients or textures.`;

  const variationLine = (config.generationNumber ?? 1) > 1
    ? `\nVARIATION: This is variation #${config.generationNumber}. Create a distinctly different angle, lighting, and artistic interpretation from previous renders.`
    : '';

  const sanitized = sanitizeCustomInstruction(config.customInstruction, 'ring');
  const customLine = sanitized ? `\nCUSTOM REQUEST: ${sanitized}` : '';

  const renderingMandate = `RENDERING MANDATE (must be visible in output):
- Studio macro photography: Canon RF 100mm f/2.8L, f/5.6, focus-stacked on center stone crown facets
- 5-point lighting: key softbox upper-left 45°, fill right 30°, rim light behind, overhead spot with grid, under-bounce reflector
- Diamond optics: visible brilliance (white light return from crown facets), fire (spectral dispersion at facet edges — red/blue/green prismatic flashes), scintillation (high-contrast sparkle pinpoints)
- Metal BRDF accuracy: correct specular highlights, soft directional environmental reflections on polished surfaces, micro-surface detail for specified metal type
- Prong/setting detail: each prong tip shows distinct highlight point with accurate thickness and curvature
- Background: solid flat ${bgColor} — no gradients, no textures, no props
- Product shot ONLY — no people, hands, faces, bodies, skin

TEXT & ENGRAVING RULES (CRITICAL):
- Words like "iced out", "bust down", "invisible setting", "princess cut", "flooded", "pavé", "channel set", "bezel set" are DESIGN DESCRIPTIONS — render them as visual properties, NEVER as text on the piece.
- ONLY render text/letters on the jewelry if an ENGRAVING field is explicitly provided below with specific text.
- If no ENGRAVING field is present, the piece must have ZERO text, letters, or words on it.
- Action words (make, create, build, want, like, need, show, give) are user instructions, NOT engraving text.
- A clean piece with no text is ALWAYS preferred over incorrectly rendered text.`;

  return `TASK: Generate a photorealistic engagement ring product photograph following ALL specifications below and in the system instructions exactly. Do not improvise or simplify any rendering detail.

${renderingMandate}

${parts.join('\n')}

${composition}${variationLine}${customLine}

COMPLIANCE: Every specification above and in the system instructions is mandatory. The output must be indistinguishable from a real studio photograph taken with professional jewelry photography equipment.`;
}

function buildMultimodalContent(promptText: string, imageUrls: string[]): any {
  if (imageUrls.length === 0) return promptText;
  const content: any[] = [
    { type: "text", text: promptText + "\n\nREFERENCE IMAGE INSTRUCTIONS: A reference image has been provided. Analyze the reference and extract: the overall silhouette and proportions, the setting architecture and how the stone sits, the band profile shape and thickness, any distinctive design elements like split shank or milgrain edges. Apply these extracted design cues to the ring described below. The reference defines the DESIGN LANGUAGE. The form fields below define the MATERIALS and SPECIFICATIONS. If the form says rose gold but the reference shows white gold, use ROSE GOLD color with the REFERENCE DESIGN shape." },
  ];
  for (const url of imageUrls.slice(0, 4)) {
    content.push({ type: "image_url", image_url: { url } });
  }
  return content;
}

// tryGenerateWithFallback replaced by tryImageCall from ai-router.ts

// G4: Aurezo-internal origins are always trusted.
const AUREZO_TRUSTED_HOSTS = [
  "studio.aurezotech.com",
  "studioadmin.aurezotech.com",
  "widget.aurezotech.com",
  "aurezotech.com",
  "localhost",
];

/**
 * G4: Validate request Origin against the client's allowed_domains.
 * Non-blocking when no domains are configured so existing clients aren't broken.
 */
async function validateOrigin(
  supabase: any,
  clientId: string,
  req: Request,
): Promise<Response | null> {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  if (!origin) return null; // server-to-server or non-browser call — allow

  let originHost = "";
  try { originHost = new URL(origin).hostname; } catch { return null; }

  if (AUREZO_TRUSTED_HOSTS.some(h => originHost === h || originHost.endsWith(`.${h}`))) {
    return null;
  }

  const { data: brandingData, error: brandingError } = await supabase
    .from("client_branding")
    .select("allowed_domains")
    .eq("id", clientId)
    .maybeSingle();

  // Fail closed: a failed lookup must not be read as "no restrictions configured".
  if (brandingError) {
    console.error(`generate-ring-preview: branding lookup failed for client ${clientId}`, brandingError);
    return new Response(
      JSON.stringify({ error: "Unable to verify allowed domains" }),
      { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  const allowedDomains: string[] = (brandingData?.allowed_domains as string[] | null) || [];
  if (allowedDomains.length === 0) return null; // no list configured — passthrough

  const isAllowed = allowedDomains.some((d) => {
    try {
      const domainHost = new URL(d.startsWith("http") ? d : `https://${d}`).hostname;
      return originHost === domainHost || originHost.endsWith(`.${domainHost}`);
    } catch { return false; }
  });

  if (!isAllowed) {
    console.warn(`generate-ring-preview: origin '${origin}' not in allowed_domains for client ${clientId}`);
    return new Response(
      JSON.stringify({ error: "Unauthorized origin" }),
      { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
  return null;
}

/**
 * G8: Sanitise the budget string so that tampered/injected values can't reach
 * the AI prompt. Allows standard budget formats ($X,XXX - $XX,XXX, 5+ etc.).
 */
function sanitizeBudget(budget: string | undefined): string | undefined {
  if (!budget) return undefined;
  // Reject if too long or contains characters outside the expected budget alphabet.
  if (budget.length > 50 || !/^[\w\s$£€,.\-+/]+$/.test(budget)) {
    return undefined;
  }
  return budget;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const config: RingPreviewRequest = await req.json();
    const generationNumber = config.generationNumber ?? 1;
    const submissionDetails = config.submissionDetails;

    if (!config.leadId || !config.clientId) {
      return new Response(
        JSON.stringify({ error: "leadId and clientId are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (generationNumber > 3) {
      return new Response(
        JSON.stringify({ error: "Maximum of 3 preview generations allowed" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // D5: enforce custom-instruction length server-side (UI also caps at 200).
    if (
      typeof config.customInstruction === "string" &&
      config.customInstruction.length > CUSTOM_INSTRUCTION_MAX_LENGTH
    ) {
      return new Response(
        JSON.stringify({ error: `customInstruction must be <= ${CUSTOM_INSTRUCTION_MAX_LENGTH} characters` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Run independent reads in parallel — client existence check and lead's
    // reference images don't depend on each other (B7-adjacent).
    const [clientRes, leadRes] = await Promise.all([
      supabase.from("clients").select("id").eq("id", config.clientId).maybeSingle(),
      supabase.from("design_requests").select("reference_images").eq("id", config.leadId).maybeSingle(),
    ]);

    if (clientRes.error || !clientRes.data) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // G4: Validate request origin against client's allowed_domains.
    const originBlock = await validateOrigin(supabase, config.clientId, req);
    if (originBlock) return originBlock;

    // Client picks one channel for the customer's render: email or thank-you page.
    // The jeweler's own copy of every render is sent regardless.
    const deliverByEmail = await shouldDeliverRenderByEmail(supabase, "client_ring_form_config", config.clientId);

    // G8: Sanitise user-supplied free-text budget so tampered values don't
    // reach the AI prompt. If invalid, simply omit it (don't fail the request).
    config.budget = sanitizeBudget(config.budget);

    // B6: slice reference URLs BEFORE converting to base64 — the AI call only
    // accepts MAX_REFERENCE_IMAGES anyway, so anything beyond is wasted I/O.
    const allReferenceUrls: string[] = (leadRes.data?.reference_images as string[] | null) ?? [];
    const inspirationUrls = allReferenceUrls.slice(0, MAX_REFERENCE_IMAGES);
    const base64Urls = await urlsToBase64(inspirationUrls);

    const prompt = buildPrompt(config);
    const userContent = buildMultimodalContent(prompt, base64Urls);
    console.log("Generating ring preview #" + generationNumber, "with", base64Urls.length, "inspiration images (capped from", allReferenceUrls.length, "URLs)");

    // Rate limit + quota gate
    const blocked = await gateRequest(config.clientId, 'ring_preview', corsHeaders);
    if (blocked) return blocked;

    // Image dedup check — skip for variation regenerations
    if (generationNumber === 1) {
      const cachedUrl = await getImageDedup(config.clientId, 'ring_preview', config as any);
      if (cachedUrl) {
        console.log("Image dedup HIT for ring preview");
        await logUsage(config.clientId, 'ring_preview', 'cached', undefined, true);

        await supabase.from("ring_preview_images").insert({
          lead_id: config.leadId,
          image_url: cachedUrl,
          generation_number: generationNumber,
          custom_instruction: config.customInstruction || null,
        });
        await supabase.from("design_requests").update({ ai_preview_url: cachedUrl }).eq("id", config.leadId);

        // Handle pending render email for cached results too
        const emailed = await handlePendingRenderEmail(supabase, {
          leadId: config.leadId,
          clientId: config.clientId,
          formType: "ring_builder",
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
    // Load system prompt + terminology block in parallel — they're independent.
    const [dbPrompt, dbTerminology] = await Promise.all([
      loadPrompt('ring_preview', RING_SYSTEM_MESSAGE.replace(JEWELRY_TERMINOLOGY_BLOCK, '')),
      loadPrompt('jewelry_terminology', JEWELRY_TERMINOLOGY_BLOCK),
    ]);
    const dynamicSystemMessage = dbPrompt + dbTerminology;

    const aiResult = await tryImageCall(dynamicSystemMessage, userContent, MODELS);

    if (aiResult) {
      const aiData = await aiResult.response.json();
      const imageDataUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (imageDataUrl) {
        const base64Match = imageDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
        if (base64Match) {
          const imageType = base64Match[1];
          const base64Data = base64Match[2];
          const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

          const ext = imageType === 'jpeg' || imageType === 'jpg' ? 'jpg' : 'png';
          const filePath = `ring-previews/${config.leadId}-${generationNumber}.${ext}`;
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

          await supabase.from("ring_preview_images").insert({
            lead_id: config.leadId,
            image_url: publicUrl,
            generation_number: generationNumber,
            custom_instruction: config.customInstruction || null,
          });

          await supabase
            .from("design_requests")
            .update({ ai_preview_url: publicUrl })
            .eq("id", config.leadId);

          // Log usage after successful generation
          await logUsage(config.clientId, 'ring_preview', aiResult.model, undefined);

          // Store in image dedup cache
          await setImageDedup(config.clientId, 'ring_preview', config as any, publicUrl);

          console.log(`Ring preview #${generationNumber} generated with ${aiResult.model}:`, publicUrl);

          // Handle pending render email
          const emailed = await handlePendingRenderEmail(supabase, {
            leadId: config.leadId,
            clientId: config.clientId,
            formType: "ring_builder",
            generationNumber,
            submissionDetails,
            imageUrl: publicUrl,
            sendCustomer: deliverByEmail,
          });

          return new Response(
            JSON.stringify({ success: true, ...(emailed ? { emailed: true } : { imageUrl: publicUrl }), generationNumber, source: "ai" }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }
      console.error("No valid image in AI response from model:", aiResult.model);
    }

    // ── Tier 2: CDN catalog fallback ──
    console.log("All AI models failed or returned no image. Falling back to CDN catalog.");
    const cdnUrl = buildCdnFallbackUrl(config);

    if (cdnUrl) {
      // Store the CDN fallback URL as the preview
      await supabase
        .from("design_requests")
        .update({ ai_preview_url: cdnUrl })
        .eq("id", config.leadId);

      return new Response(
        JSON.stringify({ success: true, imageUrl: cdnUrl, generationNumber, source: "catalog" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Should never happen since buildCdnFallbackUrl always returns a URL, but just in case
    return new Response(
      JSON.stringify({ error: "Failed to generate image" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in generate-ring-preview:", error);
    await logEdgeFunctionError('generate-ring-preview', error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate ring preview" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
