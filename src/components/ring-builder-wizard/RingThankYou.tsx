import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Download, RefreshCw, ThumbsUp, ThumbsDown, ChevronDown, MailCheck } from 'lucide-react';
import { DepositCheckoutButton } from '@/components/form-wizard/DepositCheckoutButton';
import { SelectionSummaryCard } from '@/components/form-wizard/SelectionSummaryCard';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { AIGenerationTimeline } from '@/components/form-wizard/AIGenerationTimeline';
import { RING_PHASES } from '@/components/form-wizard/ai-generation-phases';
import { ThankYouContactButton } from '@/components/form-wizard/ThankYouContactButton';
import type { ThankYouContact } from '@/lib/thank-you-contact';
import type { AiImageDelivery } from '@/lib/ai-image-delivery';
import {
  MAX_GENERATIONS,
  STAGE_DURATIONS,
  CUSTOM_INSTRUCTION_MAX_LENGTH,
} from './ring-builder-constants';

interface RingConfig {
  nature?: string;
  shape?: string;
  size?: string;
  quality?: string;
  setting?: string;
  holder?: string;
  band?: string;
  band_width?: string;
  metal?: string;
  karat?: string;
  personalization?: string[];
  budget?: string;
  ringSize?: string;
  otherDetails?: string;
  engravingText?: string;
  questionAnswers?: Record<string, any>;
}

interface RingThankYouProps {
  onReset: () => void;
  backgroundColor: string;
  fontColor: string;
  accentColor: string;
  leadId: string;
  clientId: string;
  ringConfig: RingConfig;
  customerName?: string;
  customerEmail?: string;
  depositAmount?: number;
  checkoutAttributes?: Record<string, string>;
  formType?: string;
  submissionDetails?: Record<string, string>;
  currency?: string;
  extraSummaryItems?: { label: string; value: string }[];
  /** Client-configured contact button (Call Us / Contact Us / Schedule). */
  thankYouContact?: ThankYouContact | null;
  /**
   * Where the customer receives the render. 'email' keeps the image off this
   * screen and confirms it was emailed instead.
   */
  delivery?: AiImageDelivery;
}

/** Extracts a readable message from a failed generate-ring-preview call. */
async function extractErrorMessage(fnError: unknown, dataError?: string): Promise<string | null> {
  try {
    let raw = dataError;
    const err = fnError as { context?: Response; message?: string } | null;
    if (!raw && err?.context && typeof err.context.json === 'function') {
      const body = await err.context.json();
      raw = body?.error || body?.message;
    }
    if (!raw && err?.message) raw = err.message;
    if (!raw) return null;
    const text = String(raw);
    const lower = text.toLowerCase();
    if (
      lower.includes('credits insufficient') ||
      lower.includes('insufficient_balance') ||
      lower.includes('quota_exceeded') ||
      lower.includes('limit reached')
    ) {
      return 'This shop has run out of AI preview credit — their team has been notified. Your details were received and a designer will follow up with you directly.';
    }
    if (lower.includes('rate_limit') || lower.includes('too many requests') || lower.includes('platform_limit')) {
      return 'High demand right now — please tap "Try Again" in a few seconds. Your details are saved.';
    }
    return null;
  } catch {
    return null;
  }
}

export function RingThankYou({
  onReset,
  backgroundColor,
  fontColor,
  accentColor,
  leadId,
  clientId,
  ringConfig,
  customerName,
  customerEmail,
  depositAmount,
  checkoutAttributes,
  formType,
  submissionDetails,
  currency,
  extraSummaryItems,
  thankYouContact,
  delivery,
}: RingThankYouProps) {
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [allImages, setAllImages] = useState<string[]>([]);
  // Email delivery: the render went to the customer's inbox instead of this screen
  const [emailSent, setEmailSent] = useState(false);
  const [emailedCount, setEmailedCount] = useState(0);
  const [generating, setGenerating] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<'ai' | 'catalog' | null>(null);

  const [stageIndex, setStageIndex] = useState(0);
  const [progressValue, setProgressValue] = useState(0);
  // Number of renders that actually completed (image shown or emailed). A failed
  // attempt does not consume one of the MAX_GENERATIONS tries, so the customer
  // keeps all 3 until a full image is produced.
  const [generationCount, setGenerationCount] = useState(0);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'liked' | 'disliked' | null>>({});
  const [customInstruction, setCustomInstruction] = useState('');
  const [showSelections, setShowSelections] = useState(false);
  const [showStayMessage, setShowStayMessage] = useState(false);

  const totalDuration = useMemo(() => STAGE_DURATIONS.reduce((sum, d) => sum + d, 0), []);

  // Track the latest in-flight regeneration so a stale response from an earlier
  // request cannot overwrite the result of a newer one (D2 race fix).
  const generationIdRef = useRef(0);

  const generate = useCallback(async (genNumber: number, instruction?: string) => {
    const myId = ++generationIdRef.current;
    setGenerating(true);
    setError(false);
    setErrorMessage(null);
    setStageIndex(0);
    setProgressValue(0);
    setShowStayMessage(false);

    try {
      const body: Record<string, any> = {
        leadId,
        clientId,
        ...ringConfig,
        generationNumber: genNumber,
        backgroundColor,
      };
      if (instruction?.trim()) body.customInstruction = instruction.trim();
      // Always send submissionDetails so per-generation render emails preserve
      // the full submission summary (incl. all custom questions). Previously
      // gated to genNumber===1, which blanked details on subsequent emails.
      if (submissionDetails && Object.keys(submissionDetails).length > 0) {
        body.submissionDetails = submissionDetails;
      }

      const { data, error: fnError } = await supabase.functions.invoke('generate-ring-preview', {
        body,
      });

      // Drop responses from superseded requests.
      if (myId !== generationIdRef.current) return;

      if (fnError || !(data?.imageUrl || data?.emailed)) {
        console.error('Ring preview generation failed:', fnError || data?.error);
        setError(true);
        setErrorMessage(await extractErrorMessage(fnError, data?.error));
      } else if (!data.imageUrl) {
        setGenerationCount(genNumber);
        setEmailSent(true);
        setEmailedCount(n => n + 1);
      } else {
        setGenerationCount(genNumber);
        setCurrentImageUrl(data.imageUrl);
        setImageSource(data.source || 'ai');
        setAllImages(prev => [...prev, data.imageUrl]);
      }
    } catch (err) {
      if (myId !== generationIdRef.current) return;
      console.error('Ring preview generation error:', err);
      setError(true);
    } finally {
      if (myId === generationIdRef.current) setGenerating(false);
    }
  }, [leadId, clientId, ringConfig, backgroundColor, submissionDetails]);

  useEffect(() => {
    generate(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show "please stay" message after 35 seconds
  useEffect(() => {
    if (!generating) {
      setShowStayMessage(false);
      return;
    }
    const timer = setTimeout(() => setShowStayMessage(true), 35000);
    return () => clearTimeout(timer);
  }, [generating]);

  // Stage progression — use requestAnimationFrame instead of a 100ms setInterval
  // to avoid wake-lock/battery drain on mobile (C5). Logic identical: progress
  // ramps to 95% across each stage, then setStageIndex advances on stage end.
  useEffect(() => {
    if (!generating) return;
    const elapsedBefore = STAGE_DURATIONS.slice(0, stageIndex).reduce((s, d) => s + d, 0);
    const currentStageDuration = STAGE_DURATIONS[stageIndex] ?? 10000;
    const stageStart = performance.now();
    let raf = 0;

    const tick = () => {
      const stageElapsed = performance.now() - stageStart;
      const totalElapsed = elapsedBefore + Math.min(stageElapsed, currentStageDuration);
      const target = Math.min((totalElapsed / totalDuration) * 100, 95);
      setProgressValue(prev => (prev >= target ? prev : target));
      if (stageElapsed < currentStageDuration) {
        raf = requestAnimationFrame(tick);
      } else if (stageIndex < STAGE_DURATIONS.length - 1) {
        setStageIndex(i => i + 1);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stageIndex, generating, totalDuration]);

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
      link.download = `ring-preview-${leadId}-${generationCount}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.onerror = () => {
      const link = document.createElement('a');
      link.href = url;
      link.download = `ring-preview-${leadId}.png`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.src = url;
  }, [currentImageUrl, backgroundColor, leadId, generationCount]);

  // D3: Use functional setState so rapid clicks read the latest value, not the
  // stale closure capture. Side-effect (DB write) runs once we know the new value.
  const handleFeedback = useCallback(async (imageUrl: string, type: 'liked' | 'disliked') => {
    let newValue: 'liked' | 'disliked' | null = type;
    setFeedbackMap(prev => {
      newValue = prev[imageUrl] === type ? null : type;
      return { ...prev, [imageUrl]: newValue };
    });
    try {
      await supabase
        .from('ring_preview_images' as any)
        .update({ feedback: newValue })
        .eq('image_url', imageUrl);
    } catch (err) {
      console.error('Failed to save feedback:', err);
    }
  }, []);

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
  const emailTarget = customerEmail?.trim() || 'your email';

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
          maxLength={CUSTOM_INSTRUCTION_MAX_LENGTH}
          className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
          style={{ backgroundColor: `${fontColor}08`, border: `1px solid ${fontColor}20`, color: fontColor }}
        />
        <span className="absolute bottom-1.5 right-2 text-[10px]" style={{ color: `${fontColor}50` }}>
          {customInstruction.length}/{CUSTOM_INSTRUCTION_MAX_LENGTH}
        </span>
      </div>
      <div className="flex justify-center">
        <button onClick={handleRegenerate} disabled={generating} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all border" style={{ borderColor: `${fontColor}30`, color: fontColor, opacity: generating ? 0.5 : 1 }}>
          <RefreshCw className="w-4 h-4" /> Re-generate ({remainingGenerations} left)
        </button>
      </div>
    </div>
  );

  const summaryItems = useMemo(() => {
    const base = [
      { label: 'Nature', value: ringConfig.nature || '' },
      { label: 'Shape', value: ringConfig.shape || '' },
      { label: 'Size', value: ringConfig.size || '' },
      { label: 'Quality', value: ringConfig.quality || '' },
      { label: 'Setting', value: ringConfig.setting || '' },
      { label: 'Holder', value: ringConfig.holder || '' },
      { label: 'Band', value: ringConfig.band || '' },
      { label: 'Band Width', value: ringConfig.band_width || '' },
      { label: 'Metal', value: ringConfig.metal || '' },
      { label: 'Karat', value: ringConfig.karat || '' },
      { label: 'Budget', value: ringConfig.budget || '' },
      { label: 'Ring Size', value: ringConfig.ringSize || '' },
      { label: 'Personalization', value: ringConfig.personalization?.join(', ') || '' },
    ].filter(i => i.value);
    const seen = new Set(base.map(i => i.label.toLowerCase()));
    const extras = (extraSummaryItems || []).filter(i => i.value && !seen.has(i.label.toLowerCase()));
    return [...base, ...extras];
  }, [ringConfig, extraSummaryItems]);

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10 animate-fade-in" style={{ backgroundColor, color: fontColor }}>
      {/* Header */}
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
        {/* AI Preview */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {generating && (
              <>
                <AIGenerationTimeline
                  phases={RING_PHASES}
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
                      Please stay a little longer — your image is almost ready.
                    </p>
                  </motion.div>
                )}
              </>
            )}

            {!generating && currentImageUrl && (
              <motion.div key="image" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }} className="space-y-3">
                <div className="relative">
                  <div className="w-full aspect-square rounded-xl overflow-hidden" style={{ backgroundColor, boxShadow: `0 0 40px ${accentColor}30`, border: `1px solid ${fontColor}10` }}>
                    <img src={currentImageUrl} alt="AI-generated ring preview" className="w-full h-full object-contain" />
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
                  {imageSource === 'catalog'
                    ? 'This is a similar ring from our catalog. Our team will create a custom design based on your exact selections.'
                    : 'These are rough AI-generated drafts. For a more accurate design, our team will reach out to you soon.'}
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
                  {errorMessage || "We couldn't generate a preview this time, but don't worry — we've received all your details!"}
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

        {/* Your Selections (below preview) */}
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
