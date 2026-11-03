import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowUp, ChevronLeft, User, Calendar, Bookmark, ShoppingCart, Plus, RotateCcw, Shuffle } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
import { RingStyle, RingShank, RingMetal, RingShape, CaratRange, Stone } from '@/types/ring-builder';
import { motion, AnimatePresence } from 'framer-motion';
import { StreamingMessage } from './StreamingMessage';
import { QuickOptionButton } from './QuickOptionButton';
import { RingCompletionCelebration } from './RingCompletionCelebration';
import { ConfigurationSummaryCard } from './ConfigurationSummaryCard';
import { FacetShiftThinking } from '@/components/ui/FacetShiftThinking';

// Typing indicator component (Snapchat-style)
const TypingIndicator = () => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    className="flex items-center gap-1 px-2"
  >
    <span className="text-[11px] text-muted-foreground font-medium">typing</span>
    <div className="flex gap-0.5">
      <span className="w-1 h-1 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:0ms]" />
      <span className="w-1 h-1 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:100ms]" />
      <span className="w-1 h-1 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:200ms]" />
    </div>
  </motion.div>
);

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CatalogOption {
  id: string;
  name: string;
  price?: number;
  // Present on embed catalog options for metals (coming from useClientCatalogOptions)
  colorFamily?: string;
}

// Map metal variant names to color families for image fetching
const getColorFamilyFromMetal = (metal: string | null | undefined): string | null => {
  if (!metal) return null;
  
  const metalLower = metal.toLowerCase();
  
  if (metalLower.includes('yellow')) return 'yellow';
  if (metalLower.includes('rose') || metalLower.includes('pink')) return 'rose';
  if (metalLower.includes('white') || metalLower.includes('platinum')) return 'white';
  if (metalLower.includes('gold')) return 'yellow';
  
  return null;
};

// Interface for all 4 ring angle images
interface RingAngleImages {
  angle0: string;
  angle1: string;
  angle2: string;
  angle3: string;
}

// CDN fallback: Solitaire High Polish Rose Gold Round
const FALLBACK_CDN_BASE = 'https://do2z856wqq7wu.cloudfront.net/Solitaire/high-polish/rose/round';

// Build all 4 ring image paths from configuration
const buildRingImagePaths = (config: { style?: string; shank?: string; metal?: string; shape?: string }): RingAngleImages | null => {
  // Always return the CDN-backed default — no more local file guessing
  return null;
};

// Default ring image (Solitaire High Polish Rose Gold Round) - always used as fallback
const DEFAULT_RING_IMAGE = `${FALLBACK_CDN_BASE}/wex20aa6goaktc6150i1r.png`;
const DEFAULT_RING_IMAGES: RingAngleImages = {
  angle0: `${FALLBACK_CDN_BASE}/wex20aa6goaktc6150i1r.png`,
  angle1: `${FALLBACK_CDN_BASE}/xfd49ebpwf363r9ojdrbl.png`,
  angle2: `${FALLBACK_CDN_BASE}/8jsnd2ujp39mwauen77es.png`,
  angle3: `${FALLBACK_CDN_BASE}/2cqhvvymuv4st9u3v7may.png`,
};
const FALLBACK_RING_NAME = 'Solitaire High Polish Rose Gold Round';

// Legacy single image path builder (for fallback - always returns default if no match)
const buildRingImagePath = (config: { style?: string; shank?: string; metal?: string; shape?: string }): string => {
  // Always fall back to the default Solitaire High Polish Rose Gold Round
  return DEFAULT_RING_IMAGE;
};

// Build ring name from configuration
const buildRingName = (config: { style?: string; shank?: string; metal?: string; shape?: string }, catalogOptions?: ChatAssistantProps['catalogOptions']): string => {
  const parts: string[] = [];
  
  // Get style name
  if (config.style) {
    const styleCatalog = catalogOptions?.styles?.find(s => s.id === config.style);
    parts.push(styleCatalog?.name || config.style.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
  }
  
  // Get shank name
  if (config.shank) {
    const shankCatalog = catalogOptions?.shanks?.find(s => s.id === config.shank);
    parts.push(shankCatalog?.name || config.shank.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
  }
  
  // Get metal color family
  if (config.metal) {
    const colorFamily = getColorFamilyFromMetal(config.metal);
    if (colorFamily) {
      const colorName = colorFamily.charAt(0).toUpperCase() + colorFamily.slice(1);
      parts.push(`${colorName} Gold`);
    }
  }
  
  // Get shape name
  if (config.shape) {
    const shapeCatalog = catalogOptions?.shapes?.find(s => s.id === config.shape);
    parts.push(shapeCatalog?.name || config.shape.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
  }
  
  return parts.length > 0 ? parts.join(' ') : 'Your Dream Ring';
};

// Widened config type to include stone — matches RingConfiguration
interface WidgetConfig {
  style?: string | null;
  shank?: string | null;
  metal?: string | null;
  shape?: string | null;
  caratRange?: number | null;
  stone?: Stone | null;
  size?: string;
  engraving?: {
    enabled: boolean;
    text: string;
    bandWidth: string;
    otherRequest: string;
  };
}

interface ChatAssistantProps {
  onApplyConfiguration?: (config: any) => void;
  onClose?: () => void;
  clientId?: string;
  /** Store/company name for personalised greeting (falls back to 'JewlX') */
  storeName?: string;
  // Current ring configuration — full widget state including stone
  currentConfiguration?: WidgetConfig;
  // Individual update functions for real-time updates
  onUpdateStyle?: (style: RingStyle, meta?: { source: 'user' | 'auto' }) => void;
  onUpdateShank?: (shank: RingShank, meta?: { source: 'user' | 'auto' }) => void;
  onUpdateMetal?: (metal: RingMetal, meta?: { source: 'user' | 'auto' }) => void;
  onUpdateShape?: (shape: RingShape, meta?: { source: 'user' | 'auto' }) => void;
  onUpdateCarat?: (carat: CaratRange, meta?: { source: 'user' | 'auto' }) => void;
  // Catalog options for matching user selections
  catalogOptions?: {
    styles?: CatalogOption[];
    shanks?: CatalogOption[];
    metals?: CatalogOption[];
    shapes?: CatalogOption[];
    caratOptions?: Array<{ value: number; displayName: string; priceAdjustment?: number | null }>;
    diamondPresets?: any[];
  };
  // Callback when celebration state changes (to freeze ProductViewer)
  onCelebrationChange?: (isCelebrating: boolean) => void;
  /** When true, the chat is the primary panel (chat-first theme) — hides close button */
  isChatTheme?: boolean;
  /** CTA callbacks for chat theme */
  onBookAppointment?: () => void;
  onSaveDesign?: () => void;
  onAddToCart?: () => void;
  // Optional size & engraving update callbacks
  onUpdateSize?: (size: string) => void;
  onUpdateEngraving?: (data: { enabled: boolean; text: string; bandWidth: string; otherRequest: string }) => void;
  /** Currency code for price formatting (defaults to USD) */
  currency?: string;
  /** Full widget reset callback (clears stone, size, engraving too) */
  onResetConfiguration?: () => void;
  /** Pricing mode — 'estimates' or 'custom_pricing' */
  pricingMode?: string;
}

// Helper: check if checkout is ready (all required fields including diamond)
const isCheckoutReady = (config?: WidgetConfig): boolean => {
  if (!config) return false;
  return !!(config.style && config.shank && config.metal && config.shape && config.caratRange && config.stone);
};

// Helper: check if base ring is complete (no diamond needed)
const isBaseRingComplete = (config?: WidgetConfig): boolean => {
  if (!config) return false;
  return !!(config.style && config.shank && config.metal && config.shape);
};

// Determine next step based on what's already been configured - NOT by parsing AI text
// This prevents showing the wrong options when AI mentions previous selections
const getNextStepFromConfig = (config?: WidgetConfig): 'style' | 'shank' | 'metal' | 'shape' | 'carat' | null => {
  if (!config) return 'style';
  
  // Follow strict order: style -> shank -> metal -> shape -> carat
  if (!config.style) return 'style';
  if (!config.shank) return 'shank';
  if (!config.metal) return 'metal';
  if (!config.shape) return 'shape';
  if (!config.caratRange) return 'carat';
  
  // All steps complete
  return null;
};

// Check if an option matches any catalog item (style, shank, metal, shape, or carat pattern)
const isValidCatalogOption = (option: string, catalogOptions?: ChatAssistantProps['catalogOptions']): boolean => {
  if (!catalogOptions) return false;
  
  const optionLower = option.toLowerCase().trim();
  const optionNormalized = optionLower.replace(/[\s-_]+/g, '');
  
  // Check for carat pattern (e.g., "0.5 carat", "1.0 ct")
  if (/\d+\.?\d*\s*(carat|ct)/i.test(option)) {
    return true;
  }
  
  // Check all catalog categories
  const allItems = [
    ...(catalogOptions.styles || []),
    ...(catalogOptions.shanks || []),
    ...(catalogOptions.metals || []),
    ...(catalogOptions.shapes || [])
  ];
  
  for (const item of allItems) {
    const itemNameLower = item.name.toLowerCase();
    const itemNameNormalized = itemNameLower.replace(/[\s-_]+/g, '');
    const itemIdLower = item.id.toLowerCase();
    const itemIdNormalized = itemIdLower.replace(/[\s-_]+/g, '');
    
    // Exact match
    if (optionLower === itemNameLower || optionLower === itemIdLower) {
      return true;
    }
    
    // Normalized match
    if (optionNormalized === itemNameNormalized || optionNormalized === itemIdNormalized) {
      return true;
    }
    
    // Partial match - option contains item name or vice versa
    if (optionLower.includes(itemNameLower) || itemNameLower.includes(optionLower)) {
      return true;
    }
    
    // Word-based match
    const optionWords = optionLower.split(/[\s-_]+/).filter(w => w.length > 2);
    const itemWords = itemNameLower.split(/[\s-_]+/).filter(w => w.length > 2);
    const matchingWords = optionWords.filter(ow => itemWords.some(iw => ow === iw || ow.includes(iw) || iw.includes(ow)));
    if (matchingWords.length >= 1 && matchingWords.length >= Math.min(optionWords.length, itemWords.length) * 0.5) {
      return true;
    }
  }
  
  return false;
};

// Extract clickable options from AI message - ONLY catalog options (styles, shanks, metals, shapes, carats)
const extractOptions = (content: string, catalogOptions?: ChatAssistantProps['catalogOptions']): string[] => {
  const options: string[] = [];
  
  // Match patterns for plain text numbered lists: "1. Option Name - description" or "1. Option Name"
  const pattern = /^\d+\.\s+([^-\n]+?)(?:\s*[-–—]\s|$)/gm;
  
  let match;
  while ((match = pattern.exec(content)) !== null) {
    let option = match[1].trim();
    // Clean up any trailing punctuation and asterisks
    option = option.replace(/[:.\-–—*]+$/, '').replace(/^\*+|\*+$/g, '').trim();
    
    // Skip if too short, too long, or looks like a heading/instruction
    if (option && 
        !options.includes(option) && 
        option.length >= 2 && 
        option.length < 60 &&
        !option.toLowerCase().includes('step') &&
        !option.toLowerCase().includes('please') &&
        !option.toLowerCase().includes('choose') &&
        !option.toLowerCase().includes('which') &&
        !option.toLowerCase().includes('would you') &&
        !option.toLowerCase().includes('what') &&
        !option.toLowerCase().includes('who') &&
        !option.toLowerCase().includes('budget') &&
        !option.toLowerCase().includes('occasion') &&
        // Only include if it's a valid catalog option
        isValidCatalogOption(option, catalogOptions)) {
      options.push(option);
    }
  }
  
  return options;
};

// Match user selection to catalog option ID
const matchOptionToId = (option: string, catalogItems: CatalogOption[] | undefined): string | null => {
  if (!catalogItems || catalogItems.length === 0) return null;
  
  const optionLower = option.toLowerCase().trim();
  const optionNormalized = optionLower.replace(/[\s-_]+/g, '');
  
  // Try exact match first
  const exactMatch = catalogItems.find(item => 
    item.name.toLowerCase() === optionLower || 
    item.id.toLowerCase() === optionLower
  );
  if (exactMatch) {
    console.log('[ChatAssistant] Exact match found:', option, '->', exactMatch.id);
    return exactMatch.id;
  }
  
  // Try normalized match (remove spaces/dashes)
  const normalizedMatch = catalogItems.find(item => {
    const itemNameNormalized = item.name.toLowerCase().replace(/[\s-_]+/g, '');
    const itemIdNormalized = item.id.toLowerCase().replace(/[\s-_]+/g, '');
    return itemNameNormalized === optionNormalized || itemIdNormalized === optionNormalized;
  });
  if (normalizedMatch) {
    console.log('[ChatAssistant] Normalized match found:', option, '->', normalizedMatch.id);
    return normalizedMatch.id;
  }
  
  // Try partial/contains match
  const partialMatch = catalogItems.find(item => {
    const itemNameLower = item.name.toLowerCase();
    const itemIdLower = item.id.toLowerCase();
    return itemNameLower.includes(optionLower) || 
           optionLower.includes(itemNameLower) ||
           itemIdLower.includes(optionLower.replace(/\s+/g, '-')) ||
           optionLower.replace(/\s+/g, '-').includes(itemIdLower);
  });
  if (partialMatch) {
    console.log('[ChatAssistant] Partial match found:', option, '->', partialMatch.id);
    return partialMatch.id;
  }
  
  // Try word-based match (any word matches)
  const optionWords = optionLower.split(/[\s-_]+/).filter(w => w.length > 2);
  const wordMatch = catalogItems.find(item => {
    const itemWords = item.name.toLowerCase().split(/[\s-_]+/);
    return optionWords.some(word => itemWords.some(iw => iw.includes(word) || word.includes(iw)));
  });
  if (wordMatch) {
    console.log('[ChatAssistant] Word match found:', option, '->', wordMatch.id);
    return wordMatch.id;
  }
  
  console.log('[ChatAssistant] No match found for:', option, 'in', catalogItems.map(c => c.name));
  return null;
};

// Score how well an option matches a catalog item (higher = better match)
const getMatchScore = (option: string, catalogItem: { id: string; name: string }): number => {
  const optionNorm = option.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameNorm = catalogItem.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const idNorm = catalogItem.id.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Exact match gets highest score
  if (optionNorm === nameNorm || optionNorm === idNorm) {
    return 100;
  }
  
  // Check word-based matching with scoring
  const optionWords = option.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const nameWords = catalogItem.name.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  
  let matchingWords = 0;
  for (const optWord of optionWords) {
    for (const nameWord of nameWords) {
      if (optWord === nameWord || optWord.includes(nameWord) || nameWord.includes(optWord)) {
        matchingWords++;
        break;
      }
    }
  }
  
  // Score based on percentage of words matched
  if (matchingWords > 0) {
    const matchRatio = matchingWords / Math.max(optionWords.length, nameWords.length);
    return Math.round(matchRatio * 80); // Max 80 for partial matches
  }
  
  return 0;
};

// Detect category from option text by finding best match across all categories
const detectCategoryFromOption = (
  option: string, 
  catalogOptions: ChatAssistantProps['catalogOptions']
): 'style' | 'shank' | 'metal' | 'shape' | 'carat' | null => {
  if (!catalogOptions) return null;
  
  // Check for carat pattern first (very specific pattern)
  if (/\d+\.?\d*\s*(carat|ct)/i.test(option)) {
    return 'carat';
  }

  // Also treat known carat range labels as carat, even if they don't include "ct"
  if (catalogOptions.caratOptions && catalogOptions.caratOptions.length > 0) {
    const optionNorm = option.toLowerCase().replace(/[\s-_]+/g, '').trim();
    const matchesCaratLabel = catalogOptions.caratOptions.some(c =>
      c.displayName.toLowerCase().replace(/[\s-_]+/g, '').trim() === optionNorm ||
      `${c.displayName}ct`.toLowerCase().replace(/[\s-_]+/g, '').trim() === optionNorm
    );
    if (matchesCaratLabel) return 'carat';
  }
  
  // Score matches across all categories and pick the best one
  let bestCategory: 'style' | 'shank' | 'metal' | 'shape' | null = null;
  let bestScore = 0;
  
  // Check styles
  if (catalogOptions.styles) {
    for (const item of catalogOptions.styles) {
      const score = getMatchScore(option, item);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = 'style';
      }
    }
  }
  
  // Check shanks
  if (catalogOptions.shanks) {
    for (const item of catalogOptions.shanks) {
      const score = getMatchScore(option, item);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = 'shank';
      }
    }
  }
  
  // Check metals
  if (catalogOptions.metals) {
    for (const item of catalogOptions.metals) {
      const score = getMatchScore(option, item);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = 'metal';
      }
    }
  }
  
  // Check shapes
  if (catalogOptions.shapes) {
    for (const item of catalogOptions.shapes) {
      const score = getMatchScore(option, item);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = 'shape';
      }
    }
  }
  
  console.log('[detectCategoryFromOption] Option:', option, 'Best category:', bestCategory, 'Score:', bestScore);
  
  // Only return category if we have a reasonable match (score > 30)
  return bestScore > 30 ? bestCategory : null;
};

const FALLBACK_CARAT_OPTIONS: ReadonlyArray<{ value: CaratRange; label: string }> = [
  { value: 0.5, label: '0.5 - 0.99' },
  { value: 1, label: '1.00 - 1.49' },
  { value: 1.5, label: '1.50 - 1.99' },
  { value: 2, label: '2.00 - 2.49' },
  { value: 2.5, label: '2.50 - 2.99' },
  { value: 3, label: '3.00 - 3.49' },
  { value: 3.5, label: '3.50 - 3.99' },
  { value: 4, label: '4.00 - 5.00' },
] as const;

export const ChatAssistant = ({ 
  onApplyConfiguration, 
  onClose, 
  clientId,
  currentConfiguration,
  onUpdateStyle,
  onUpdateShank,
  onUpdateMetal,
  onUpdateShape,
  onUpdateCarat,
  catalogOptions,
  onCelebrationChange,
  isChatTheme,
  onBookAppointment,
  onSaveDesign,
  onAddToCart,
  onUpdateSize,
  onUpdateEngraving,
  currency = 'USD',
  storeName,
  onResetConfiguration,
  pricingMode
}: ChatAssistantProps) => {
  const { theme } = useWidgetTheme();
  const displayName = storeName || 'JewlX';

  // Context-aware greeting based on current configuration state
  const isDefaultBase = useCallback((cfg?: WidgetConfig): boolean => {
    if (!cfg) return true;
    return cfg.style === 'solitaire' && cfg.shank === 'high-polish' &&
           (cfg.metal === '14K Rose Gold' || cfg.metal === null) &&
           cfg.shape === 'round' && !cfg.caratRange && !cfg.stone;
  }, []);

  const buildGreeting = useCallback((name: string, cfg?: WidgetConfig): string => {
    // Treat the default base config as "nothing configured yet"
    if (!cfg || isDefaultBase(cfg)) {
      return `Hey there! I'm your ${name} AI Jeweler. Ready to help you design the perfect ring. What are you looking for today?`;
    }
    // Any non-default config gets the simplified "continue or start new" prompt
    return `Hey! Looks like you've got something going. Wanna stick with this or start something new?`;
  }, [isDefaultBase]);

  const greetingMessage = buildGreeting(displayName, currentConfiguration);
  // AI sends the first message to greet the user
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: greetingMessage }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showGreetingActions, setShowGreetingActions] = useState(() => !isDefaultBase(currentConfiguration));
  const [streamingComplete, setStreamingComplete] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);
  // Flag to hide CTA immediately when user requests a change
  const [userRequestedChange, setUserRequestedChange] = useState(false);
  const [completedRingImages, setCompletedRingImages] = useState<RingAngleImages | undefined>();
  const [completedRingImage, setCompletedRingImage] = useState<string | undefined>();
  const [completedRingName, setCompletedRingName] = useState<string>('Your Dream Ring');
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Analytics: Track session ID for storing chat data — persist via sessionStorage so chat survives close/reopen
  const sessionStorageKey = `ring-os-session-${clientId || 'anon'}`;
  const [sessionDbId, setSessionDbId] = useState<string | null>(null);
  const sessionIdRef = useRef<string>((() => {
    try {
      const stored = sessionStorage.getItem(`ring-os-session-${clientId || 'anon'}`);
      if (stored) return stored;
    } catch { /* SSR or private browsing */ }
    const newId = crypto.randomUUID();
    try { sessionStorage.setItem(`ring-os-session-${clientId || 'anon'}`, newId); } catch { /* ignore */ }
    return newId;
  })());

  // Restore chat history from database on mount (within same browser session)
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    (async () => {
      try {
        // Find existing session for this sessionId
        const { data: existingSession } = await supabase
          .from('ai_chat_sessions')
          .select('id')
          .eq('session_id', sessionIdRef.current)
          .maybeSingle();

        if (!existingSession || cancelled) return;
        setSessionDbId(existingSession.id);

        // Load messages
        const { data: storedMessages } = await supabase
          .from('ai_chat_messages')
          .select('role, content')
          .eq('session_id', existingSession.id)
          .order('created_at', { ascending: true });

        if (storedMessages && storedMessages.length > 0 && !cancelled) {
          const restored: Message[] = storedMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
              .replace(/APPLY_CONFIG:\s*\{[\s\S]*?\}/g, '')
              .replace(/APPLY_CONFIG[:\s]*/gi, '')
              .trim() || m.content,
          }));
          setMessages(restored);
          setConversationPhase('designing');
          setShowGreetingActions(false);
        }
      } catch (err) {
        console.error('[ChatAssistant] Error restoring chat history:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [clientId]);
  
  // Update greeting message when storeName loads after mount
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && prev[0].role === 'assistant') {
        return [{ role: 'assistant', content: buildGreeting(displayName, currentConfiguration) }];
      }
      return prev;
    });
  }, [displayName, buildGreeting]);

  // Notify parent when celebration state changes (to freeze ProductViewer)
  useEffect(() => {
    onCelebrationChange?.(showCelebration);
  }, [showCelebration, onCelebrationChange]);
  
  // Track conversation's own configuration progress
  // Synced from currentConfiguration (widget state) so the chat always reflects reality
  const [conversationConfig, setConversationConfig] = useState<WidgetConfig>(() => {
    if (currentConfiguration) {
      return {
        style: currentConfiguration.style || undefined,
        shank: currentConfiguration.shank || undefined,
        metal: currentConfiguration.metal || undefined,
        shape: currentConfiguration.shape || undefined,
        caratRange: currentConfiguration.caratRange || undefined,
        stone: currentConfiguration.stone || undefined,
      };
    }
    return {};
  });

  // Milestone-based summary tracking: persist summary per message index
  const [lastSummarySignature, setLastSummarySignature] = useState<string>('');
  // Persist which message index should show a summary card and what data it had
  const [persistedSummaries, setPersistedSummaries] = useState<Record<number, any>>({});

  // Compute a config signature for milestone detection
  const configSignature = useMemo(() => {
    const cfg = currentConfiguration;
    if (!cfg) return '';
    const parts = [cfg.style, cfg.shank, cfg.metal, cfg.shape, cfg.caratRange, cfg.stone?.id, cfg.stone?.type, cfg.stone?.carat].filter(Boolean);
    return parts.join('|');
  }, [currentConfiguration]);

  // Determine if we should show the summary card right now (milestone-based)
  const summaryMilestone = useMemo(() => {
    const cfg = currentConfiguration;
    if (!cfg) return false;
    if (isDefaultBase(cfg)) return false;
    if (!cfg.style && !cfg.shank && !cfg.metal && !cfg.shape) return false;
    if (configSignature === lastSummarySignature) return false;
    const baseComplete = isBaseRingComplete(cfg);
    const checkoutReady = isCheckoutReady(cfg);
    return baseComplete || checkoutReady;
  }, [currentConfiguration, configSignature, lastSummarySignature, isDefaultBase]);

  // When a milestone fires and streaming is done, persist the summary and mark it shown
  useEffect(() => {
    if (summaryMilestone && streamingComplete && configSignature) {
      // Find the latest assistant message index
      const latestAssistantIdx = messages.reduce((acc, m, i) => m.role === 'assistant' ? i : acc, -1);
      if (latestAssistantIdx >= 0 && liveSummaryData) {
        setPersistedSummaries(prev => ({ ...prev, [latestAssistantIdx]: { ...liveSummaryData } }));
      }
      // Delay marking so the card stays visible even across re-renders
      const timer = setTimeout(() => {
        setLastSummarySignature(configSignature);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [summaryMilestone, streamingComplete, configSignature]);

  // Keep conversationConfig in sync with widget state changes
  // Use true overwrite semantics so reset/clear actually clears values
  useEffect(() => {
    if (!currentConfiguration) return;
    setConversationConfig({
      style: currentConfiguration.style || undefined,
      shank: currentConfiguration.shank || undefined,
      metal: currentConfiguration.metal || undefined,
      shape: currentConfiguration.shape || undefined,
      caratRange: currentConfiguration.caratRange ?? undefined,
      stone: currentConfiguration.stone || undefined,
    });
  }, [currentConfiguration?.style, currentConfiguration?.shank, currentConfiguration?.metal, currentConfiguration?.shape, currentConfiguration?.caratRange, currentConfiguration?.stone]);
  
  // Track last acknowledged stone ID — when a new stone is resolved by the parent (via
  // resolveDiamondFromPresets), post a concise confirmation so the user sees the actual specs,
  // not just whatever the AI texted. This closes the "AI said 4.5ct but widget applied 4ct" gap.
  const lastAcknowledgedStoneIdRef = useRef<string | null>(null);
  useEffect(() => {
    const stone = currentConfiguration?.stone;
    if (!stone) return;
    const stoneId = stone.id || `${stone.type}-${stone.carat}-${stone.color}-${stone.clarity}`;
    if (stoneId === lastAcknowledgedStoneIdRef.current) return;
    lastAcknowledgedStoneIdRef.current = stoneId;
  }, [currentConfiguration?.stone?.id, currentConfiguration?.stone?.carat, currentConfiguration?.stone?.color, currentConfiguration?.stone?.clarity]);

  // Track conversation phase for the two-step intro before showing options
  const [conversationPhase, setConversationPhase] = useState<'greeting' | 'intro' | 'designing'>('greeting');
  
  // Analytics: Create or get session in database
  const ensureSessionExists = useCallback(async () => {
    if (sessionDbId || !clientId) return sessionDbId;
    
    try {
      // Check if session already exists
      const { data: existingSession } = await supabase
        .from('ai_chat_sessions')
        .select('id')
        .eq('session_id', sessionIdRef.current)
        .maybeSingle();
      
      if (existingSession) {
        setSessionDbId(existingSession.id);
        return existingSession.id;
      }
      
      // Create new session
      const { data: newSession, error } = await supabase
        .from('ai_chat_sessions')
        .insert({
          session_id: sessionIdRef.current,
          client_id: clientId,
          started_at: new Date().toISOString(),
          message_count: 0,
          configuration_applied: false,
          design_saved: false
        })
        .select('id')
        .single();
      
      if (error) {
        console.error('[ChatAssistant] Error creating session:', error);
        return null;
      }
      
      setSessionDbId(newSession.id);
      return newSession.id;
    } catch (err) {
      console.error('[ChatAssistant] Error in ensureSessionExists:', err);
      return null;
    }
  }, [clientId, sessionDbId]);
  
  // Analytics: Store a message in the database
  const storeMessage = useCallback(async (role: 'user' | 'assistant', content: string) => {
    const dbSessionId = await ensureSessionExists();
    if (!dbSessionId) return;
    
    try {
      // Insert the message
      await supabase
        .from('ai_chat_messages')
        .insert({
          session_id: dbSessionId,
          role,
          content
        });
      
      // Update message count in session
      await supabase
        .from('ai_chat_sessions')
        .update({ 
          message_count: messages.length + 1,
          ended_at: new Date().toISOString()
        })
        .eq('id', dbSessionId);
    } catch (err) {
      console.error('[ChatAssistant] Error storing message:', err);
    }
  }, [ensureSessionExists, messages.length]);
  
  // Analytics: Mark configuration as applied with config data
  const markConfigurationApplied = useCallback(async (configData: Record<string, any>) => {
    const dbSessionId = await ensureSessionExists();
    if (!dbSessionId) return;
    
    try {
      await supabase
        .from('ai_chat_sessions')
        .update({
          configuration_applied: true,
          configuration_data: configData,
          ended_at: new Date().toISOString()
        })
        .eq('id', dbSessionId);
      
      console.log('[ChatAssistant] Configuration marked as applied:', configData);
    } catch (err) {
      console.error('[ChatAssistant] Error marking configuration applied:', err);
    }
  }, [ensureSessionExists]);

  // Reset configuration and restart the design flow
  const resetConfiguration = useCallback(() => {
    console.log('[ChatAssistant] Resetting configuration to empty state');
    setConversationConfig({});
    setConversationPhase('designing');
    setLastSummarySignature('');
    // Call the full widget reset instead of forcing fake defaults
    onResetConfiguration?.();
  }, [onResetConfiguration]);

  // Detect if user wants to start a new ring
  const detectNewRingRequest = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    const newRingPhrases = [
      'new ring', 'start over', 'start again', 'begin again', 'restart',
      'different ring', 'another ring', 'fresh start', 'start fresh',
      'don\'t want this', 'dont want this', 'not this ring', 
      'change everything', 'make a new', 'create new', 'build new',
      'want to make new', 'want a new', 'i want new'
    ];
    return newRingPhrases.some(phrase => lowerText.includes(phrase));
  };

  // Detect if user wants to modify a specific previous selection
  const detectModificationRequest = (text: string): { category: 'style' | 'shank' | 'metal' | 'shape' | 'carat' | null; newValue: string | null } => {
    const lowerText = text.toLowerCase();
    
    const changePhrases = ['change', 'switch', 'use', 'want', 'prefer', 'actually', 'instead', 'not', 'no wait', 'oh wait', 'sorry'];
    const hasChangeIntent = changePhrases.some(phrase => lowerText.includes(phrase));
    
    if (!hasChangeIntent || !catalogOptions) {
      return { category: null, newValue: null };
    }
    
    if (catalogOptions.styles) {
      for (const style of catalogOptions.styles) {
        if (lowerText.includes(style.name.toLowerCase()) || lowerText.includes(style.id.replace(/-/g, ' '))) {
          return { category: 'style', newValue: style.id };
        }
      }
    }
    
    if (catalogOptions.shanks) {
      for (const shank of catalogOptions.shanks) {
        if (lowerText.includes(shank.name.toLowerCase()) || lowerText.includes(shank.id.replace(/-/g, ' '))) {
          return { category: 'shank', newValue: shank.id };
        }
      }
    }
    
    if (catalogOptions.metals) {
      for (const metal of catalogOptions.metals) {
        if (lowerText.includes(metal.name.toLowerCase()) || lowerText.includes(metal.id.replace(/-/g, ' '))) {
          return { category: 'metal', newValue: metal.id };
        }
      }
    }
    
    if (catalogOptions.shapes) {
      for (const shape of catalogOptions.shapes) {
        if (lowerText.includes(shape.name.toLowerCase()) || lowerText.includes(shape.id.replace(/-/g, ' '))) {
          return { category: 'shape', newValue: shape.id };
        }
      }
    }
    
    return { category: null, newValue: null };
  };

  // Apply modification to a specific category and update widget
  const applyModification = useCallback((category: 'style' | 'shank' | 'metal' | 'shape' | 'carat', value: string) => {
    console.log('[ChatAssistant] Applying modification:', category, '->', value);
    
    switch (category) {
      case 'style':
        onUpdateStyle?.(value as RingStyle, { source: 'user' });
        setConversationConfig(prev => ({ ...prev, style: value }));
        break;
      case 'shank':
        onUpdateShank?.(value as RingShank, { source: 'user' });
        setConversationConfig(prev => ({ ...prev, shank: value }));
        break;
      case 'metal':
        onUpdateMetal?.(value as RingMetal, { source: 'user' });
        setConversationConfig(prev => ({ ...prev, metal: value }));
        break;
      case 'shape':
        onUpdateShape?.(value as RingShape, { source: 'user' });
        setConversationConfig(prev => ({ ...prev, shape: value }));
        break;
      case 'carat':
        const caratValue = parseFloat(value);
        if (!isNaN(caratValue)) {
          onUpdateCarat?.(caratValue as CaratRange, { source: 'user' });
          setConversationConfig(prev => ({ ...prev, caratRange: caratValue }));
        }
        break;
    }
  }, [onUpdateStyle, onUpdateShank, onUpdateMetal, onUpdateShape, onUpdateCarat]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  // Track last applied typing value to avoid duplicate applications
  const lastTypingAppliedRef = useRef<string>('');

  // Debounced real-time ring updates as user types
  // Detects catalog terms (shape, metal, style, shank) and applies immediately
  useEffect(() => {
    if (input.length < 3 || isLoading) return;
    const timer = setTimeout(() => {
      const lowerInput = input.toLowerCase().trim();
      // Skip if we already applied this exact input
      if (lowerInput === lastTypingAppliedRef.current) return;

      // Direct catalog term matching (no change intent needed — just typing the term is enough)
      if (catalogOptions) {
        const categories: Array<{ items: CatalogOption[] | undefined; category: 'style' | 'shank' | 'metal' | 'shape' }> = [
          { items: catalogOptions.styles, category: 'style' },
          { items: catalogOptions.shanks, category: 'shank' },
          { items: catalogOptions.metals, category: 'metal' },
          { items: catalogOptions.shapes, category: 'shape' },
        ];
        for (const { items, category } of categories) {
          if (!items) continue;
          for (const item of items) {
            const nameLower = item.name.toLowerCase();
            // Only match if the full catalog name appears in the input (avoid partial word matches)
            if (lowerInput.includes(nameLower) && nameLower.length >= 3) {
              lastTypingAppliedRef.current = lowerInput;
              applyModification(category, item.id);
              return;
            }
          }
        }
        // Check carat pattern
        const caratMatch = lowerInput.match(/(\d+\.?\d*)\s*(carat|ct)/);
        if (caratMatch) {
          const caratVal = parseFloat(caratMatch[1]);
          if (!isNaN(caratVal) && caratVal >= 0.5 && caratVal <= 5) {
            const closest = catalogOptions.caratOptions?.reduce((best, opt) => {
              return Math.abs(opt.value - caratVal) < Math.abs(best.value - caratVal) ? opt : best;
            }, catalogOptions.caratOptions[0]);
            if (closest) {
              lastTypingAppliedRef.current = lowerInput;
              applyModification('carat', String(closest.value));
              return;
            }
          }
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [input, isLoading, catalogOptions, applyModification]);

  // Helper function to scroll to bottom - target the Radix viewport directly
  const scrollToBottom = useCallback((smooth = true) => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      const max = viewport.scrollHeight - viewport.clientHeight;
      if (smooth) {
        viewport.scrollTo({ top: max + 9999, behavior: 'smooth' });
      } else {
        viewport.scrollTop = max + 9999;
      }
    }
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'end' });
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom(false);
    const t1 = setTimeout(() => scrollToBottom(false), 50);
    const t2 = setTimeout(() => scrollToBottom(false), 150);
    const t3 = setTimeout(() => scrollToBottom(false), 300);
    const t4 = setTimeout(() => scrollToBottom(false), 600);
    const t5 = setTimeout(() => scrollToBottom(false), 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, [messages, scrollToBottom]);

  // MutationObserver to auto-scroll when content changes (streaming text)
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    const observer = new MutationObserver(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(viewport, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const handleStreamingComplete = useCallback(() => {
    setStreamingComplete(true);
    scrollToBottom(true);
  }, [scrollToBottom]);

  // Scroll to bottom during streaming progress - smooth auto-scroll
  const handleStreamingProgress = useCallback(() => {
    scrollToBottom(true);
  }, [scrollToBottom]);

  // Helper: check if user text mentions a catalog option
  const textMatchesOption = (lowerText: string, optionName: string, optionId: string): boolean => {
    const nameLower = optionName.toLowerCase();
    const idSpaced = optionId.toLowerCase().replace(/-/g, ' ');
    
    if (lowerText.includes(nameLower)) return true;
    if (lowerText.includes(idSpaced)) return true;
    
    const nameWords = nameLower.split(/\s+/).filter(w => w.length > 1);
    if (nameWords.length === 1) return false;
    
    const significantWords = nameWords.filter(w => !/^\d+k?$/i.test(w));
    if (significantWords.length > 0 && significantWords.every(w => lowerText.includes(w))) {
      return true;
    }
    
    return false;
  };

  // [REMOVED] parseAndApplyConfigFromText — APPLY_CONFIG from the AI is the single source of truth.
  // The old client-side text parser caused conflicts with the AI's own configuration output.

  // Build the current config snapshot to send to the edge function
  const buildCurrentConfigForAI = useCallback((): Record<string, any> | null => {
    const cfg = currentConfiguration;
    if (!cfg) return null;
    const defaultBase = isDefaultBase(cfg);
    // If config is at defaults (not user-chosen), send isDefault flag so the AI knows
    if (defaultBase) return { isDefault: true };

    const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');

    // Fuzzy-find a catalog option by ID or name
    const fuzzyFind = <T extends { id: string; name: string }>(list: T[] | undefined, val: string | null | undefined): T | undefined => {
      if (!list || !val) return undefined;
      const v = norm(val);
      return list.find(item => item.id === val || norm(item.id) === v || norm(item.name) === v);
    };

    const result: Record<string, any> = {};

    // Map IDs to names for the AI using catalog options
    if (cfg.style) {
      const opt = fuzzyFind(catalogOptions?.styles, cfg.style);
      result.style = opt ? opt.name : cfg.style;
    }
    if (cfg.shank) {
      const opt = fuzzyFind(catalogOptions?.shanks, cfg.shank);
      result.shank = opt ? opt.name : cfg.shank;
    }
    if (cfg.metal) {
      const opt = fuzzyFind(catalogOptions?.metals, cfg.metal);
      result.metal = opt ? opt.name : cfg.metal;
    }
    if (cfg.shape) {
      const opt = fuzzyFind(catalogOptions?.shapes, cfg.shape);
      result.shape = opt ? opt.name : cfg.shape;
    }
    if (cfg.caratRange) {
      const opt = catalogOptions?.caratOptions?.find(c => c.value === cfg.caratRange);
      result.carat = opt ? opt.displayName : `${cfg.caratRange} ct`;
    }
    if (cfg.stone) {
      result.diamond = `${cfg.stone.type === 'lab' ? 'Lab-Grown' : 'Natural'} ${cfg.stone.carat}ct ${cfg.stone.color}/${cfg.stone.clarity} ($${cfg.stone.price})`;
    }

    // Attach confirmed component prices so the AI never needs to recalculate
    const styleOpt = fuzzyFind(catalogOptions?.styles, cfg.style);
    const shankOpt = fuzzyFind(catalogOptions?.shanks, cfg.shank);
    const metalOpt = fuzzyFind(catalogOptions?.metals, cfg.metal);
    const stylePrice = styleOpt?.price ?? 0;
    const shankPrice = shankOpt?.price ?? 0;
    const metalPrice = metalOpt?.price ?? 0;
    const stonePrice = cfg.stone?.price ?? 0;
    const confirmedTotal = stylePrice + shankPrice + metalPrice + stonePrice;

    if (confirmedTotal > 0) {
      result.confirmedPrices = {
        style: stylePrice,
        shank: shankPrice,
        metal: metalPrice,
        diamond: stonePrice,
        total: confirmedTotal,
      };
    }

    return Object.keys(result).length > 0 ? result : null;
  }, [currentConfiguration, catalogOptions]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setShowGreetingActions(false);
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    
    // Analytics: Store user message
    storeMessage('user', userMessage);
    
    // Delegate all logic to the unified sendMessage
    sendMessage(userMessage);
  };

  // Extract options from the last assistant message
  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i];
      }
    }
    return null;
  }, [messages]);

  // Determine current step from the CONVERSATION's configuration state
  const currentStep = useMemo(() => {
    return getNextStepFromConfig(conversationConfig);
  }, [conversationConfig]);

  // Quick option buttons are disabled - conversation is fully natural via AI chat
  const availableOptions = useMemo((): { label: string; price?: number }[] => {
    return [];
  }, [isLoading, streamingComplete, catalogOptions, currentStep, conversationPhase]);

  // Handle clicking on an option button - apply real-time update
  const handleOptionClick = (option: string) => {
    if (isLoading) return;
    
    const detectedCategory = detectCategoryFromOption(option, catalogOptions);
    console.log('[ChatAssistant] Option clicked:', option, 'Detected category:', detectedCategory);
    
    if (detectedCategory && catalogOptions) {
      switch (detectedCategory) {
        case 'style': {
          const styleId = matchOptionToId(option, catalogOptions.styles);
          if (styleId) {
            onUpdateStyle?.(styleId as RingStyle, { source: 'user' });
            setConversationConfig(prev => ({ ...prev, style: styleId }));
          }
          break;
        }
        case 'shank': {
          const shankId = matchOptionToId(option, catalogOptions.shanks);
          if (shankId) {
            onUpdateShank?.(shankId as RingShank, { source: 'user' });
            setConversationConfig(prev => ({ ...prev, shank: shankId }));
          }
          break;
        }
        case 'metal': {
          const metalId = matchOptionToId(option, catalogOptions.metals);
          if (metalId) {
            onUpdateMetal?.(metalId as RingMetal, { source: 'user' });
            setConversationConfig(prev => ({ ...prev, metal: metalId }));
          }
          break;
        }
        case 'shape': {
          const shapeId = matchOptionToId(option, catalogOptions.shapes);
          if (shapeId) {
            onUpdateShape?.(shapeId as RingShape, { source: 'user' });
            setConversationConfig(prev => ({ ...prev, shape: shapeId }));
          }
          break;
        }
        case 'carat': {
          const caratMatch = option.match(/(\d+\.?\d*)/);
          const caratValue = caratMatch ? parseFloat(caratMatch[1]) : null;
          const allowed: CaratRange[] = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

          if (caratValue !== null && allowed.includes(caratValue as CaratRange)) {
            onUpdateCarat?.(caratValue as CaratRange, { source: 'user' });
            setConversationConfig(prev => ({ ...prev, caratRange: caratValue }));
          }
          break;
        }
      }
    }
    
    setInput(option);
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'user', content: option }]);
      storeMessage('user', option);
      setInput('');
      sendMessage(option);
    }, 100);
  };

  // Unified send helper — used by option clicks and any programmatic sends.
  // Adds the user message to state and calls the core AI logic (same as handleSend body).
  const sendMessage = async (messageContent: string) => {
    const messageLower = messageContent.toLowerCase();
    
    // Check for new ring request
    if (detectNewRingRequest(messageContent)) {
      resetConfiguration();
      setUserRequestedChange(true);
    }
    
    // Check for modification request
    const modificationRequest = detectModificationRequest(messageContent);
    if (modificationRequest.category && modificationRequest.newValue) {
      applyModification(modificationRequest.category, modificationRequest.newValue);
      setUserRequestedChange(true);
    }
    
    const readyConfirmPhrases = ['yes', 'yeah', 'yep', 'ready', 'let\'s go', 'lets go', 'let\'s do it', 'sure', 'ok', 'okay', 'absolutely', 'start', 'begin', 'go', 'do it'];
    const isConfirmingReady = readyConfirmPhrases.some(phrase => 
      messageLower === phrase || 
      messageLower.startsWith(phrase + ' ') || 
      messageLower.endsWith(' ' + phrase)
    );
    
    if (conversationPhase === 'intro' && isConfirmingReady) {
      setConversationPhase('designing');
    }
    
    setIsLoading(true);

    try {
      const currentConfig = buildCurrentConfigForAI();
      
      const doInvoke = () => supabase.functions.invoke('ring-chat', {
        body: {
          messages: [...messages, { role: 'user', content: messageContent }],
          clientId: clientId || null,
          currentConfig,
          pricingMode: pricingMode || null,
        },
      });

      let result = await doInvoke();

      if (result.error && (result.error as any)?.status === 503) {
        console.log('[ChatAssistant] Got 503, retrying in 2s...');
        await new Promise(r => setTimeout(r, 2000));
        result = await doInvoke();
      }

      if (result.error) {
        const status = (result.error as any)?.status;
        if (status === 429) {
          throw new Error('AI is busy right now. Please wait a moment and try again.');
        } else if (status === 402) {
          throw new Error("AI assistant is temporarily unavailable. Please try again later or contact the store directly.");
        } else if (status === 503) {
          throw new Error('AI is momentarily unavailable. Please try again in a few seconds.');
        }
        console.error('[ChatAssistant] Edge function error:', result.error);
        throw new Error('Failed to get response');
      }

      const data = result.data;
      const msgLower = data.message.toLowerCase();
      
      const readyToStartPhrases = ['ready to start', 'ready to begin', 'shall we start', 'shall we begin', 'are you ready', 'ready to create', 'ready to design'];
      const isAskingReadyToStart = readyToStartPhrases.some(phrase => msgLower.includes(phrase));
      
      if (conversationPhase === 'greeting' && isAskingReadyToStart) {
        setConversationPhase('intro');
      }
      
      const designFlowPhrases = [
        'let\'s start with', 'start with the style', 'what style', 'which style',
        'what metal', 'which metal', 'what band', 'which band', 'what shank', 'which shank',
        'what shape', 'which shape', 'what diamond', 'which diamond', 'what carat', 'which carat',
        'catches your eye', 'narrow it down', 'here are some', 'here are a few',
        'options under', 'options for', 'gorgeous options', 'stunning options',
        'what are you', 'what do you', 'what\'s your', 'how about',
        'solitaire', 'three stone', 'three-stone', 'halo', 'pavé', 'pave',
        'high polish', 'rose gold', 'yellow gold', 'white gold', 'platinum',
        'round', 'oval', 'princess', 'emerald', 'cushion', 'pear', 'marquise', 'radiant'
      ];
      const isStartingDesignFlow = designFlowPhrases.some(phrase => msgLower.includes(phrase));
      if (isStartingDesignFlow && conversationPhase !== 'designing') {
        setConversationPhase('designing');
      }
      
      // Configuration is applied via APPLY_CONFIG JSON only — no text parsing

      // Strip any leaked APPLY_CONFIG text from the visible message
      let cleanDisplayMessage = data.message
        .replace(/APPLY_CONFIG:\s*\{[\s\S]*?\}/g, '')
        .replace(/APPLY_CONFIG[:\s]*/gi, '')
        .trim();
      // Strip emojis client-side as safety net
      cleanDisplayMessage = cleanDisplayMessage.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B50}\u{2728}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{2702}-\u{27B0}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
      if (!cleanDisplayMessage) cleanDisplayMessage = "I've updated your ring configuration!";

      setStreamingComplete(false);
      setMessages(prev => [...prev, { role: 'assistant', content: cleanDisplayMessage }]);
      setUserRequestedChange(false);
      
      storeMessage('assistant', data.message);
      
      if (isBaseRingComplete(conversationConfig)) {
        const configDataForAnalytics = {
          style: conversationConfig.style,
          shank: conversationConfig.shank,
          metal: conversationConfig.metal,
          shape: conversationConfig.shape,
          caratRange: conversationConfig.caratRange
        };
        markConfigurationApplied(configDataForAnalytics);
      }
      
      // Check if AI provided a configuration to apply
      if (data.configuration) {
        // Fuzzy-match carat value to closest catalog option; preserve original for diamond resolution
        let resolvedCaratRange = data.configuration.caratRange;
        let rawCarat: number | null = null;
        if (resolvedCaratRange != null && catalogOptions?.caratOptions?.length) {
          const parsedCarat = typeof resolvedCaratRange === 'string' ? parseFloat(resolvedCaratRange) : resolvedCaratRange;
          if (!isNaN(parsedCarat)) {
            rawCarat = parsedCarat;
            const exactMatch = catalogOptions.caratOptions.find(c => c.value === parsedCarat);
            if (exactMatch) {
              resolvedCaratRange = exactMatch.value;
            } else {
              let bestMatch = catalogOptions.caratOptions[0];
              let bestDist = Math.abs(bestMatch.value - parsedCarat);
              for (const opt of catalogOptions.caratOptions) {
                const dist = Math.abs(opt.value - parsedCarat);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestMatch = opt;
                }
              }
              resolvedCaratRange = bestMatch.value;
              console.log('[ChatAssistant] Fuzzy carat match:', parsedCarat, '->', resolvedCaratRange, `(${bestMatch.displayName})`);
            }
          }
        }

        setConversationConfig(prev => ({
          ...prev,
          ...(data.configuration.style && { style: data.configuration.style }),
          ...(data.configuration.shank && { shank: data.configuration.shank }),
          ...(data.configuration.metal && { metal: data.configuration.metal }),
          ...(data.configuration.shape && { shape: data.configuration.shape }),
          ...(resolvedCaratRange != null && { caratRange: resolvedCaratRange }),
        }));

        const resolvedConfig = { ...data.configuration };
        if (resolvedCaratRange != null) {
          resolvedConfig.caratRange = resolvedCaratRange;
        }
        // Forward the original (unsnapped) carat so diamond resolution uses the exact user request
        if (rawCarat != null) {
          resolvedConfig.rawCarat = rawCarat;
        }
        // color and clarity pass through from APPLY_CONFIG for preferred-grade matching

        // Handle size if provided
        if (data.configuration.size && onUpdateSize) {
          onUpdateSize(data.configuration.size);
        }
        // Handle engraving if provided
        if (data.configuration.engraving && onUpdateEngraving) {
          onUpdateEngraving({
            enabled: true,
            text: data.configuration.engraving.slice(0, 20),
            bandWidth: '3mm',
            otherRequest: '',
          });
        }
        setTimeout(() => {
          if (onApplyConfiguration) {
            onApplyConfiguration(resolvedConfig);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('[ChatAssistant] sendMessage error:', error);
      const errorMessage = error instanceof Error && error.message !== 'Failed to get response'
        ? error.message
        : "I'm sorry, I encountered an error. Please try again.";
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMessage
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  // Build summary data from the LIVE widget configuration (currentConfiguration) 
  // Uses case-insensitive slug-normalized matching with fallbacks so all fields always show
  const liveSummaryData = useMemo(() => {
    const cfg = currentConfiguration;
    if (!cfg) return null;
    if (!isBaseRingComplete(cfg)) return null;

    // Helper: find catalog option by ID with case-insensitive, slug-normalized matching
    const findOption = <T extends { id: string; name: string }>(list: T[] | undefined, value: string | null | undefined): T | undefined => {
      if (!list || !value) return undefined;
      const valLower = value.toLowerCase();
      const valSlug = valLower.replace(/[\s\-_]+/g, '');
      return list.find(item => {
        const idLower = item.id.toLowerCase();
        const nameLower = item.name.toLowerCase();
        const idSlug = idLower.replace(/[\s\-_]+/g, '');
        const nameSlug = nameLower.replace(/[\s\-_]+/g, '');
        return idLower === valLower || nameLower === valLower || idSlug === valSlug || nameSlug === valSlug;
      });
    };

    // Format a raw slug/id to Title Case as fallback display name
    const toTitleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const styleOpt = findOption(catalogOptions?.styles, cfg.style);
    const shankOpt = findOption(catalogOptions?.shanks, cfg.shank);
    const metalOpt = findOption(catalogOptions?.metals, cfg.metal);
    const shapeOpt = findOption(catalogOptions?.shapes, cfg.shape);
    const caratOpt = cfg.caratRange
      ? catalogOptions?.caratOptions?.find(c => c.value === cfg.caratRange)
      : undefined;

    const stoneData = cfg.stone
      ? (() => {
          const s = cfg.stone!;
          const label = `${s.type === 'lab' ? 'Lab' : 'Natural'} ${s.carat}ct ${s.color}/${s.clarity}`;
          return { name: label, price: s.price, reportNo: s.reportNo ?? null };
        })()
      : undefined;

    return {
      style: styleOpt ? { name: styleOpt.name, price: styleOpt.price } : cfg.style ? { name: toTitleCase(cfg.style) } : undefined,
      shank: shankOpt ? { name: shankOpt.name, price: shankOpt.price } : cfg.shank ? { name: toTitleCase(cfg.shank) } : undefined,
      metal: metalOpt ? { name: metalOpt.name, price: metalOpt.price } : cfg.metal ? { name: toTitleCase(cfg.metal) } : undefined,
      shape: shapeOpt ? { name: shapeOpt.name } : cfg.shape ? { name: toTitleCase(cfg.shape) } : undefined,
      carat: caratOpt ? { value: caratOpt.value, displayName: caratOpt.displayName } : cfg.caratRange ? { value: cfg.caratRange } : undefined,
      stone: stoneData,
    };
  }, [currentConfiguration, catalogOptions]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* iOS-style Header - Compact */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-1 sm:py-2 bg-background/95 backdrop-blur-lg border-b border-border/50 flex-shrink-0 min-h-[32px] sm:min-h-[44px]">
        {onClose ? (
          <button 
            onClick={onClose} 
            className="w-6 h-6 sm:w-9 sm:h-9 flex items-center justify-center text-primary hover:opacity-70 transition-opacity flex-shrink-0"
            aria-label="Close chat"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        ) : (
          <div className="w-6 sm:w-9 flex-shrink-0" />
        )}
        <div className="flex flex-col items-center flex-1 min-w-0 px-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs sm:text-sm font-semibold text-foreground">Ring OS</span>
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 leading-none">
              In Beta
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => {
              if (isLoading) return;
              const randomizeMsg = 'Randomize';
              setMessages(prev => [...prev, { role: 'user', content: randomizeMsg }]);
              storeMessage('user', randomizeMsg);
              sendMessage(randomizeMsg);
            }}
            className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors"
            aria-label="Randomize ring"
            title="Randomize"
          >
            <Shuffle className="w-3 h-3 sm:w-4 sm:h-4 text-foreground" />
          </button>
          <button
            onClick={() => {
              resetConfiguration();
              setMessages([{ role: 'assistant', content: buildGreeting(displayName) }]);
              setConversationPhase('greeting');
              setShowCelebration(false);
              setCompletedRingImages(undefined);
              setCompletedRingImage(undefined);
              setCompletedRingName('');
              setLastSummarySignature('');
              setPersistedSummaries({});
              setUserRequestedChange(false);
              sessionIdRef.current = crypto.randomUUID();
              try { sessionStorage.setItem(`ring-os-session-${clientId || 'anon'}`, sessionIdRef.current); } catch { /* ignore */ }
              setSessionDbId(null);
            }}
            className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors"
            aria-label="Reset conversation"
            title="Start over"
          >
            <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4 text-foreground" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 px-1.5 sm:px-3 py-1.5 sm:py-3" ref={scrollRef}>
        <div className="space-y-1 sm:space-y-2">
          <AnimatePresence initial={false}>
            {messages.map((message, index) => {
              const isLatest = index === messages.length - 1;
              const isUser = message.role === 'user';
              // Show persisted summary for this message, or live milestone for latest
              const persistedSummary = persistedSummaries[index];
              const showLiveMilestone = isLatest && !isUser && summaryMilestone && liveSummaryData;
              const summaryToShow = persistedSummary || (showLiveMilestone ? liveSummaryData : null);
              
              return (
                <div key={index}>
                  <StreamingMessage
                    content={message.content}
                    isUser={isUser}
                    isLatest={isLatest && !isUser}
                    onComplete={isLatest && !isUser ? handleStreamingComplete : undefined}
                    onStreamingProgress={isLatest && !isUser ? handleStreamingProgress : undefined}
                  />
                  {/* Continue / Start New action buttons after greeting */}
                  {index === 0 && !isUser && showGreetingActions && messages.length === 1 && !isLoading && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-2 mt-2 px-1"
                    >
                      <button
                        onClick={() => {
                          setShowGreetingActions(false);
                          setMessages(prev => [...prev, { role: 'user', content: 'Continue' }]);
                          storeMessage('user', 'Continue');
                          sendMessage('Continue');
                        }}
                        className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-all active:scale-[0.98]"
                      >
                        Continue
                      </button>
                      <button
                        onClick={() => {
                          setShowGreetingActions(false);
                          resetConfiguration();
                          setMessages([{ role: 'assistant', content: buildGreeting(displayName) }]);
                          setConversationPhase('greeting');
                          setShowCelebration(false);
                          setCompletedRingImages(undefined);
                          setCompletedRingImage(undefined);
                          setCompletedRingName('');
                          setLastSummarySignature('');
                          setPersistedSummaries({});
                          setUserRequestedChange(false);
                          sessionIdRef.current = crypto.randomUUID();
                          try { sessionStorage.setItem(`ring-os-session-${clientId || 'anon'}`, sessionIdRef.current); } catch { /* ignore */ }
                          setSessionDbId(null);
                        }}
                        className="flex-1 py-2 rounded-xl bg-muted text-foreground text-[13px] font-semibold hover:bg-muted/80 transition-all active:scale-[0.98]"
                      >
                        Start New
                      </button>
                    </motion.div>
                  )}
                  {!isUser && summaryToShow && (
                    <div className="mt-1.5 sm:mt-2">
                      <ConfigurationSummaryCard
                        style={summaryToShow.style}
                        shank={summaryToShow.shank}
                        metal={summaryToShow.metal}
                        shape={summaryToShow.shape}
                        carat={summaryToShow.carat}
                        stone={summaryToShow.stone}
                        currency={currency}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </AnimatePresence>
          
          {/* iOS-style Typing Indicator for AI */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-end gap-1.5 sm:gap-2 justify-start"
            >
              <div className="bg-[#E9E9EB] dark:bg-[#3A3A3C] rounded-2xl rounded-bl-sm px-3 py-2.5">
                <FacetShiftThinking />
              </div>
            </motion.div>
          )}
        </div>
        <div ref={messagesEndRef} className="h-1" />
      </ScrollArea>

      {/* Quick Options */}
      {availableOptions.length > 0 && !isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && (
        <div className="px-1.5 sm:px-3 py-1 sm:py-2 bg-gradient-to-t from-background via-background/95 to-background/80 backdrop-blur-sm border-t border-border/30 flex-shrink-0">
          <motion.div 
            className="flex gap-1 sm:gap-2 overflow-x-auto pb-0.5 scrollbar-hide"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AnimatePresence mode="popLayout">
              {availableOptions.map((option, index) => (
                <QuickOptionButton
                  key={option.label}
                  option={option.label}
                  price={option.price}
                  index={index}
                  onClick={() => handleOptionClick(option.label)}
                  category={currentStep}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      {/* Add to Cart CTA — only shows after diamond is selected AND conversation is complete (no pending step) */}
      {onAddToCart && isCheckoutReady(currentConfiguration) && !showCelebration && !userRequestedChange && currentStep === null && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-3 sm:px-4 py-2 bg-background/95 backdrop-blur-lg border-t border-border/40 flex-shrink-0"
        >
          <button
            onClick={onAddToCart}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-all shadow-sm active:scale-[0.98]"
          >
            <ShoppingCart className="w-4 h-4" />
            Add to Cart & Checkout
          </button>
        </motion.div>
      )}

      {/* iOS-style Input Bar with + menu */}
      <div className="px-1.5 sm:px-3 pb-1 sm:pb-2 pt-1 sm:pt-1.5 bg-background/95 backdrop-blur-lg border-t border-border/40 flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-1 sm:gap-2"
        >
          {/* + Action Menu */}
          {(onSaveDesign || onBookAppointment) && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors flex-shrink-0"
                  aria-label="More actions"
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-48 p-1.5 bg-card border border-border/50 shadow-lg">
                {onSaveDesign && (
                  <button
                    onClick={onSaveDesign}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm text-foreground"
                  >
                    <Bookmark className="w-4 h-4 text-muted-foreground" />
                    Save Design
                  </button>
                )}
                {onBookAppointment && (
                  <button
                    onClick={onBookAppointment}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm text-foreground"
                  >
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    Book Appointment
                  </button>
                )}
              </PopoverContent>
            </Popover>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center bg-[#F2F2F7] dark:bg-[#2C2C2E] rounded-full px-2.5 sm:px-4 py-1.5 sm:py-2 border border-border/30">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message"
                disabled={isLoading}
                className="flex-1 bg-transparent text-[16px] outline-none text-[#1C1C1E] dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 min-w-0"
              />
              <AnimatePresence>
                {input.trim() && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    type="submit"
                    disabled={isLoading}
                    className={cn("w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center ml-1 sm:ml-2 transition-transform active:scale-95 disabled:opacity-50 flex-shrink-0", theme === 'chat' ? 'bg-[#007AFF]' : 'bg-primary')}
                    aria-label="Send message"
                  >
                    <ArrowUp className={cn("w-3 h-3 sm:w-4 sm:h-4", theme === 'chat' ? 'text-white' : 'text-primary-foreground')} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </form>
      </div>

      {/* Ring Completion Celebration */}
      <RingCompletionCelebration
        isVisible={showCelebration}
        onComplete={() => setShowCelebration(false)}
        ringImages={completedRingImages}
        ringImageUrl={completedRingImage}
        ringName={completedRingName}
      />
    </div>
  );
};
