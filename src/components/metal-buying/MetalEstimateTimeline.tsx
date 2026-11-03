import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AIGenerationTimeline } from '@/components/form-wizard/AIGenerationTimeline';
import { getMetalEstimatePhases } from './metal-estimate-phases';

interface MetalEstimateTimelineProps {
  metal: string;
  karat?: string;
  accentColor: string;
  fontColor: string;
  backgroundColor: string;
  onComplete: () => void;
}

export function MetalEstimateTimeline({
  metal,
  karat,
  accentColor,
  fontColor,
  backgroundColor,
  onComplete,
}: MetalEstimateTimelineProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [progressValue, setProgressValue] = useState(0);
  const phases = getMetalEstimatePhases(metal, karat);
  const totalDuration = 4000; // 4 seconds
  const phaseCount = phases.length;

  useEffect(() => {
    const phaseTime = totalDuration / phaseCount;
    const interval = setInterval(() => {
      setStageIndex((prev) => {
        if (prev >= phaseCount - 1) {
          clearInterval(interval);
          setTimeout(onComplete, 800);
          return prev;
        }
        return prev + 1;
      });
    }, phaseTime);

    return () => clearInterval(interval);
  }, [phaseCount, onComplete]);

  useEffect(() => {
    const tick = setInterval(() => {
      setProgressValue((prev) => {
        const target = ((stageIndex + 1) / phaseCount) * 100;
        const next = prev + 1.5;
        return Math.min(next, target, 100);
      });
    }, 50);
    return () => clearInterval(tick);
  }, [stageIndex, phaseCount]);

  return (
    <AnimatePresence mode="wait">
      <AIGenerationTimeline
        key="metal-iq-calculating-estimate"
        phases={phases}
        accentColor={accentColor}
        fontColor={fontColor}
        backgroundColor={backgroundColor}
        generating={true}
        stageIndex={stageIndex}
        progressValue={progressValue}
        headerLabel="Calculating Estimates"
      />
    </AnimatePresence>
  );
}
