import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Star, Diamond, Heart, PartyPopper, Check, ChevronRight, RotateCcw } from 'lucide-react';

interface RingAngleImages {
  angle0: string;
  angle1: string;
  angle2: string;
  angle3: string;
}

interface RingCompletionCelebrationProps {
  isVisible: boolean;
  onComplete?: () => void;
  ringImages?: RingAngleImages;
  ringImageUrl?: string; // Fallback single image
  ringName?: string;
}

// Particle component for sparkle effects
const Particle = ({ delay, x, y, size, color, type }: { 
  delay: number; 
  x: number; 
  y: number; 
  size: number; 
  color: string;
  type: 'sparkle' | 'star' | 'diamond' | 'heart';
}) => {
  const icons = {
    sparkle: Sparkles,
    star: Star,
    diamond: Diamond,
    heart: Heart
  };
  const Icon = icons[type];
  
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ opacity: 0, scale: 0, rotate: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0, 1.2, 1, 0.8],
        rotate: [0, 180, 360],
        y: [0, -30, -50]
      }}
      transition={{
        duration: 2,
        delay,
        ease: "easeOut"
      }}
    >
      <Icon 
        size={size} 
        className={color}
        fill="currentColor"
      />
    </motion.div>
  );
};

// Confetti piece component
const ConfettiPiece = ({ delay, startX }: { delay: number; startX: number }) => {
  const colors = [
    'bg-[#50c878]',
    'bg-[#FFD700]',
    'bg-[#FF69B4]',
    'bg-[#00CED1]',
    'bg-[#9370DB]',
    'bg-white'
  ];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const rotation = Math.random() * 720 - 360;
  const xDrift = (Math.random() - 0.5) * 100;
  
  return (
    <motion.div
      className={`absolute w-2 h-3 ${color} rounded-sm`}
      style={{ left: `${startX}%`, top: '-10%' }}
      initial={{ opacity: 0, y: 0, x: 0, rotate: 0 }}
      animate={{
        opacity: [0, 1, 1, 0.8, 0],
        y: ['0%', '120%'],
        x: [0, xDrift],
        rotate: [0, rotation]
      }}
      transition={{
        duration: 2.5,
        delay,
        ease: "easeIn"
      }}
    />
  );
};

// Glowing ring effect
const GlowRing = ({ delay }: { delay: number }) => (
  <motion.div
    className="absolute inset-0 rounded-full border-2 border-[#50c878]/50"
    initial={{ scale: 0.8, opacity: 0 }}
    animate={{
      scale: [0.8, 1.5, 2],
      opacity: [0, 0.8, 0]
    }}
    transition={{
      duration: 1.5,
      delay,
      repeat: 2,
      ease: "easeOut"
    }}
  />
);

// 3D Rotating Ring Cube Component - Shows all 4 angles (iPhone Pro Max Optimized)
const Ring3DShowcase = ({ images, fallbackUrl, isActive }: { 
  images?: RingAngleImages; 
  fallbackUrl?: string;
  isActive: boolean 
}) => {
  const [currentAngle, setCurrentAngle] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Get all image URLs - use provided images or fallback
  const imageUrls = useMemo(() => {
    if (images) {
      return [images.angle0, images.angle1, images.angle2, images.angle3];
    }
    // If no angle images, use fallback for all
    return fallbackUrl ? [fallbackUrl, fallbackUrl, fallbackUrl, fallbackUrl] : [];
  }, [images, fallbackUrl]);
  
  // Auto-rotate through angles
  useEffect(() => {
    if (!isActive || isHovered || imageUrls.length === 0) return;
    
    const interval = setInterval(() => {
      setCurrentAngle(prev => (prev + 1) % 4);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [isActive, isHovered, imageUrls.length]);

  if (imageUrls.length === 0) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className="relative w-[180px] h-[180px] xs:w-[200px] xs:h-[200px] sm:w-64 sm:h-64 md:w-80 md:h-80"
      style={{ perspective: '1200px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Outer glow effects */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,215,0,0.3) 0%, rgba(80,200,120,0.2) 40%, transparent 70%)',
        }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      
      {/* Sparkle rings - fewer on mobile for performance */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border border-[#FFD700]/30"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: [0.9 + i * 0.1, 1.2 + i * 0.1, 0.9 + i * 0.1],
            opacity: [0.3, 0.6, 0.3],
            rotate: [0, 360],
          }}
          transition={{
            duration: 4 + i,
            repeat: Infinity,
            ease: "linear",
            delay: i * 0.3,
          }}
        />
      ))}
      
      {/* Main 3D rotating cube container - iPhone Pro Max optimized */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="relative w-[160px] h-[160px] xs:w-[180px] xs:h-[180px] sm:w-56 sm:h-56 md:w-72 md:h-72"
          style={{
            transformStyle: 'preserve-3d',
          }}
          initial={{ scale: 0, rotateX: 180 }}
          animate={{ 
            scale: 1, 
            rotateX: 0,
            rotateY: currentAngle * 90,
          }}
          transition={{
            scale: { delay: 0.5, duration: 1, type: "spring", stiffness: 100 },
            rotateX: { delay: 0.5, duration: 1, type: "spring", stiffness: 100 },
            rotateY: { duration: 0.8, type: "spring", stiffness: 80, damping: 15 }
          }}
        >
          {/* 4 faces of the cube - each showing a different angle */}
          {imageUrls.map((url, index) => {
            const rotationY = index * 90;
            // Responsive translateZ - optimized for iPhone Pro Max (390-430px)
            const getTranslateZ = () => {
              if (typeof window === 'undefined') return 80;
              const width = window.innerWidth;
              if (width < 390) return 70; // Very small phones
              if (width < 430) return 80; // iPhone Pro Max range
              if (width < 640) return 90; // Larger phones
              return 130; // Tablets/Desktop
            };
            const translateZ = getTranslateZ();
            
            return (
              <motion.div
                key={index}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: `rotateY(${rotationY}deg) translateZ(${translateZ}px)`,
                  backfaceVisibility: 'hidden',
                }}
              >
                {/* Glass effect background */}
                <div className="absolute inset-1 xs:inset-2 sm:inset-4 rounded-lg sm:rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-white/5 backdrop-blur-sm" />
                
                {/* Ring image */}
                <motion.img
                  src={url}
                  alt={`Ring angle ${index + 1}`}
                  className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,215,0,0.4)] sm:drop-shadow-[0_0_40px_rgba(255,215,0,0.4)]"
                  style={{
                    filter: 'drop-shadow(0 0 15px rgba(255,215,0,0.3)) drop-shadow(0 0 30px rgba(80,200,120,0.2))',
                  }}
                />
                
                {/* Sparkle overlay */}
                <motion.div
                  className="absolute inset-0 pointer-events-none rounded-lg sm:rounded-2xl"
                  style={{
                    background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.3) 50%, transparent 60%)',
                  }}
                  animate={{
                    opacity: [0, 0.8, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: index * 0.5,
                    ease: "easeInOut",
                  }}
                />
              </motion.div>
            );
          })}
        </motion.div>
        
        {/* Ring shadow/reflection */}
        <motion.div
          className="absolute -bottom-1 xs:-bottom-2 sm:-bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-3 xs:h-4 sm:h-8 rounded-[100%] bg-black/40 blur-md"
          animate={{
            scaleX: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>
      
      {/* Floating sparkles around the ring - responsive */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        // Responsive radius for iPhone Pro Max
        const getRadius = () => {
          if (typeof window === 'undefined') return 80;
          const width = window.innerWidth;
          if (width < 390) return 70;
          if (width < 430) return 80;
          if (width < 640) return 90;
          return 120;
        };
        const getCenterOffset = () => {
          if (typeof window === 'undefined') return 90;
          const width = window.innerWidth;
          if (width < 390) return 80;
          if (width < 430) return 90;
          if (width < 640) return 100;
          return 128;
        };
        const radius = getRadius();
        const centerOffset = getCenterOffset();
        const x = Math.cos(angle) * radius + centerOffset;
        const y = Math.sin(angle) * radius + centerOffset;
        
        return (
          <motion.div
            key={i}
            className="absolute w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#FFD700]"
            style={{
              left: x,
              top: y,
              boxShadow: '0 0 6px #FFD700, 0 0 12px #FFD700',
            }}
            animate={{
              scale: [0.5, 1.5, 0.5],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        );
      })}
      
      {/* Angle indicators - responsive */}
      <motion.div
        className="absolute -bottom-5 xs:-bottom-6 sm:-bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 xs:gap-1.5 sm:gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2 }}
      >
        {[0, 1, 2, 3].map((index) => (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentAngle(index);
            }}
            className={`w-1.5 h-1.5 xs:w-2 xs:h-2 sm:w-2.5 sm:h-2.5 rounded-full transition-all duration-300 ${
              currentAngle === index 
                ? 'bg-[#FFD700] scale-125 shadow-[0_0_8px_#FFD700]' 
                : 'bg-white/30 hover:bg-white/50'
            }`}
            aria-label={`View angle ${index + 1}`}
          />
        ))}
      </motion.div>
      
      {/* 360° label - responsive */}
      <motion.div
        className="absolute -bottom-9 xs:-bottom-10 sm:-bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-1 text-white/50 text-[9px] xs:text-[10px] sm:text-xs whitespace-nowrap"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5 }}
      >
        <RotateCcw className="w-2 h-2 xs:w-2.5 xs:h-2.5 sm:w-3 sm:h-3 animate-spin" style={{ animationDuration: '3s' }} />
        <span>360° View • {currentAngle + 1}/4</span>
      </motion.div>
    </div>
  );
};

// Diamond fallback showcase when no image - iPhone Pro Max responsive
const DiamondShowcase = () => (
  <motion.div
    className="relative w-28 h-28 xs:w-32 xs:h-32 sm:w-44 sm:h-44 rounded-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f0f23] border-2 border-[#50c878]/60 shadow-[0_0_30px_rgba(80,200,120,0.4),inset_0_0_12px_rgba(80,200,120,0.1)] sm:shadow-[0_0_80px_rgba(80,200,120,0.4),inset_0_0_30px_rgba(80,200,120,0.1)] flex items-center justify-center overflow-hidden"
    animate={{
      boxShadow: [
        '0 0 30px rgba(80, 200, 120, 0.3), inset 0 0 15px rgba(80, 200, 120, 0.1)',
        '0 0 60px rgba(80, 200, 120, 0.5), inset 0 0 30px rgba(255, 215, 0, 0.15)',
        '0 0 80px rgba(255, 215, 0, 0.4), inset 0 0 40px rgba(80, 200, 120, 0.2)',
        '0 0 60px rgba(80, 200, 120, 0.5), inset 0 0 30px rgba(255, 215, 0, 0.15)',
        '0 0 30px rgba(80, 200, 120, 0.3), inset 0 0 15px rgba(80, 200, 120, 0.1)'
      ]
    }}
    transition={{
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut"
    }}
  >
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 100 }}
    >
      <Diamond className="w-14 h-14 xs:w-16 xs:h-16 sm:w-24 sm:h-24 text-[#50c878] drop-shadow-[0_0_15px_rgba(80,200,120,0.6)] sm:drop-shadow-[0_0_30px_rgba(80,200,120,0.6)]" />
    </motion.div>
    
    {/* Inner sparkle effect */}
    <motion.div
      className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent"
      animate={{ rotate: 360 }}
      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
    />
  </motion.div>
);

export const RingCompletionCelebration = ({ 
  isVisible, 
  onComplete,
  ringImages,
  ringImageUrl,
  ringName = "Your Dream Ring"
}: RingCompletionCelebrationProps) => {
  const [showContent, setShowContent] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'confetti' | 'showcase' | 'complete'>('confetti');
  
  useEffect(() => {
    if (isVisible) {
      setShowContent(true);
      setAnimationPhase('confetti');
      
      // Phase 2: Ring showcase after confetti
      const showcaseTimer = setTimeout(() => {
        setAnimationPhase('showcase');
      }, 1500);
      
      // Phase 3: Complete and allow dismiss
      const completeTimer = setTimeout(() => {
        setAnimationPhase('complete');
      }, 3500);
      
      return () => {
        clearTimeout(showcaseTimer);
        clearTimeout(completeTimer);
      };
    } else {
      setShowContent(false);
      setAnimationPhase('confetti');
    }
  }, [isVisible]);

  // Generate particles - memoized to prevent regeneration
  const particles = useMemo(() => Array.from({ length: 25 }, (_, i) => ({
    id: i,
    x: 15 + Math.random() * 70,
    y: 15 + Math.random() * 70,
    size: 14 + Math.random() * 18,
    delay: Math.random() * 0.8,
    color: ['text-[#50c878]', 'text-[#FFD700]', 'text-white', 'text-[#00CED1]', 'text-[#FF69B4]'][Math.floor(Math.random() * 5)],
    type: ['sparkle', 'star', 'diamond', 'heart'][Math.floor(Math.random() * 4)] as 'sparkle' | 'star' | 'diamond' | 'heart'
  })), []);

  // Generate confetti - memoized
  const confetti = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    id: i,
    startX: Math.random() * 100,
    delay: Math.random() * 0.6
  })), []);

  // Handle dismiss
  const handleDismiss = () => {
    if (animationPhase === 'complete') {
      onComplete?.();
    }
  };

  return (
    <AnimatePresence>
      {showContent && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-xl p-2 xs:p-3 sm:p-6 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          onClick={handleDismiss}
        >
          {/* Confetti rain - continuous */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {confetti.map((c) => (
              <ConfettiPiece key={c.id} delay={c.delay} startX={c.startX} />
            ))}
          </div>

          {/* Main celebration content - iPhone Pro Max optimized scrollable container */}
          <motion.div
             className="relative flex flex-col items-center px-2 xs:px-3 sm:px-6 py-4 xs:py-6 sm:py-0 max-w-full max-h-[85vh] overflow-y-auto scrollbar-hide"
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ 
              type: "spring", 
              stiffness: 180, 
              damping: 15,
              delay: 0.2 
            }}
          >
            {/* Glow rings expanding outward - responsive sizes */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-48 h-48 xs:w-56 xs:h-56 sm:w-72 sm:h-72 md:w-96 md:h-96">
                <GlowRing delay={0.2} />
                <GlowRing delay={0.5} />
                <GlowRing delay={0.8} />
                <GlowRing delay={1.1} />
              </div>
            </div>

            {/* Particles burst - responsive container */}
            <div className="absolute inset-0 w-52 h-52 xs:w-64 xs:h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 -translate-x-1 xs:-translate-x-2 sm:-translate-x-4 -translate-y-1 xs:-translate-y-2 sm:-translate-y-4 pointer-events-none">
              {particles.map((p) => (
                <Particle key={p.id} {...p} />
              ))}
            </div>

            {/* Animated ring showcase container */}
            <motion.div
              className="relative mt-2 xs:mt-4"
              initial={{ y: 50 }}
              animate={{ y: 0 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 100 }}
            >
              {(ringImages || ringImageUrl) ? (
                <Ring3DShowcase 
                  images={ringImages}
                  fallbackUrl={ringImageUrl}
                  isActive={animationPhase === 'showcase' || animationPhase === 'complete'} 
                />
              ) : (
                <DiamondShowcase />
              )}
              
              {/* Success checkmark badge - responsive sizing */}
              <motion.div
                className="absolute -bottom-1 xs:-bottom-2 sm:-bottom-4 right-0 xs:right-2 sm:right-4 md:right-8 w-8 h-8 xs:w-10 xs:h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#50c878] to-[#0b6e4f] border-2 xs:border-3 sm:border-4 border-black/50 flex items-center justify-center shadow-lg z-10"
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 1.2, type: "spring", stiffness: 200 }}
              >
                <Check className="w-4 h-4 xs:w-5 xs:h-5 sm:w-7 sm:h-7 text-white" strokeWidth={3} />
              </motion.div>
            </motion.div>

            {/* Celebration text with enhanced styling - iPhone Pro Max responsive */}
            <motion.div
              className="mt-12 xs:mt-14 sm:mt-16 md:mt-10 text-center px-2"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              {/* Party poppers header - responsive */}
              <motion.div
                className="flex items-center justify-center gap-1.5 xs:gap-2 sm:gap-3 mb-1.5 xs:mb-2 sm:mb-3"
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.5 }}
              >
                <motion.div
                  animate={{ rotate: [-10, 10, -10] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <PartyPopper className="w-5 h-5 xs:w-6 xs:h-6 sm:w-8 sm:h-8 text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]" />
                </motion.div>
                <span className="text-xl xs:text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-[#FFD700] to-white bg-clip-text text-transparent drop-shadow-lg">
                  Congratulations!
                </span>
                <motion.div
                  animate={{ rotate: [10, -10, 10] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <PartyPopper className="w-5 h-5 xs:w-6 xs:h-6 sm:w-8 sm:h-8 text-[#FFD700] scale-x-[-1] drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]" />
                </motion.div>
              </motion.div>
              
              {/* Ring name with shimmer - responsive */}
              <motion.div
                className="relative overflow-hidden mb-1.5 xs:mb-2 sm:mb-3 px-1"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.9 }}
              >
                <h2 className="text-sm xs:text-base sm:text-xl md:text-2xl font-semibold text-[#50c878] leading-tight">
                  {ringName}
                </h2>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  initial={{ x: '-100%' }}
                  animate={{ x: '200%' }}
                  transition={{ duration: 1.5, delay: 1.2, repeat: Infinity, repeatDelay: 3 }}
                />
              </motion.div>
              
              <motion.p 
                className="text-white/80 text-xs xs:text-sm sm:text-base md:text-lg font-medium"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 }}
              >
                Your dream ring is complete! ✨
              </motion.p>
              
              <motion.p 
                className="text-white/60 text-[10px] xs:text-xs sm:text-sm md:text-base mt-1 max-w-[260px] xs:max-w-[280px] sm:max-w-[320px] mx-auto leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.3 }}
              >
                You've designed something truly special and unique.
              </motion.p>
            </motion.div>

            {/* Continue button - responsive */}
            <motion.button
              className="mt-4 xs:mt-5 sm:mt-8 px-5 xs:px-6 sm:px-8 py-2.5 xs:py-3 sm:py-4 bg-gradient-to-r from-[#50c878] to-[#0b6e4f] rounded-full text-white font-semibold text-xs xs:text-sm sm:text-base flex items-center gap-1.5 xs:gap-2 shadow-[0_0_20px_rgba(80,200,120,0.4)] xs:shadow-[0_0_30px_rgba(80,200,120,0.4)] hover:shadow-[0_0_50px_rgba(80,200,120,0.6)] transition-shadow"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: animationPhase === 'complete' ? 1 : 0.5, y: 0 }}
              transition={{ delay: 1.5 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
            >
              Continue to Your Ring
              <ChevronRight className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-5 sm:h-5" />
            </motion.button>

            {/* Dismiss hint */}
            <motion.p
              className="mt-2 xs:mt-3 sm:mt-4 text-white/30 text-[9px] xs:text-[10px] sm:text-xs"
              initial={{ opacity: 0 }}
              animate={{ opacity: animationPhase === 'complete' ? 0.6 : 0 }}
              transition={{ delay: 2 }}
            >
              or tap anywhere to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
