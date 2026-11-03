/**
 * AI router.
 *
 * Provider chain: Lovable Gateway (the only configured provider).
 * Falls through on 429 (rate limit) or 402 (credits exhausted).
 * Stops on other errors (400, 500, etc.).
 *
 * Usage:
 *   import { tryAICall, tryImageCall } from '../_shared/ai-router.ts';
 *   const result = await tryAICall({ messages, model: 'google/gemini-2.5-flash' });
 *   if (!result) return errorResponse;
 *   const data = await result.response.json();
 */

// ── Provider configuration ──

interface ProviderConfig {
  name: string;
  baseUrl: string;
  getApiKey: () => string | undefined;
  /** Map from canonical model → provider-specific model name */
  modelMap: Record<string, string>;
  /** Custom headers beyond Authorization */
  extraHeaders?: Record<string, string>;
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'lovable',
    baseUrl: 'https://ai.gateway.lovable.dev/v1',
    getApiKey: () => Deno.env.get('LOVABLE_API_KEY'),
    modelMap: {
      'google/gemini-2.5-flash': 'google/gemini-2.5-flash',
      'google/gemini-2.5-pro': 'google/gemini-2.5-pro',
      'google/gemini-3-flash-preview': 'google/gemini-3-flash-preview',
      'google/gemini-3.1-flash-image-preview': 'google/gemini-3.1-flash-image-preview',
      'google/gemini-3-pro-image-preview': 'google/gemini-3-pro-image-preview',
      'google/gemini-2.5-flash-image': 'google/gemini-2.5-flash-image',
      'openai/gpt-5-mini': 'openai/gpt-5-mini',
      'openai/gpt-image-1.5': 'openai/gpt-image-1.5',
    },
  },
];

// ── Types ──

export interface AICallOptions {
  model: string;
  messages: Array<{ role: string; content: any }>;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: any;
  modalities?: string[];
  stream?: boolean;
}

export interface AICallResult {
  response: Response;
  provider: string;
  model: string;
}

// Retryable status codes
const RETRYABLE_STATUSES = new Set([429, 402]);

// Per-provider fetch timeout (leaves buffer before Supabase wall-time limit)
const FETCH_TIMEOUT_MS = 25_000;

// Per-model timeout for image generation. Lowered from 90s → 45s to cap hung-call compute cost.
// Combined with MAX_IMAGE_MODEL_FAILURES, total worst-case wall time is ~90s instead of ~360s.
const IMAGE_FETCH_TIMEOUT_MS = 45_000;

// Stop the fallback chain after this many model attempts fail (across all providers/models).
// Prevents paying for the full 4-model chain when the AI provider is degraded.
const MAX_IMAGE_MODEL_FAILURES = 2;

// Models that actually support image generation via chat completions
const IMAGE_CAPABLE_MODELS = new Set([
  'google/gemini-3.1-flash-image-preview',
  'google/gemini-3-pro-image-preview',
  'google/gemini-2.5-flash-image',
  'openai/gpt-image-1.5',
]);

/**
 * Try an AI chat completion across all configured providers.
 * Returns null if all providers fail.
 */
export async function tryAICall(options: AICallOptions): Promise<AICallResult | null> {
  for (const provider of PROVIDERS) {
    const apiKey = provider.getApiKey();
    if (!apiKey) {
      console.log(`AI Router: Skipping ${provider.name} (no API key)`);
      continue;
    }

    const providerModel = provider.modelMap[options.model] || options.model;
    const url = `${provider.baseUrl}/chat/completions`;

    const body: Record<string, any> = {
      model: providerModel,
      messages: options.messages,
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
    if (options.tools) body.tools = options.tools;
    if (options.tool_choice) body.tool_choice = options.tool_choice;
    if (options.modalities) body.modalities = options.modalities;
    if (options.stream !== undefined) body.stream = options.stream;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        console.log(`AI Router: Trying ${provider.name} with model ${providerModel}`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(provider.extraHeaders || {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

      if (response.ok) {
        clearTimeout(timeoutId);
        console.log(`AI Router: Success with ${provider.name}`);
        return { response, provider: provider.name, model: providerModel };
      }

      clearTimeout(timeoutId);
      const status = response.status;
      const errText = await response.text();
      console.error(`AI Router: ${provider.name} failed (${status}):`, errText.substring(0, 200));

      if (RETRYABLE_STATUSES.has(status)) {
        // Try next provider
        continue;
      }

      // Non-retryable error (400, 500, etc.) — stop trying
      return null;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.error(`AI Router: ${provider.name} timed out after ${FETCH_TIMEOUT_MS}ms`);
      } else {
        console.error(`AI Router: ${provider.name} network error:`, err);
      }
      continue;
    }
  }

  console.error('AI Router: All providers exhausted');
  return null;
}

/**
 * Try image generation with model fallback chain within a provider,
 * then fall through to next provider on 429/402.
 *
 * Used by generate-ring-preview, generate-grillz-preview, generate-enquiry-preview.
 */
export async function tryImageCall(
  systemMessage: string,
  userContent: any,
  models: string[],
): Promise<AICallResult | null> {
  // Log payload diagnostics
  const payloadStr = JSON.stringify(userContent);
  const payloadSizeKB = Math.round(payloadStr.length / 1024);
  const hasImages = payloadStr.includes('image_url') || payloadStr.includes('data:image');
  console.log(`AI Router (image): Payload ~${payloadSizeKB}KB, contains reference images: ${hasImages}`);

  let failureCount = 0;

  for (const provider of PROVIDERS) {
    const apiKey = provider.getApiKey();
    if (!apiKey) continue;

    for (const model of models) {
      if (failureCount >= MAX_IMAGE_MODEL_FAILURES) {
        console.warn(`AI Router (image): Early-exit after ${failureCount} model failures (cap=${MAX_IMAGE_MODEL_FAILURES}). Falling through to CDN.`);
        return null;
      }
      // Skip this provider if the resolved model isn't image-capable
      const providerModel = provider.modelMap[model] || model;
      if (!IMAGE_CAPABLE_MODELS.has(model) && provider.name !== 'lovable') {
        console.log(`AI Router (image): Skipping ${provider.name} → ${providerModel} (not image-capable)`);
        continue;
      }

      const url = `${provider.baseUrl}/chat/completions`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

      try {
        console.log(`AI Router (image): Trying ${provider.name} → ${providerModel} (timeout ${IMAGE_FETCH_TIMEOUT_MS}ms)`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(provider.extraHeaders || {}),
          },
          body: JSON.stringify({
            model: providerModel,
            messages: [
              { role: 'system', content: systemMessage },
              { role: 'user', content: userContent },
            ],
            modalities: ['image', 'text'],
          }),
          signal: controller.signal,
        });

        if (response.ok) {
          clearTimeout(timeoutId);
          console.log(`AI Router (image): Success with ${provider.name} → ${providerModel}`);
          return { response, provider: provider.name, model: providerModel };
        }

        clearTimeout(timeoutId);
        const status = response.status;
        const errText = await response.text();
        console.error(`AI Router (image): ${provider.name} ${providerModel} failed (${status}):`, errText.substring(0, 200));

        if (status === 402) {
          // No credits — stop entirely
          console.error('AI Router (image): 402 — stopping all attempts (no credits)');
          return null;
        }

        // For 429, 400, 500, timeouts — continue to next model/provider
        failureCount++;
        console.log(`AI Router (image): Will try next model/provider after ${status} error (failures=${failureCount}/${MAX_IMAGE_MODEL_FAILURES})`);
        continue;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.error(`AI Router (image): ${provider.name} ${providerModel} timed out after ${IMAGE_FETCH_TIMEOUT_MS}ms`);
        } else {
          console.error(`AI Router (image): ${provider.name} ${providerModel} network error:`, err);
        }
        failureCount++;
        // Timeout or network error — try next model
        continue;
      }
    }
  }

  console.error('AI Router (image): All providers and models exhausted');
  return null;
}
