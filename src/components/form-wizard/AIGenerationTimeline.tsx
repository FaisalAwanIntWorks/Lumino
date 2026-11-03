import { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Phase } from './ai-generation-phases';

interface AIGenerationTimelineProps {
  phases: Phase[];
  accentColor: string;
  fontColor: string;
  backgroundColor: string;
  generating: boolean;
  stageIndex: number;
  progressValue: number;
  headerLabel?: string;
}

// Typewriter hook — uses requestAnimationFrame instead of setInterval so the
// browser can throttle when the tab is hidden and we don't pay the constant
// 30ms wakeup cost on mobile (C5).
function useTypewriter(text: string, speed = 30) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    if (!text) { setDone(true); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const i = Math.min(text.length, Math.floor((now - start) / speed));
      setDisplayed(text.slice(0, i));
      if (i < text.length) {
        raf = requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, speed]);

  return { displayed, done };
}

// Single sub-statement with typewriter
function TypewriterLine({ text, fontColor }: { text: string; fontColor: string }) {
  const { displayed, done } = useTypewriter(text, 28);
  return (
    <span style={{ fontFamily: '"Inter", sans-serif', color: `${fontColor}aa` }}>
      {displayed}
      {!done && (
        <span
          className="inline-block w-[2px] h-[14px] ml-0.5 align-middle"
          style={{
            backgroundColor: fontColor,
            animation: 'blink-cursor 0.7s step-end infinite',
          }}
        />
      )}
    </span>
  );
}

export function AIGenerationTimeline({
  phases,
  accentColor,
  fontColor,
  backgroundColor,
  generating,
  stageIndex,
  progressValue,
  headerLabel,
}: AIGenerationTimelineProps) {
  // Track which sub-statement within the active phase
  const [subIndex, setSubIndex] = useState(0);
  const subTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset sub-index when stage changes
  useEffect(() => {
    setSubIndex(0);
  }, [stageIndex]);

  // Cycle sub-statements within active phase
  useEffect(() => {
    if (!generating) return;
    const statementsCount = phases[stageIndex]?.statements.length ?? 0;
    if (statementsCount <= 1) return;

    const statementText = phases[stageIndex]?.statements[subIndex] ?? '';
    // Time per statement: typing time + hold time
    const typingTime = statementText.length * 28 + 800;

    subTimerRef.current = setTimeout(() => {
      setSubIndex((prev) => (prev + 1) % statementsCount);
    }, typingTime);

    return () => clearTimeout(subTimerRef.current);
  }, [stageIndex, subIndex, generating, phases]);

  if (!generating) return null;

  const currentStatement = phases[stageIndex]?.statements[subIndex] ?? '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative w-full rounded-xl p-5 md:p-6 overflow-hidden"
      style={{
        backgroundColor: `${fontColor}06`,
        border: `1px solid ${fontColor}10`,
      }}
    >
      

      {/* Header: spinner + title */}
      <div className="relative z-10 flex items-center gap-3 mb-4">
        <svg
          className="w-5 h-5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: accentColor, animation: 'spin-loader 1s linear infinite' }}
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="44 18"
            strokeLinecap="round"
          />
        </svg>
        <span
          className="text-lg font-medium tracking-wide"
          style={{ fontFamily: '"Inter", sans-serif', color: fontColor }}
        >
          {headerLabel ?? 'Creating Your Preview'}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="relative z-10 h-1 rounded-full mb-6 overflow-hidden"
        style={{ backgroundColor: `${fontColor}12` }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: accentColor }}
          animate={{ width: `${progressValue}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {/* Vertical timeline */}
      <div className="relative z-10 ml-3 pl-6 space-y-0">
        {phases.map((phase, index) => {
          const isCompleted = index < stageIndex;
          const isActive = index === stageIndex;
          const isFuture = index > stageIndex;
          const isLast = index === phases.length - 1;

          return (
            <div key={index} className="relative">
              {/* Connecting line */}
              {!isLast && (
                <div
                  className="absolute left-[-24px] top-[18px] w-[2px]"
                  style={{
                    height: 'calc(100% - 16px)',
                    backgroundColor: isCompleted
                      ? accentColor
                      : isActive
                        ? `${accentColor}40`
                        : `${fontColor}12`,
                  }}
                />
              )}

              {/* Node */}
              <div
                className="absolute left-[-32px] top-[2px] w-4 h-4 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: isCompleted
                    ? accentColor
                    : isActive
                      ? backgroundColor
                      : `${fontColor}10`,
                  border: isActive
                    ? `2px solid ${accentColor}`
                    : isCompleted
                      ? 'none'
                      : `1px solid ${fontColor}20`,
                  boxShadow: isActive ? `0 0 12px ${accentColor}50` : 'none',
                }}
              >
                {isCompleted && <Check className="w-2.5 h-2.5 text-white" />}
                {isActive && (
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: accentColor,
                      animation: 'pulse-dot 1.5s ease-in-out infinite',
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div className={`pb-5 ${isLast ? 'pb-0' : ''}`}>
                <p
                  className="text-sm font-medium leading-tight"
                  style={{
                    fontFamily: '"Inter", sans-serif',
                    color: isCompleted
                      ? `${fontColor}50`
                      : isActive
                        ? fontColor
                        : `${fontColor}35`,
                    textDecoration: isCompleted ? 'line-through' : 'none',
                  }}
                >
                  {phase.title}
                </p>

                {/* Active phase: typewriter sub-statement */}
                {isActive && (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${stageIndex}-${subIndex}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.25 }}
                      className="mt-1.5 text-xs leading-relaxed"
                    >
                      <TypewriterLine text={currentStatement} fontColor={fontColor} />
                    </motion.div>
                  </AnimatePresence>
                )}

                {/* Completed phase: show last statement muted */}
                {isCompleted && (
                  <p
                    className="mt-1 text-[11px] leading-relaxed"
                    style={{
                      fontFamily: '"Inter", sans-serif',
                      color: `${fontColor}30`,
                    }}
                  >
                    {phase.statements[phase.statements.length - 1]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Global styles for animations */}
      <style>{`
        @keyframes spin-loader {
          to { transform: rotate(360deg); }
        }
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>
    </motion.div>
  );
}
