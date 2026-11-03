import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Download, RefreshCw, ThumbsUp, ThumbsDown, ChevronDown, MailCheck } from 'lucide-react';
import { DepositCheckoutButton } from '@/components/form-wizard/DepositCheckoutButton';
import { SelectionSummaryCard } from '@/components/form-wizard/SelectionSummaryCard';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { AIGenerationTimeline } from '@/components/form-wizard/AIGenerationTimeline';
import type { Phase } from '@/components/form-wizard/ai-generation-phases';
import { ThankYouContactButton } from '@/components/form-wizard/ThankYouContactButton';
import type { ThankYouContact } from '@/lib/thank-you-contact';
import type { AiImageDelivery } from '@/lib/ai-image-delivery';

const MAX_GENERATIONS = 3;
const STAGE_DURATIONS = [4000, 4000, 6000, 6000, 15000, 15000, 10000];
const TOTAL_DURATION = STAGE_DURATIONS.reduce((s, d) => s + d, 0);

export interface AIPreviewThankYouProps {
  onReset: () => void;
  backgroundColor: string;
  fontColor: string;
  accentColor: string;
  leadId: string;
  clientId: string;
  customerName?: string;
  customerEmail?: string;
  depositAmount?: number;
  checkoutAttributes?: Record<string, string>;
  formType?: string;
  submissionDetails?: Record<string, string>;
  currency?: string;
  summaryItems: Array<{ label: string; value: string }>;
  phases: Phase[];
  functionName: string;
  previewTable: string;
  downloadPrefix: string;
  imageAlt?: string;
  buildRequestBody: (genNumber: number, instruction?: string) => Record<string, any>;
  /** Client-configured contact button (Call Us / Contact Us / Schedule). */
  thankYouContact?: ThankYouContact | null;
  /**
   * Where the customer receives the render. 'email' keeps the image off this
   * screen and confirms it was emailed instead. Omitted = legacy behaviour
   * (shown here and emailed).
   */
  delivery?: AiImageDelivery;
}

export function AIPreviewThankYou({
  onReset,
  backgroundColor,
  fontColor,
  accentColor,
  leadId,
  clientId,
  customerName,
  customerEmail,
  depositAmount,
  checkoutAttributes,
  formType,
  submissionDetails,
  currency,
  summaryItems,
  phases,
  functionName,
  previewTable,
  downloadPrefix,
  imageAlt = 'AI-generated preview',
  buildRequestBody,
  thankYouContact,
  delivery,
}: AIPreviewThankYouProps) {
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [allImages, setAllImages] = useState<string[]>([]);
  // Email delivery: the render went to the customer's inbox instead of this screen
  const [emailSent, setEmailSent] = useState(false);
  const [emailedCount, setEmailedCount] = useState(0);
  const [generating, setGenerating] = useState(true);
  const [error, setError] = useState(false);

  const [stageIndex, setStageIndex] = useState(0);
  const [progressValue, setProgressValue] = useState(0);
  // Number of renders that actually completed (image shown or emailed). A failed
  // attempt does not consume one of the MAX_GENERATIONS tries, so the customer
  // keeps all 3 until a full image is produced.
  const [generationCount, setGenerationCount] = useState(0);
  const [customInstruction, setCustomInstruction] = useState('');
  const [showSelections, setShowSelections] = useState(false);
  const [showStayMessage, setShowStayMessage] = useState(false);

  // K9: abort in-flight request when a new generate call starts
  const abortRef = useRef<AbortController | null>(null);

  // D3: use a ref to always read the latest feedbackMap without stale closures
  const feedbackRef = useRef<Record<string, 'liked' | 'disliked' | null>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'liked' | 'disliked' | null>>({});

  const generate = useCallback(async (genNumber: number, instruction?: string) => {
    // K9: cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    setError(false);
    setStageIndex(0);
    setProgressValue(0);
    setShowStayMessage(false);

    try {
      const body = buildRequestBody(genNumber, instruction);
      // Always forward submissionDetails when present so per-generation render
      // emails preserve the full submission summary (custom questions included),
      // not just the first generation. The shared pending-render-email helper
      // only overwrites stored details when this payload has content.
      if (submissionDetails && Object.keys(submissionDetails).length > 0) {
        body.submissionDetails = submissionDetails;
      }

      const { data, error: fnError } = await supabase.functions.invoke(functionName, {
        body,
        // @ts-ignore — signal is supported in supabase-js v2 but not always typed
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (fnError || !(data?.imageUrl || data?.emailed)) {
        console.error('Preview generation failed:', fnError || data?.error);
        setError(true);
      } else if (!data.imageUrl) {
        setGenerationCount(genNumber);
        setEmailSent(true);
        setEmailedCount(n => n + 1);
      } else {
        setGenerationCount(genNumber);
        setCurrentImageUrl(data.imageUrl);
        setAllImages(prev => [...prev, data.imageUrl]);
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      console.error('Preview generation error:', err);
      setError(true);
    } finally {
      if (!controller.signal.aborted) setGenerating(false);
    }
  }, [functionName, buildRequestBody, submissionDetails]);

  // Initial generation
  useEffect(() => {
    generate(1);
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show "please stay" message after 35 seconds of generating
  useEffect(() => {
    if (!generating) { setShowStayMessage(false); return; }
    const timer = setTimeout(() => setShowStayMessage(true), 35000);
    return () => clearTimeout(timer);
  }, [generating]);

  // K2: Use requestAnimationFrame instead of setInterval(100ms) for smooth progress
  // K10: currentImageUrl in deps — effect cleans up immediately when image arrives
  useEffect(() => {
    if (!generating || currentImageUrl || emailSent) return;

    const elapsed = STAGE_DURATIONS.slice(0, stageIndex).reduce((s, d) => s + d, 0);
    const currentStageDuration = STAGE_DURATIONS[stageIndex] ?? 10000;
    const stageEnd = ((elapsed + currentStageDuration) / TOTAL_DURATION) * 100;

    let rafId: number;
    let lastTs: number | null = null;

    const tick = (ts: number) => {
      if (lastTs !== null) {
        const delta = ts - lastTs;
        setProgressValue(prev => Math.min(prev + 0.005 * delta, stageEnd, 95));
      }
      lastTs = ts;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const stageTimer = setTimeout(() => {
      if (stageIndex < STAGE_DURATIONS.length - 1) setStageIndex(i => i + 1);
    }, currentStageDuration);

    return () => { cancelAnimationFrame(rafId); clearTimeout(stageTimer); };
  }, [stageIndex, generating, currentImageUrl, emailSent]);

  // Snap progress to 100% when image arrives
  useEffect(() => {
    if ((currentImageUrl || emailSent) && !generating) setProgressValue(100);
  }, [currentImageUrl, emailSent, generating]);

  const handleRegenerate = useCallback(() => {
    if (generationCount >= MAX_GENERATIONS || generating) return;
    // Next render number = completed renders + 1, so a retry after a failure
    // reuses the same number instead of burning a try.
    const nextGen = generationCount + 1;
    const instruction = customInstruction;
    setCustomInstruction('');
    generate(nextGen, instruction);
  }, [generationCount, generating, generate, customInstruction]);

  const handleDownload = useCallback((urlToDownload?: string) => {
    const url = urlToDownload || currentImageUrl;
    if (!url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${downloadPrefix}-${leadId}-${generationCount}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.onerror = () => {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${downloadPrefix}-${leadId}.png`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.src = url;
  }, [currentImageUrl, backgroundColor, leadId, generationCount, downloadPrefix]);

  // K8: Add .eq('lead_id', leadId) for correct row scoping
  // D3: Use ref to avoid stale closure on feedbackMap — no feedbackMap in deps
  const handleFeedback = useCallback(async (imageUrl: string, type: 'liked' | 'disliked') => {
    const current = feedbackRef.current[imageUrl];
    const newValue = current === type ? null : type;
    feedbackRef.current = { ...feedbackRef.current, [imageUrl]: newValue };
    setFeedbackMap({ ...feedbackRef.current });
    try {
      await (supabase as any)
        .from(previewTable)
        .update({ feedback: newValue })
        .eq('lead_id', leadId)
        .eq('image_url', imageUrl);
    } catch (err) {
      console.error('Failed to save feedback:', err);
    }
  }, [leadId, previewTable]);

  const FeedbackButtons = useCallback(({ url, size = 'md' }: { url: string; size?: 'sm' | 'md' }) => {
    const feedback = feedbackMap[url];
    const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
    const btnSize = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
    return (
      <div className="flex gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); handleFeedback(url, 'liked'); }}
          className={`${btnSize} rounded-full flex items-center justify-center transition-all ${feedback === 'liked' ? 'scale-110' : 'opacity-60 hover:opacity-100'}`}
          style={{ backgroundColor: feedback === 'liked' ? accentColor : `${fontColor}15`, color: feedback === 'liked' ? '#fff' : fontColor }}
        >
          <ThumbsUp className={iconSize} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleFeedback(url, 'disliked'); }}
          className={`${btnSize} rounded-full flex items-center justify-center transition-all ${feedback === 'disliked' ? 'scale-110' : 'opacity-60 hover:opacity-100'}`}
          style={{ backgroundColor: feedback === 'disliked' ? '#ef4444' : `${fontColor}15`, color: feedback === 'disliked' ? '#fff' : fontColor }}
        >
          <ThumbsDown className={iconSize} />
        </button>
      </div>
    );
  }, [feedbackMap, handleFeedback, accentColor, fontColor]);

  const remainingGenerations = MAX_GENERATIONS - generationCount;
  const isEmailDelivery = delivery === 'email';
  // Custom-instruction box + Re-generate button (max 3 renders). Shown under
  // the image, and under the "sent to your email" card in email mode so the
  // customer can request more renders — each one is emailed as it is produced.
  const regenerateControls = remainingGenerations > 0 && (
    <div className="space-y-2 pt-2">
      <div className="relative">
        <textarea
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
          placeholder="Add custom instructions for next design (optional)..."
          rows={2}
          maxLength={200}
          className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
          style={{ backgroundColor: `${fontColor}08`, border: `1px solid ${fontColor}20`, color: fontColor }}
        />
        <span className="absolute bottom-1.5 right-2 text-[10px]" style={{ color: `${fontColor}50` }}>
          {customInstruction.length}/200
        </span>
      </div>
      <div className="flex justify-center">
        <button onClick={handleRegenerate} disabled={generating} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all border" style={{ borderColor: `${fontColor}30`, color: fontColor, opacity: generating ? 0.5 : 1 }}>
          <RefreshCw className="w-4 h-4" /> Re-generate ({remainingGenerations} left)
        </button>
      </div>
    </div>
  );
  const emailTarget = customerEmail?.trim() || 'your email';

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-10 animate-fade-in"
      style={{ backgroundColor, color: fontColor }}
    >
      <div className="text-center space-y-2 pt-8 pb-6">
        <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-none">
          <span style={{ color: fontColor }}>YOUR AI </span>
          <span style={{ color: accentColor }}>RENDER</span>
        </h1>
        <p className="text-sm max-w-md mx-auto leading-relaxed" style={{ color: `${fontColor}99` }}>
          {isEmailDelivery
            ? 'Your design is being brought to life by AI and will be sent to your email.'
            : 'Your design is being brought to life by AI.'}
        </p>
      </div>

      <div className="w-full max-w-lg mx-auto space-y-6">
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {generating && (
              <>
                <AIGenerationTimeline
                  phases={phases}
                  accentColor={accentColor}
                  fontColor={fontColor}
                  backgroundColor={backgroundColor}
                  generating={generating}
                  stageIndex={stageIndex}
                  progressValue={progressValue}
                />
                {isEmailDelivery && (
                  <div
                    className="mt-4 rounded-lg px-4 py-3 text-center"
                    style={{ backgroundColor: `${accentColor}15`, border: `1px solid ${accentColor}30` }}
                  >
                    <p className="text-xs leading-relaxed" style={{ color: fontColor }}>
                      We'll email your AI render to <strong>{emailTarget}</strong> as soon as it's ready.
                    </p>
                  </div>
                )}
                {showStayMessage && !isEmailDelivery && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="mt-4 rounded-lg px-4 py-3 text-center"
                    style={{ backgroundColor: `${accentColor}15`, border: `1px solid ${accentColor}30` }}
                  >
                    <p className="text-xs leading-relaxed" style={{ color: fontColor }}>
                      {delivery === 'thank_you_page'
                        ? 'Please stay a little longer — your image is almost ready.'
                        : "Please stay a little longer — your image is nearby completion. Otherwise, you can leave and you'll receive your AI render in the email you provided earlier."}
                    </p>
                  </motion.div>
                )}
              </>
            )}

            {!generating && currentImageUrl && (
              <motion.div key="image" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }} className="space-y-3">
                <div className="relative">
                  <div className="w-full aspect-square rounded-xl overflow-hidden" style={{ backgroundColor, boxShadow: `0 0 40px ${accentColor}30`, border: `1px solid ${fontColor}10` }}>
                    <img src={currentImageUrl} alt={imageAlt} className="w-full h-full object-contain" />
                  </div>
                  <button
                    onClick={() => handleDownload()}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-all hover:scale-110"
                    style={{ backgroundColor: `${fontColor}20`, color: fontColor }}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-3 right-3">
                    <FeedbackButtons url={currentImageUrl} />
                  </div>
                </div>

                <p className="text-xs text-center italic leading-relaxed" style={{ color: `${fontColor}70` }}>
                  These are rough AI-generated drafts. For a more accurate design, our team will reach out to you soon.
                </p>

                {depositAmount && checkoutAttributes && formType && (
                  <div className="pt-2">
                    <DepositCheckoutButton
                      clientId={clientId}
                      formType={formType}
                      attributes={checkoutAttributes}
                      depositAmount={depositAmount}
                      accentColor={accentColor}
                      fontColor={fontColor}
                      currency={currency}
                    />
                  </div>
                )}

                {regenerateControls}

                {allImages.length > 1 && (
                  <div className="pt-4 space-y-2">
                    <p className="text-xs font-medium text-center uppercase tracking-wider" style={{ color: `${fontColor}80` }}>Your Design Options</p>
                    <div className="flex justify-center gap-3">
                      {allImages.map((url, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-1">
                          <button onClick={() => setCurrentImageUrl(url)} className="w-20 h-20 rounded-lg overflow-hidden transition-all" style={{ backgroundColor, border: url === currentImageUrl ? `2px solid ${accentColor}` : `1px solid ${fontColor}20`, boxShadow: url === currentImageUrl ? `0 0 12px ${accentColor}40` : 'none' }}>
                            <img src={url} alt={`Design option ${idx + 1}`} className="w-full h-full object-contain" />
                          </button>
                          <FeedbackButtons url={url} size="sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {!generating && emailSent && !currentImageUrl && (
              <motion.div key="emailed" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }} className="space-y-3">
                <div
                  className="rounded-xl px-5 py-8 text-center space-y-3"
                  style={{ backgroundColor: `${fontColor}08`, border: `1px solid ${fontColor}12`, boxShadow: `0 0 40px ${accentColor}20` }}
                >
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: accentColor }}>
                    <MailCheck className="w-7 h-7 text-white" />
                  </div>
                  <p className="text-base font-bold" style={{ color: fontColor }}>
                    {emailedCount > 1 ? `Render #${emailedCount} is on its way!` : 'Your AI render is on its way!'}
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: `${fontColor}99` }}>
                    We've sent {emailedCount > 1 ? `all ${emailedCount} renders` : 'it'} to <strong style={{ color: fontColor }}>{emailTarget}</strong>. If you don't see {emailedCount > 1 ? 'them' : 'it'} in a few minutes, please check your spam folder.
                  </p>
                </div>

                <p className="text-xs text-center italic leading-relaxed" style={{ color: `${fontColor}70` }}>
                  These are rough AI-generated drafts. For a more accurate design, our team will reach out to you soon.
                </p>

                {depositAmount && checkoutAttributes && formType && (
                  <div className="pt-2">
                    <DepositCheckoutButton
                      clientId={clientId}
                      formType={formType}
                      attributes={checkoutAttributes}
                      depositAmount={depositAmount}
                      accentColor={accentColor}
                      fontColor={fontColor}
                      currency={currency}
                    />
                  </div>
                )}

                {regenerateControls}
              </motion.div>
            )}

            {!generating && error && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-4 space-y-3">
                <p className="text-xs" style={{ color: `${fontColor}60` }}>
                  We couldn't generate a preview this time, but don't worry — we've received all your details!
                </p>
                {remainingGenerations > 0 && (
                  <div className="flex justify-center">
                    <button onClick={handleRegenerate} disabled={generating} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all border" style={{ borderColor: `${fontColor}30`, color: fontColor }}>
                      <RefreshCw className="w-4 h-4" /> Try Again ({remainingGenerations} left)
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => setShowSelections(!showSelections)}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2"
            style={{ backgroundColor: `${fontColor}08`, border: `1px solid ${fontColor}12` }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: `${fontColor}60` }}>
              Your Selections
            </span>
            <ChevronDown
              className="w-4 h-4 transition-transform duration-300"
              style={{ color: `${fontColor}60`, transform: showSelections ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{ maxHeight: showSelections ? '600px' : '0px' }}
          >
            <SelectionSummaryCard items={summaryItems} fontColor={fontColor} accentColor={accentColor} />
          </div>
        </div>

        <ThankYouContactButton contact={thankYouContact} accentColor={accentColor} className="mx-auto" />
      </div>
    </div>
  );
}
