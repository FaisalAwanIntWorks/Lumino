import { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';

interface StreamingMessageProps {
  content: string;
  isUser: boolean;
  isLatest: boolean;
  onComplete?: () => void;
  onStreamingProgress?: () => void;
}

/**
 * A message bubble that displays text with a streaming/typewriter effect for AI messages.
 * User messages and older AI messages display immediately.
 */
export const StreamingMessage = memo(function StreamingMessage({ 
  content, 
  isUser, 
  isLatest,
  onComplete,
  onStreamingProgress
}: StreamingMessageProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(!isLatest || isUser);
  const intervalRef = useRef<number | null>(null);
  const prevContentRef = useRef(content);
  const indexRef = useRef(0);
  const { theme } = useWidgetTheme();
  const isChat = theme === 'chat';
  
  // Characters to add per frame - adjust for desired speed
  const charsPerFrame = 2;
  const frameDelay = 16; // ~60fps

  useEffect(() => {
    // User messages show immediately
    if (isUser) {
      setDisplayedText(content);
      setIsComplete(true);
      return;
    }

    // Non-latest messages show immediately
    if (!isLatest) {
      setDisplayedText(content);
      setIsComplete(true);
      return;
    }

    // If content changed, reset streaming
    if (content !== prevContentRef.current) {
      prevContentRef.current = content;
      setDisplayedText('');
      setIsComplete(false);
      indexRef.current = 0;
    }

    // Clear any existing interval
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Already complete
    if (indexRef.current >= content.length) {
      if (!isComplete) {
        setIsComplete(true);
        onComplete?.();
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      if (indexRef.current < content.length) {
        const nextIndex = Math.min(indexRef.current + charsPerFrame, content.length);
        indexRef.current = nextIndex;
        setDisplayedText(content.slice(0, nextIndex));
        // Trigger scroll on each text update
        onStreamingProgress?.();
      }
      
      if (indexRef.current >= content.length) {
        setIsComplete(true);
        onComplete?.();
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, frameDelay);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [content, isUser, isLatest, isComplete, onComplete]);

  // Strip asterisks from AI messages (model sometimes ignores the no-asterisk instruction)
  const stripAsterisks = (text: string) => text.replace(/\*+/g, '');
  const rawText = isUser || !isLatest || isComplete ? content : displayedText;
  const textToShow = isUser ? rawText : stripAsterisks(rawText);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "flex items-end gap-1.5 sm:gap-2",
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      
      <div
        className={cn(
          "max-w-[75%] sm:max-w-[70%] px-2.5 sm:px-4 py-1.5 sm:py-2.5 shadow-sm",
          isUser
            ? isChat
              ? 'bg-[#007AFF] text-white rounded-2xl rounded-br-sm'
              : 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
            : isChat
              ? 'bg-[#E9E9EB] dark:bg-[#3A3A3C] text-[#1C1C1E] dark:text-white rounded-2xl rounded-bl-sm'
              : 'bg-muted text-foreground rounded-2xl rounded-bl-sm'
        )}
      >
        <p className="text-[13px] sm:text-[15px] leading-snug sm:leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {textToShow}
          {/* Blinking cursor for streaming effect */}
          {!isUser && isLatest && !isComplete && (
            <span className="inline-block w-0.5 h-3 sm:h-4 ml-0.5 bg-current animate-pulse align-text-bottom" />
          )}
        </p>
      </div>
      
      {/* User Avatar - Smaller on mobile */}
      {isUser && (
        <div className={cn("w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm", isChat ? 'bg-gradient-to-br from-[#007AFF] to-[#0055CC]' : 'bg-primary')}>
          <User className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-primary-foreground" />
        </div>
      )}
    </motion.div>
  );
});
