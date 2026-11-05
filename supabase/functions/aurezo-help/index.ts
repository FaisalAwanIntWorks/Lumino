import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gateRequest, logUsage, extractTokens } from '../_shared/ai-quota.ts';
import { getChatCache, setChatCache } from '../_shared/ai-cache.ts';
import { tryAICall } from '../_shared/ai-router.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AUREZO_KNOWLEDGE = `
You are a helpful assistant for Aurezo, a jewelry platform that helps jewelry businesses create custom configurators.

KEY FEATURES:
1. Product Management:
   - Add/edit products with pricing, manufacturing costs, and variations
   - Configure metal types, stone types, shapes, carats, styles, and shanks
   - Upload images and 3D models
   - Enable/disable manufacturing options per product
   - Categorize products (Engagement Rings, Grills, etc.)

2. Client Management:
   - Manage client access to products
   - Set custom pricing and markups per client
   - Track client orders and commissions
   - Enable/disable manufacturing options per client

3. Manufacturing:
   - Allow Aurezo manufacturing or self-manufacturing
   - Track manufacturing status and CAD files
   - Manage manufacturing requests from clients
   - View manufacturing timeline and delivery estimates

4. Commission Tracking:
   - Default 10% commission on all orders
   - Custom commission rates per client available
   - Track collected vs outstanding commissions
   - Generate commission reports by client and category

5. Analytics:
   - View total revenue, orders, and average order value
   - Track top products and clients
   - Analyze category performance
   - Monitor commission collection status

6. Design Requests:
   - Clients can submit custom design requests
   - Admins can review, approve, and assign priority
   - Track request status and completion timeline

7. AI Configuration:
   - Configure chatbot for product recommendations
   - Customize system prompts and training examples
   - Integrate with client websites via embed code

COMMON WORKFLOWS:
- Adding a Product: Go to Products → Add Product → Fill in details, pricing, and variations
- Managing Client Access: Go to Products → Client Access tab → Enable/disable products per client
- Enabling Manufacturing: Edit product → Check "Allow Manufacturing" → Set manufacturing cost
- Viewing Analytics: Dashboard shows key metrics, or go to detailed Analytics page
- Commission Tracking: View commission status on Dashboard or Analytics page

Be helpful, concise, and guide users through these features. Use the context of their current page to provide relevant suggestions.
`;

// Deterministic embedding (must match parse-pdf to make RAG work without external embedding models)
function generateSimpleEmbedding(text: string): number[] {
  const dimensions = 768;
  const embedding = new Array(dimensions).fill(0);
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const index = (charCode * (i + 1) * (j + 1)) % dimensions;
      embedding[index] += 1 / (1 + Math.log(words.length || 1));
    }
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }

  return embedding;
}

type RetrievedChunk = {
  content: string;
  document_id?: string;
  similarity?: number;
};

type RetrievedContext = {
  context: string;
  chunks: RetrievedChunk[];
};

function isPlatformHelpQuery(text: string): boolean {
  const t = (text || '').toLowerCase();
  const keywords = [
    'aurezo',
    'dashboard',
    'embed',
    'configurator',
    'product',
    'products',
    'catalog',
    'client',
    'clients',
    'order',
    'orders',
    'commission',
    'manufacturing',
    'pricing',
    'markup',
    'shopify',
    'login',
    'signup',
    'settings',
  ];
  return keywords.some((k) => t.includes(k));
}

// Retrieve relevant document chunks
async function retrieveContext(query: string, clientId: string): Promise<RetrievedContext> {
  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Check if client has any documents
    const { data: docs, error: docsError } = await supabase
      .from('ai_documents')
      .select('id')
      .eq('client_id', clientId)
      .eq('status', 'ready')
      .limit(1);

    if (docsError || !docs || docs.length === 0) {
      console.log('No documents found for client:', clientId);
      return { context: '', chunks: [] };
    }

    const queryTrimmed = String(query || '').trim();
    if (!queryTrimmed) return { context: '', chunks: [] };

    // Generate embedding for the query (same algorithm used when indexing)
    const queryEmbedding = generateSimpleEmbedding(queryTrimmed);

    const MAX_MATCHES = 5;

    // Vector search
    const { data: chunks, error: searchError } = await supabase.rpc('match_document_chunks', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_client_id: clientId,
      match_threshold: 0.25,
      match_count: MAX_MATCHES,
    });

    if (searchError) {
      console.error('Search error:', searchError);
    }

    const vectorChunks: RetrievedChunk[] = Array.isArray(chunks) ? chunks : [];

    // Keyword search (always run; it helps queries like “abstract”, names, headings)
    const stop = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'your', 'section', 'about', 'what', 'know']);
    const tokens = Array.from(
      new Set(
        queryTrimmed
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length >= 4 && !stop.has(t))
          .slice(0, 8),
      ),
    );

    const phraseText = tokens.join(' ');
    const phraseLike = tokens.join('%');

    let keywordChunks: Array<RetrievedChunk & { _score: number }> = [];
    if (tokens.length > 0) {
      const MAX_KEYWORD_CANDIDATES = 140;
      let candidates: Array<{ content: string; document_id: string | null }> = [];

      // Phrase-first search so headings don't get drowned out by common tokens like "data"
      if (phraseLike.length > 0) {
        const { data: phraseChunks, error: phraseError } = await supabase
          .from('ai_document_chunks')
          .select('content, document_id')
          .eq('client_id', clientId)
          .ilike('content', `%${phraseLike}%`)
          .limit(10);

        if (phraseError) {
          console.error('Phrase search error:', phraseError);
        } else if (phraseChunks?.length) {
          candidates = candidates.concat(
            phraseChunks.map((c: any) => ({
              content: String(c?.content ?? ''),
              document_id: c?.document_id ?? null,
            })),
          );
        }
      }

      const or = tokens.map((t) => `content.ilike.%${t.replace(/%/g, '')}%`).join(',');
      const { data: kwChunks, error: kwError } = await supabase
        .from('ai_document_chunks')
        .select('content, document_id')
        .eq('client_id', clientId)
        .or(or)
        .limit(MAX_KEYWORD_CANDIDATES);

      if (kwError) {
        console.error('Keyword search error:', kwError);
      } else if (kwChunks?.length) {
        candidates = candidates.concat(
          kwChunks.map((c: any) => ({
            content: String(c?.content ?? ''),
            document_id: c?.document_id ?? null,
          })),
        );
      }

      // Deduplicate + score client-side (so we can reliably pick the best chunk)
      const dedup = new Map<string, { content: string; document_id: string | null }>();
      for (const c of candidates) {
        const content = String(c?.content ?? '');
        const key = `${c?.document_id ?? ''}::${content.slice(0, 160)}`;
        if (!dedup.has(key)) dedup.set(key, { content, document_id: c?.document_id ?? null });
      }

      keywordChunks = Array.from(dedup.values())
        .map((c) => {
          const content = String(c.content ?? '');
          const normalized = content.toLowerCase().replace(/\s+/g, ' ');
          const hits = tokens.reduce((acc, t) => (normalized.includes(t) ? acc + 1 : acc), 0);
          const base = Math.min(1, hits / Math.max(1, tokens.length));
          const phraseBonus = phraseText && normalized.includes(phraseText) ? 0.6 : 0;
          const score = Math.min(1.6, base + phraseBonus);
          return { content, document_id: c.document_id ?? undefined, similarity: undefined, _score: score };
        })
        .sort((a, b) => (b._score ?? 0) - (a._score ?? 0))
        .slice(0, 25);
    }

    // Merge + rank (prefer higher semantic similarity, but boost strong keyword hits)
    const merged = new Map<string, RetrievedChunk & { _rank: number }>();

    for (const c of vectorChunks) {
      const key = `${c.document_id ?? ''}::${String(c.content ?? '').slice(0, 120)}`;
      const sim = typeof c.similarity === 'number' ? c.similarity : 0;
      merged.set(key, { ...c, _rank: sim });
    }

    for (const c of keywordChunks) {
      const key = `${c.document_id ?? ''}::${String(c.content ?? '').slice(0, 120)}`;
      const existing = merged.get(key);
      const kwBoost = 0.7 * (c._score ?? 0); // strong boost so exact-heading hits win over generic tokens
      const base = existing?._rank ?? 0;
      merged.set(key, {
        content: c.content,
        document_id: c.document_id,
        similarity: existing?.similarity,
        _rank: Math.max(base, kwBoost),
      });
    }

    const finalChunks: RetrievedChunk[] = Array.from(merged.values())
      .sort((a, b) => (b._rank ?? 0) - (a._rank ?? 0))
      .slice(0, MAX_MATCHES)
      .map(({ _rank, ...rest }) => rest);

    if (finalChunks.length === 0) {
      console.log('No relevant chunks found');
      return { context: '', chunks: [] };
    }

    console.log(`Found ${finalChunks.length} relevant chunks`);

    const contextParts = finalChunks.map((chunk, idx) => {
      const relevance = typeof chunk.similarity === 'number' ? ` (relevance: ${(chunk.similarity * 100).toFixed(0)}%)` : '';
      return `[Document Context ${idx + 1}${relevance}]:\n${chunk.content}`;
    });

    return {
      context: `\n\n--- DOCUMENT CONTEXT ---\n${contextParts.join('\n\n')}\n\n--- END DOCUMENT CONTEXT ---\n`,
      chunks: finalChunks,
    };
  } catch (error) {
    console.error('Error retrieving context:', error);
    return { context: '', chunks: [] };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context, clientId } = await req.json();

    const userMessages = Array.isArray(messages) ? messages.filter((m: any) => m.role === 'user') : [];
    const latestUserMessage = userMessages[userMessages.length - 1]?.content || '';

    // Retrieve doc context + chunks (RAG)
    let retrieved: RetrievedContext = { context: '', chunks: [] };
    if (clientId && latestUserMessage) {
      retrieved = await retrieveContext(latestUserMessage, clientId);
    }

    // Build sources list for UI
    let sources: Array<{ filename: string | null; snippet: string; similarity: number | null }> = [];
    if (retrieved.chunks.length > 0) {
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
      const docIds = Array.from(
        new Set(retrieved.chunks.map((c) => c.document_id).filter((x): x is string => typeof x === 'string' && x.length > 0)),
      );
      const docNameById = new Map<string, string>();
      if (docIds.length > 0) {
        const { data: docs } = await supabase.from('ai_documents').select('id, filename').in('id', docIds);
        (docs || []).forEach((d: any) => {
          if (d?.id) docNameById.set(d.id, d?.filename ?? d.id);
        });
      }
      sources = retrieved.chunks.slice(0, 5).map((c) => ({
        filename: c.document_id ? docNameById.get(c.document_id) ?? null : null,
        similarity: typeof c.similarity === 'number' ? c.similarity : null,
        snippet: String(c.content || '').slice(0, 320),
      }));
    }

    const onAiConfigurator = typeof context === 'string' && context.includes('/dashboard/ai-configurator');
    const shouldForceDocQA = !onAiConfigurator && retrieved.context.length > 0 && !isPlatformHelpQuery(latestUserMessage);
    const isDocumentChat = onAiConfigurator || shouldForceDocQA;

    const documentChatPrompt = `You are a document Q&A assistant.
Use ONLY the DOCUMENT CONTEXT provided below.
If the user asks for a specific section (e.g., "abstract"), return the most relevant excerpt(s) you can find in the context (quote verbatim) and optionally add a short 1–2 sentence summary.
If the context contains partial relevant information, answer with what you have rather than refusing.
If the answer is not in the context at all, say: "I couldn't find that in your uploaded PDF." and suggest a shorter, keyword-based query.`;

    const systemPrompt = isDocumentChat
      ? `${documentChatPrompt}${retrieved.context || '\n\n--- DOCUMENT CONTEXT ---\n(No relevant context found in uploaded documents.)\n--- END DOCUMENT CONTEXT ---\n'}`
      : `${AUREZO_KNOWLEDGE}${retrieved.context}

User is currently on: ${context}
Provide contextual help based on their location. If DOCUMENT CONTEXT is present and relevant, prioritize it for the answer.`;

    const messagesForModel = isDocumentChat
      ? (Array.isArray(messages) ? messages.filter((m: any) => m.role === 'user').slice(-6) : [])
      : messages;

    // Rate limit + quota gate
    if (clientId) {
      const blocked = await gateRequest(clientId, 'help_chat', corsHeaders);
      if (blocked) return blocked;
    }

    // Cache check for simple queries
    const userMsgs = Array.isArray(messages) ? messages.filter((m: any) => m.role === 'user') : [];
    const lastMsg = userMsgs[userMsgs.length - 1]?.content || '';
    if (clientId && lastMsg) {
      const cached = await getChatCache(clientId, 'help_chat', lastMsg, (messages?.length || 0));
      if (cached) {
        console.log('Help chat cache HIT');
        await logUsage(clientId, 'help_chat', 'google/gemini-2.5-flash', undefined, true);
        return new Response(JSON.stringify(cached.response_data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const aiResult = await tryAICall({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'system', content: systemPrompt }, ...(messagesForModel || [])],
    });

    if (!aiResult) {
      return new Response(JSON.stringify({ error: 'AI service unavailable. Please try again later.' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await aiResult.response.json();
    const assistantMessage = data.choices[0].message.content;

    // Log usage after successful call
    if (clientId) {
      const tokens = extractTokens(data);
      await logUsage(clientId, 'help_chat', aiResult.model, tokens);
    }

    const responsePayload = {
      response: assistantMessage,
      usedRag: retrieved.context.length > 0,
      sources,
    };

    // Cache the response for simple queries
    if (clientId && lastMsg && (messages?.length || 0) <= 3) {
      await setChatCache(clientId, 'help_chat', lastMsg, responsePayload);
    }

    return new Response(
      JSON.stringify(responsePayload),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    // SECURITY: Never leak internal error details
    console.error('Error in aurezo-help function');
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
