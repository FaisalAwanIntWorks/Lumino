import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Sanitize text for storage + retrieval
function sanitizeText(text: string): string {
  let t = String(text ?? '')
    .replace(/\u0000/g, '')
    // Remove control characters except newline/tab/carriage return
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n?/g, '\n');

  // Fix common PDF line-break hyphenation: "representa-\n tion" / "representa-\ntion" -> "representation"
  t = t.replace(/-\n\s*(?=[A-Za-z0-9])/g, '');

  // Preserve paragraph breaks, but turn single newlines into spaces (PDFs often hard-wrap lines)
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.replace(/\n\n/g, '<<<PARA>>>');
  t = t.replace(/\n+/g, ' ');
  t = t.replace(/<<<PARA>>>/g, '\n\n');

  // Normalize horizontal whitespace
  t = t.replace(/[ \t\f\v]+/g, ' ');
  t = t.replace(/ *\n\n */g, '\n\n');

  return t.trim();
}

function chunkText(text: string, chunkSize = 1500, overlap = 200): string[] {
  const chunks: string[] = [];
  const cleanText = sanitizeText(text);

  if (cleanText.length <= chunkSize) {
    return cleanText.length > 50 ? [cleanText] : [];
  }

  let start = 0;
  while (start < cleanText.length) {
    let end = start + chunkSize;

    if (end < cleanText.length) {
      const lastPeriod = cleanText.lastIndexOf('.', end);
      const lastNewline = cleanText.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + chunkSize / 2) {
        end = breakPoint + 1;
      }
    }

    const chunk = cleanText.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);

    start = Math.max(0, end - overlap);
    if (start >= cleanText.length) break;
  }

  return chunks;
}

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
    for (let i = 0; i < dimensions; i++) embedding[i] = embedding[i] / magnitude;
  }

  return embedding;
}

function looksReadable(text: string): boolean {
  const sample = text.slice(0, 12000);
  if (!sample) return false;

  const letters = (sample.match(/[A-Za-z]/g) || []).length;
  const printable = (sample.match(/[\x09\x0A\x0D\x20-\x7E]/g) || []).length;

  const letterRatio = letters / Math.max(sample.length, 1);
  const printableRatio = printable / Math.max(sample.length, 1);

  // Heuristic: text-based PDFs should have lots of printable ASCII + some letters.
  return letterRatio > 0.06 && printableRatio > 0.65;
}

function isLikelyTextContentStream(inflatedText: string): boolean {
  const sample = inflatedText.slice(0, 20000);
  if (!sample.includes('BT') || !sample.includes('ET')) return false;
  if (!/(\bTj\b|\bTJ\b)/.test(sample)) return false;

  const letters = (sample.match(/[A-Za-z]/g) || []).length;
  const printable = (sample.match(/[\x09\x0A\x0D\x20-\x7E]/g) || []).length;

  const letterRatio = letters / Math.max(sample.length, 1);
  const printableRatio = printable / Math.max(sample.length, 1);

  return letterRatio > 0.06 && printableRatio > 0.55;
}

function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  // PDF FlateDecode is zlib-wrapped DEFLATE
  const ds = new DecompressionStream('deflate');
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Response(ab).body?.pipeThrough(ds);
  if (!stream) throw new Error('No stream for decompression');
  const outAb = await new Response(stream).arrayBuffer();
  return new Uint8Array(outAb);
}

function decodePdfHexString(hexBody: string): string {
  const cleaned = hexBody.replace(/\s+/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    const pair = cleaned.slice(i, i + 2);
    if (pair.length < 2) break;
    const v = Number.parseInt(pair, 16);
    if (!Number.isFinite(v)) break;
    bytes.push(v);
  }

  const u8 = new Uint8Array(bytes);
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    // UTF-16BE with BOM
    return new TextDecoder('utf-16be', { fatal: false }).decode(u8);
  }

  return new TextDecoder('latin1', { fatal: false }).decode(u8);
}

function decodePdfLiteralString(lit: string): string {
  // lit is content inside (...) without the outer parens
  let out = '';
  for (let i = 0; i < lit.length; i++) {
    const ch = lit[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }

    const next = lit[i + 1] ?? '';
    if (next === 'n') {
      out += '\n';
      i++;
      continue;
    }
    if (next === 'r') {
      out += '\r';
      i++;
      continue;
    }
    if (next === 't') {
      out += '\t';
      i++;
      continue;
    }
    if (next === 'b') {
      out += '\b';
      i++;
      continue;
    }
    if (next === 'f') {
      out += '\f';
      i++;
      continue;
    }
    if (next === '(' || next === ')' || next === '\\') {
      out += next;
      i++;
      continue;
    }

    // Octal escapes: \ddd (1-3 digits)
    if (/[0-7]/.test(next)) {
      let oct = next;
      if (/[0-7]/.test(lit[i + 2] ?? '')) oct += lit[i + 2];
      if (/[0-7]/.test(lit[i + 3] ?? '') && oct.length < 3) oct += lit[i + 3];
      const code = Number.parseInt(oct, 8);
      out += String.fromCharCode(code);
      i += oct.length;
      continue;
    }

    // Unknown escape: drop backslash, keep char
    out += next;
    i++;
  }
  return out;
}

function extractTextObjects(
  pdfContent: string,
  opts: { maxResults?: number; maxScanChars?: number } = {},
): string[] {
  const maxResults = opts.maxResults ?? 5000;
  const maxScanChars = opts.maxScanChars ?? 450_000;

  const results: string[] = [];
  let idx = 0;
  let scanned = 0;

  while (idx < pdfContent.length && scanned < maxScanChars && results.length < maxResults) {
    const bt = pdfContent.indexOf('BT', idx);
    if (bt === -1) break;

    const et = pdfContent.indexOf('ET', bt + 2);
    if (et === -1) break;

    // Safety: cap work per BT..ET block
    const blockLen = Math.min(et - (bt + 2), 120_000);
    const block = pdfContent.slice(bt + 2, bt + 2 + blockLen);
    scanned += block.length;

    for (let i = 0; i < block.length && results.length < maxResults; i++) {
      const ch = block[i];

      // Literal string: ( ... )
      if (ch === '(') {
        let depth = 1;
        let j = i + 1;
        let inner = '';
        let escaped = false;

        for (; j < block.length; j++) {
          const c = block[j];
          if (escaped) {
            inner += c;
            escaped = false;
            continue;
          }
          if (c === '\\') {
            escaped = true;
            inner += c;
            continue;
          }
          if (c === '(') {
            depth++;
            inner += c;
            continue;
          }
          if (c === ')') {
            depth--;
            if (depth === 0) break;
            inner += c;
            continue;
          }
          inner += c;
          if (inner.length > 8192) break;
        }

        if (depth === 0) {
          const decoded = decodePdfLiteralString(inner);
          const cleaned = decoded.trim();
          if (cleaned.length > 0) results.push(cleaned);
          i = j;
        }

        continue;
      }

      // Hex string: <...> (avoid dictionaries << >>)
      if (ch === '<' && block[i + 1] !== '<') {
        let j = i + 1;
        let hexBody = '';
        for (; j < block.length; j++) {
          const c = block[j];
          if (c === '>') break;
          hexBody += c;
          if (hexBody.length > 8192) break;
        }

        if (j < block.length && block[j] === '>') {
          const decoded = decodePdfHexString(hexBody);
          const cleaned = decoded.trim();
          if (cleaned.length > 0) results.push(cleaned);
          i = j;
        }
      }
    }

    idx = et + 2;
  }

  return results;
}

// Robust-ish text extraction for *text-based* PDFs:
// - Decompresses FlateDecode content streams and extracts strings from BT..ET blocks.
// - CPU-safe: caps decompressions + caps extraction + skips non-text streams.
async function extractTextFromPdf(pdfBytes: Uint8Array): Promise<string> {
  const decoder = new TextDecoder('latin1', { fatal: false });
  const raw = decoder.decode(pdfBytes);

  const parts: string[] = [];

  // We scan more candidates, but only decompress a limited number.
  const maxCandidates = 80;
  const maxInflations = 18;

  const maxStreamBytes = 350_000;
  const maxParts = 6000;
  const maxJoinedChars = 280_000;

  let pos = 0;
  let candidatesScanned = 0;
  let inflationsTried = 0;
  let joinedChars = 0;

  const pushTexts = (texts: string[]) => {
    for (const t of texts) {
      if (parts.length >= maxParts || joinedChars >= maxJoinedChars) return;
      const cleaned = t.trim();
      if (!cleaned) continue;
      parts.push(cleaned);
      joinedChars += cleaned.length + 1;
    }
  };

  while (
    candidatesScanned < maxCandidates &&
    inflationsTried < maxInflations &&
    joinedChars < maxJoinedChars &&
    parts.length < maxParts
  ) {
    const f = raw.indexOf('/FlateDecode', pos);
    if (f === -1) break;
    candidatesScanned++;

    const streamPos = raw.indexOf('stream', f);
    if (streamPos === -1) {
      pos = f + 10;
      continue;
    }

    // Best-effort: inspect the stream dictionary to skip obvious non-text streams.
    const dictStart = raw.lastIndexOf('<<', f);
    const dictSnippet = (dictStart !== -1 && dictStart < streamPos)
      ? raw.slice(dictStart, Math.min(streamPos, dictStart + 2400))
      : '';

    // Skip images + xref + object streams (these are usually binary and waste compute).
    if (
      dictSnippet.includes('/Subtype /Image') ||
      dictSnippet.includes('/Type /XRef') ||
      dictSnippet.includes('/Type /ObjStm')
    ) {
      pos = streamPos + 6;
      continue;
    }

    let dataStart = streamPos + 6;
    const c0 = raw[dataStart];
    const c1 = raw[dataStart + 1];
    if (c0 === '\r' && c1 === '\n') dataStart += 2;
    else if (c0 === '\n' || c0 === '\r') dataStart += 1;

    const endStreamPos = raw.indexOf('endstream', dataStart);
    if (endStreamPos === -1) {
      pos = streamPos + 6;
      continue;
    }

    const bodyStr = raw.slice(dataStart, endStreamPos);
    pos = endStreamPos + 9;

    // Skip huge streams (often images/fonts)
    if (bodyStr.length > maxStreamBytes) {
      continue;
    }

    inflationsTried++;

    try {
      const inflated = await inflateZlib(latin1ToBytes(bodyStr));
      const inflatedText = decoder.decode(inflated.slice(0, 800_000));

      if (!isLikelyTextContentStream(inflatedText)) {
        continue;
      }

      const texts = extractTextObjects(inflatedText, { maxResults: 2600, maxScanChars: 650_000 });
      pushTexts(texts);
    } catch {
      // ignore stream that fails to decompress
    }
  }

  // Fallback: scan raw (cheap) if we got almost nothing.
  // Note: many PDFs won't have usable BT/ET text without decompressing.
  if (parts.length < 30) {
    const rawTexts = extractTextObjects(raw, { maxResults: 900, maxScanChars: 350_000 });
    pushTexts(rawTexts.filter((t) => /[A-Za-z]{3,}/.test(t)));
  }

  const joined = sanitizeText(parts.join('\n'));
  console.log('PDF extraction summary:', {
    candidatesScanned,
    inflationsTried,
    parts: parts.length,
    joinedLen: joined.length,
  });

  return joined;
}

async function extractTextWithUnpdf(pdfBytes: Uint8Array): Promise<string> {
  // Dynamic import so we only pay the cost when needed.
  const mod: any = await import('https://esm.sh/unpdf@1.4.0');
  const getDocumentProxy = mod.getDocumentProxy as (data: Uint8Array) => Promise<any>;
  const extractText = mod.extractText as (pdf: any, opts: any) => Promise<any>;

  const pdf = await getDocumentProxy(pdfBytes);
  const res = await extractText(pdf, { mergePages: true });
  const rawText = Array.isArray(res?.text) ? res.text.join('\n') : String(res?.text ?? '');
  return sanitizeText(rawText);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let documentId: string | undefined;

  try {
    const body = await req.json();
    documentId = body.documentId;
    const clientId = body.clientId;
    const filePath = body.filePath;

    console.log('Processing document:', { documentId, clientId, filePath });

    if (!documentId || !clientId || !filePath) {
      throw new Error('Missing required parameters');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Delete existing chunks on reprocess
    await supabase
      .from('ai_document_chunks')
      .delete()
      .eq('document_id', documentId);

    await supabase
      .from('ai_documents')
      .update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() })
      .eq('id', documentId);

    console.log('Downloading PDF from storage...');
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('ai-documents')
      .download(filePath);

    if (downloadError) {
      console.error('Download error:', downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    console.log('PDF size:', pdfBytes.length, 'bytes');

    let extractedText = await extractTextFromPdf(pdfBytes);
    console.log('Extracted text length:', extractedText.length);
    console.log('Text sample:', extractedText.substring(0, 500));

    // If our lightweight parser produced unreadable output (common with font-encoded PDFs),
    // fall back to a PDF.js-based extractor (unpdf) that applies ToUnicode/CMap mapping.
    if (extractedText.length < 50 || !looksReadable(extractedText)) {
      console.log('Lightweight extraction not readable; trying unpdf fallback...');
      try {
        extractedText = await extractTextWithUnpdf(pdfBytes);
        // Hard cap to keep downstream chunking cheap
        if (extractedText.length > 600_000) extractedText = extractedText.slice(0, 600_000);
        console.log('Unpdf extracted text length:', extractedText.length);
        console.log('Unpdf text sample:', extractedText.substring(0, 500));
      } catch (e) {
        console.error('Unpdf fallback failed:', e);
      }
    }

    if (extractedText.length < 50 || !looksReadable(extractedText)) {
      console.error('Could not extract readable text from PDF');
      await supabase
        .from('ai_documents')
        .update({
          status: 'error',
          error_message: 'Could not extract readable text from PDF. If this is a scanned PDF, upload a text-based PDF (with selectable text).',
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      return new Response(
        JSON.stringify({ error: 'Could not extract readable text from PDF' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const chunks = chunkText(extractedText);
    console.log('Created', chunks.length, 'chunks');

    if (chunks.length === 0) {
      await supabase
        .from('ai_documents')
        .update({
          status: 'error',
          error_message: 'No valid text chunks could be created',
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      return new Response(
        JSON.stringify({ error: 'No valid chunks created' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const chunkRecords = chunks.map((chunk, i) => {
      // Double-sanitize to be absolutely sure
      const safeChunk = sanitizeText(chunk);
      const embedding = generateSimpleEmbedding(safeChunk);
      return {
        document_id: documentId,
        client_id: clientId,
        content: safeChunk,
        chunk_index: i,
        embedding: `[${embedding.join(',')}]`,
        metadata: {
          chunk_index: i,
          total_chunks: chunks.length,
          char_count: safeChunk.length,
        },
      };
    });

    const { error: insertError } = await supabase
      .from('ai_document_chunks')
      .insert(chunkRecords);

    if (insertError) {
      console.error('Insert error:', insertError);
      throw new Error(`Failed to store chunks: ${insertError.message}`);
    }

    const { error: updateError } = await supabase
      .from('ai_documents')
      .update({
        status: 'ready',
        chunk_count: chunks.length,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (updateError) {
      console.error('Update error:', updateError);
    }

    console.log('Document processed successfully:', documentId);

    return new Response(
      JSON.stringify({
        success: true,
        chunks: chunks.length,
        textLength: extractedText.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in parse-pdf function:', error);

    if (documentId) {
      try {
        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
        await supabase
          .from('ai_documents')
          .update({
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', documentId);
      } catch (e) {
        console.error('Failed to update document status:', e);
      }
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
