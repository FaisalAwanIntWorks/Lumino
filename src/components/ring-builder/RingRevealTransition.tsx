import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Stars } from 'lucide-react';
import { useEffect, useState } from 'react';

interface RingRevealTransitionProps {
  isVisible: boolean;
  onComplete: () => void;
  isModern?: boolean;
}

/**
 * Dramatic reveal transition showing "Here's what I created for you..."
 * with typewriter effect and sparkle animations before revealing the ring.
 */
export const RingRevealTransition = ({ 
  isVisible, 
  onComplete, 
  isModern = false 
}: RingRevealTransitionProps) => {
  const [displayedText, setDisplayedText] = useState('');
  const [showSparkles, setShowSparkles] = useState(false);
  const [phase, setPhase] = useState<'glow' | 'typing' | 'sparkle' | 'fadeout'>('glow');
  
  const message = "Here's what I created for you...";
  
  // Color variants based on theme
  const primaryColor = 'text-primary';
  const glowColor = 'hsl(var(--primary) / 0.4)';
  const sparkleColor = 'text-primary';

  useEffect(() => {
    if (!isVisible) {
      setDisplayedText('');
      setShowSparkles(false);
      setPhase('glow');
      return;
    }

    // Phase 1: Glow expansion (0-0.5s)
    const glowTimer = setTimeout(() => {
      setPhase('typing');
    }, 500);

    return () => clearTimeout(glowTimer);
  }, [isVisible]);

  // Typewriter effect
  useEffect(() => {
    if (phase !== 'typing') return;

    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex <= message.length) {
        setDisplayedText(message.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setPhase('sparkle');
        setShowSparkles(true);
      }
    }, 50);

    return () => clearInterval(typeInterval);
  }, [phase]);

  // Sparkle phase then fadeout
  useEffect(() => {
    if (phase !== 'sparkle') return;

    const sparkleTimer = setTimeout(() => {
      setPhase('fadeout');
    }, 800);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 1200);

    return () => {
      clearTimeout(sparkleTimer);
      clearTimeout(completeTimer);
    };
  }, [phase, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'fadeout' ? 0 : 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.4 }}
          className="relative flex flex-col items-center justify-center gap-6 md:gap-8"
        >
          {/* Central glow orb */}
          <motion.div
            className="relative w-48 h-48 md:w-64 md:h-64 flex items-center justify-center"
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {/* Expanding glow backdrop */}
            <motion.div
              className="absolute inset-0 rounded-full blur-3xl"
              style={{ backgroundColor: glowColor }}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ 
                scale: [0.5, 1.5, 1.2],
                opacity: [0, 0.8, 0.6]
              }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />

            {/* Inner pulsing core */}
            <motion.div
              className={`absolute inset-8 rounded-full bg-primary/20 backdrop-blur-sm`}
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.5, 0.8, 0.5]
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Central sparkle icon */}
            <motion.div
              className="relative z-10"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ 
                scale: [0, 1.2, 1],
                rotate: [-180, 10, 0]
              }}
              transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <Sparkles className={`w-16 h-16 md:w-20 md:h-20 ${sparkleColor}`} />
            </motion.div>

            {/* Sparkle burst particles */}
            <AnimatePresence>
              {showSparkles && (
                <>
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute"
                      initial={{ 
                        scale: 0, 
                        x: 0, 
                        y: 0, 
                        opacity: 1 
                      }}
                      animate={{ 
                        scale: [0, 1, 0.5],
                        x: Math.cos((i * Math.PI * 2) / 8) * 100,
                        y: Math.sin((i * Math.PI * 2) / 8) * 100,
                        opacity: [1, 1, 0]
                      }}
                      transition={{ 
                        duration: 0.8,
                        delay: i * 0.05,
                        ease: 'easeOut'
                      }}
                    >
                      <Stars className={`w-4 h-4 md:w-5 md:h-5 ${sparkleColor}`} />
                    </motion.div>
                  ))}
                </>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Typewriter message */}
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <motion.p 
              className={`text-lg md:text-xl lg:text-2xl font-semibold tracking-wide font-jost ${primaryColor}`}
              style={{
                textShadow: '0 0 20px hsl(var(--primary) / 0.5)'
              }}
            >
              {displayedText}
              {phase === 'typing' && (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="ml-0.5"
                >
                  |
                </motion.span>
              )}
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
