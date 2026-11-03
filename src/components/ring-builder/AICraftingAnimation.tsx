import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Diamond, CircleDot, Gem, Zap, Stars, Wand2 } from 'lucide-react';
import { RingConfiguration } from '@/types/ring-builder';
import { useMemo } from 'react';

interface SelectionLabels {
  style?: string;
  shank?: string;
  metal?: string;
  shape?: string;
}

interface AICraftingAnimationProps {
  configuration: RingConfiguration;
  isModern?: boolean;
  selectionLabels?: SelectionLabels;
}

/**
 * Shows the current crafting progress based on selections made.
 * Each step adds to the visual complexity of the animation with labeled orbiting particles.
 */
export const AICraftingAnimation = ({ 
  configuration, 
  isModern = false,
  selectionLabels 
}: AICraftingAnimationProps) => {
  // Determine how many selections have been made (1-4)
  const selectionCount = useMemo(() => {
    let count = 0;
    if (configuration.style) count++;
    if (configuration.shank) count++;
    if (configuration.metal) count++;
    if (configuration.shape) count++;
    return count;
  }, [configuration.style, configuration.shank, configuration.metal, configuration.shape]);

  // Selection labels for display
  const currentStep = useMemo(() => {
    if (!configuration.style) return 'Awaiting style...';
    if (!configuration.shank) return 'Selecting band...';
    if (!configuration.metal) return 'Choosing metal...';
    if (!configuration.shape) return 'Picking shape...';
    return 'Crafting complete!';
  }, [configuration.style, configuration.shank, configuration.metal, configuration.shape]);

  // Get the active selections with their labels
  const activeSelections = useMemo(() => {
    const selections: { key: string; label: string; icon: 'diamond' | 'circle' | 'gem' | 'stars' }[] = [];
    
    if (configuration.style && selectionLabels?.style) {
      selections.push({ key: 'style', label: selectionLabels.style, icon: 'diamond' });
    }
    if (configuration.shank && selectionLabels?.shank) {
      selections.push({ key: 'shank', label: selectionLabels.shank, icon: 'circle' });
    }
    if (configuration.metal && selectionLabels?.metal) {
      selections.push({ key: 'metal', label: selectionLabels.metal, icon: 'gem' });
    }
    if (configuration.shape && selectionLabels?.shape) {
      selections.push({ key: 'shape', label: selectionLabels.shape, icon: 'stars' });
    }
    
    return selections;
  }, [configuration, selectionLabels]);

  // Color variants based on theme
  const primaryColor = isModern ? 'text-primary' : 'text-[#50c878]';
  const primaryBorder = isModern ? 'border-primary' : 'border-[#50c878]';
  const primaryBg = isModern ? 'bg-primary/20' : 'bg-[#50c878]/20';
  const glowColor = isModern ? 'rgba(59, 130, 246, 0.3)' : 'rgba(80, 200, 120, 0.3)';

  // Orbital configurations for each selection
  const orbitalConfigs = [
    { duration: 8, radius: 85, startAngle: 0 },
    { duration: 10, radius: 85, startAngle: 90 },
    { duration: 9, radius: 85, startAngle: 180 },
    { duration: 7, radius: 85, startAngle: 270 },
  ];

  const getIcon = (iconType: string, className: string) => {
    switch (iconType) {
      case 'diamond': return <Diamond className={className} />;
      case 'circle': return <CircleDot className={className} />;
      case 'gem': return <Gem className={className} />;
      case 'stars': return <Stars className={className} />;
      default: return <Diamond className={className} />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.8, filter: 'blur(20px)' }}
      transition={{ duration: 0.5 }}
      className="relative flex flex-col items-center justify-center gap-6 md:gap-8"
    >
      {/* Crafting orb container */}
      <div className="relative w-48 h-48 md:w-64 md:h-64 flex items-center justify-center">
        {/* Outer rotating ring */}
        <motion.div
          className={`absolute inset-0 rounded-full border-2 ${primaryBorder}/30`}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />

        {/* Secondary rotating ring (opposite direction) */}
        <motion.div
          className={`absolute inset-2 rounded-full border ${primaryBorder}/20`}
          animate={{ rotate: -360 }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        />

        {/* Pulsing glow backdrop */}
        <motion.div
          className={`absolute inset-6 rounded-full ${primaryBg} blur-xl`}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Inner crafting core */}
        <motion.div
          className={`absolute inset-8 rounded-full ${primaryBg} backdrop-blur-sm`}
          animate={{
            scale: [1, 1.05, 1],
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Orbiting particles with labels */}
        <AnimatePresence>
          {activeSelections.map((selection, index) => {
            const config = orbitalConfigs[index];
            const isLatest = index === activeSelections.length - 1;
            
            return (
              <motion.div
                key={selection.key}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ 
                  type: 'spring',
                  stiffness: 260,
                  damping: 20,
                  delay: index * 0.1 
                }}
                className="absolute inset-0"
              >
                <motion.div
                  className="absolute inset-0"
                  animate={{ rotate: 360 }}
                  transition={{ 
                    duration: config.duration, 
                    repeat: Infinity, 
                    ease: 'linear' 
                  }}
                  style={{ transformOrigin: 'center center' }}
                >
                  {/* Orbiting label badge */}
                  <motion.div
                    className={`absolute flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 rounded-full 
                      bg-background/80 backdrop-blur-md border ${primaryBorder}/30
                      ${isLatest ? 'ring-2 ring-offset-1' : ''}`}
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) translateY(-${config.radius}px)`,
                      ...(isLatest && { 
                        boxShadow: isModern 
                          ? '0 0 15px rgba(59, 130, 246, 0.4)' 
                          : '0 0 15px rgba(80, 200, 120, 0.4)',
                        ringColor: isModern ? 'rgb(59, 130, 246)' : 'rgb(80, 200, 120)'
                      })
                    }}
                    animate={isLatest ? { 
                      scale: [1, 1.05, 1],
                    } : {}}
                    transition={isLatest ? { 
                      duration: 1.5, 
                      repeat: Infinity, 
                      ease: 'easeInOut' 
                    } : {}}
                  >
                    {/* Counter-rotate to keep text readable */}
                    <motion.div
                      className="flex items-center gap-1"
                      animate={{ rotate: -360 }}
                      transition={{ 
                        duration: config.duration, 
                        repeat: Infinity, 
                        ease: 'linear' 
                      }}
                    >
                      {getIcon(selection.icon, `w-2.5 h-2.5 md:w-3 md:h-3 ${primaryColor}`)}
                      <span className={`text-[10px] md:text-xs font-medium ${primaryColor} whitespace-nowrap`}>
                        {selection.label}
                      </span>
                    </motion.div>
                  </motion.div>
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Fallback particles when no labels are provided */}
        {selectionCount > 0 && activeSelections.length === 0 && (
          <AnimatePresence>
            {selectionCount >= 1 && (
              <motion.div
                key="particle-1"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                className="absolute"
                style={{ width: '100%', height: '100%' }}
              >
                <motion.div
                  className={`absolute w-3 h-3 md:w-4 md:h-4 rounded-full ${primaryBg} flex items-center justify-center`}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                  style={{ transformOrigin: 'center center' }}
                >
                  <motion.div
                    className="absolute"
                    style={{ top: '-70px', left: '50%', marginLeft: '-6px' }}
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <Diamond className={`w-3 h-3 md:w-4 md:h-4 ${primaryColor}`} />
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {selectionCount >= 2 && (
              <motion.div
                key="particle-2"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                className="absolute"
                style={{ width: '100%', height: '100%' }}
              >
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                  style={{ width: '100%', height: '100%' }}
                >
                  <motion.div
                    className="absolute"
                    style={{ bottom: '-60px', left: '50%', marginLeft: '-6px' }}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 }}
                  >
                    <CircleDot className={`w-3 h-3 md:w-4 md:h-4 ${primaryColor}`} />
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {selectionCount >= 3 && (
              <motion.div
                key="particle-3"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                className="absolute"
                style={{ width: '100%', height: '100%' }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                  style={{ width: '100%', height: '100%' }}
                >
                  <motion.div
                    className="absolute"
                    style={{ left: '-50px', top: '50%', marginTop: '-6px' }}
                    animate={{ scale: [1, 1.4, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: 0.6 }}
                  >
                    <Gem className={`w-3 h-3 md:w-4 md:h-4 ${primaryColor}`} />
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {selectionCount >= 4 && (
              <motion.div
                key="particle-4"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                className="absolute"
                style={{ width: '100%', height: '100%' }}
              >
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
                  style={{ width: '100%', height: '100%' }}
                >
                  <motion.div
                    className="absolute"
                    style={{ right: '-50px', top: '50%', marginTop: '-6px' }}
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: 0.9 }}
                  >
                    <Stars className={`w-3 h-3 md:w-4 md:h-4 ${primaryColor}`} />
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Center sparkle icon */}
        <motion.div
          className="relative z-10"
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Sparkles className={`w-12 h-12 md:w-16 md:h-16 ${primaryColor}`} />
        </motion.div>

        {/* Floating sparkle particles */}
        <motion.div
          className="absolute"
          animate={{
            y: [-20, 20, -20],
            x: [-10, 10, -10],
            opacity: [0.3, 0.8, 0.3],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{ top: '20%', right: '25%' }}
        >
          <Zap className={`w-3 h-3 ${primaryColor}/60`} />
        </motion.div>

        <motion.div
          className="absolute"
          animate={{
            y: [20, -20, 20],
            x: [10, -10, 10],
            opacity: [0.4, 0.9, 0.4],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          style={{ bottom: '25%', left: '20%' }}
        >
          <Wand2 className={`w-2 h-2 md:w-3 md:h-3 ${primaryColor}/50`} />
        </motion.div>

        {/* Energy arcs when selections are made */}
        <AnimatePresence>
          {selectionCount > 0 && (
            <motion.div
              key="energy-arc"
              initial={{ opacity: 0, pathLength: 0 }}
              animate={{ opacity: [0.3, 0.7, 0.3], pathLength: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <motion.circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={glowColor}
                  strokeWidth="0.5"
                  strokeDasharray={`${selectionCount * 25} ${100 - selectionCount * 25}`}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                  style={{ transformOrigin: '50% 50%' }}
                />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status text */}
      <motion.div
        className="text-center space-y-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <motion.p 
          className={`text-base md:text-lg font-medium ${primaryColor}`}
          key={currentStep}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {selectionCount === 0 ? 'Your ring awaits...' : `AI is crafting...`}
        </motion.p>
        <p className="text-xs md:text-sm text-muted-foreground/60">
          {selectionCount === 0 
            ? 'Start chatting to design your dream ring' 
            : currentStep}
        </p>
        
        {/* Progress indicator */}
        {selectionCount > 0 && (
          <motion.div 
            className="flex items-center justify-center gap-1.5 mt-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {[1, 2, 3, 4].map((step) => (
              <motion.div
                key={step}
                className={`w-2 h-2 rounded-full ${
                  step <= selectionCount 
                    ? (isModern ? 'bg-primary' : 'bg-[#50c878]')
                    : 'bg-muted-foreground/20'
                }`}
                initial={{ scale: 0 }}
                animate={{ 
                  scale: step <= selectionCount ? [1, 1.3, 1] : 1,
                }}
                transition={{ 
                  duration: 0.5,
                  delay: step * 0.1,
                  repeat: step === selectionCount ? Infinity : 0,
                  repeatDelay: 1,
                }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};
