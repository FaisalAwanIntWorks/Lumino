import { useState, useCallback, useMemo } from 'react';
import { RingConfiguration, RingStyle, RingShank, RingMetal, RingShape, CaratRange, Stone, StyleOption, ShankOption, MetalOption } from '@/types/ring-builder';
import { MOCK_METALS, MOCK_CARAT_RANGES } from '@/data/ring-builder-mock';

const initialConfig: RingConfiguration = {
  style: 'solitaire',
  shank: 'high-polish',
  metal: '14K Rose Gold',
  shape: 'round',
  caratRange: null,
  stone: null,
  engraving: {
    enabled: false,
    text: '',
    bandWidth: '3mm',
    otherRequest: '',
  },
  size: '7',
};

interface CaratOption {
  carat_value: number;
  price_adjustment: number | null;
}

interface CatalogOptions {
  styles?: StyleOption[];
  shanks?: ShankOption[];
  metals?: MetalOption[];
  caratOptions?: CaratOption[];
}

export const useRingConfiguration = (catalogOptions?: CatalogOptions) => {
  const [configuration, setConfiguration] = useState<RingConfiguration>(initialConfig);
  const [currentStep, setCurrentStep] = useState(0);

  const updateStyle = useCallback((style: RingStyle) => {
    setConfiguration(prev => ({ ...prev, style }));
  }, []);

  const updateShank = useCallback((shank: RingShank) => {
    setConfiguration(prev => ({ ...prev, shank }));
  }, []);

  const updateMetal = useCallback((metal: RingMetal) => {
    setConfiguration(prev => ({ ...prev, metal }));
  }, []);

  const updateShape = useCallback((shape: RingShape) => {
    setConfiguration(prev => ({ ...prev, shape, caratRange: null, stone: null }));
  }, []);

  const updateCaratRange = useCallback((caratRange: CaratRange) => {
    setConfiguration(prev => ({ ...prev, caratRange, stone: null }));
  }, []);

  const updateStone = useCallback((stone: Stone) => {
    setConfiguration(prev => ({ ...prev, stone }));
  }, []);

  const updateEngraving = useCallback((data: {
    enabled: boolean;
    text: string;
    bandWidth: string;
    otherRequest: string;
  }) => {
    setConfiguration(prev => ({ 
      ...prev, 
      engraving: {
        enabled: data.enabled,
        text: data.text.slice(0, 20),
        bandWidth: data.bandWidth,
        otherRequest: data.otherRequest.slice(0, 500),
      }
    }));
  }, []);

  const updateSize = useCallback((size: string) => {
    setConfiguration(prev => ({ ...prev, size }));
  }, []);

  // Memoize options to use client options or fallback to mock
  const metalsToUse = useMemo(() => catalogOptions?.metals || MOCK_METALS, [catalogOptions?.metals]);
  const stylesToUse = useMemo(() => catalogOptions?.styles || [], [catalogOptions?.styles]);
  const shanksToUse = useMemo(() => catalogOptions?.shanks || [], [catalogOptions?.shanks]);
  const caratOptionsToUse = useMemo(() => catalogOptions?.caratOptions || [], [catalogOptions?.caratOptions]);

  const calculatePrice = useCallback((): number => {
    let price = 0; // Start from 0, sum up component prices

    // Normalize a string for fuzzy comparison (lower-case, strip separators)
    const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');

    // Add style price — match by exact ID, normalised ID, or display name
    if (configuration.style) {
      const val = configuration.style;
      const valNorm = norm(val);
      const style = stylesToUse.find(s =>
        s.id === val ||
        norm(s.id) === valNorm ||
        norm(s.name) === valNorm
      );
      if (style && style.price !== undefined) {
        price += style.price;
      }
    }

    // Add shank price — same fuzzy matching
    if (configuration.shank) {
      const val = configuration.shank;
      const valNorm = norm(val);
      const shank = shanksToUse.find(s =>
        s.id === val ||
        norm(s.id) === valNorm ||
        norm(s.name) === valNorm
      );
      if (shank && shank.price !== undefined) {
        price += shank.price;
      }
    }

    // Add metal price — metal may be stored as display name or UUID; match both
    if (configuration.metal) {
      const val = configuration.metal;
      const valNorm = norm(val);
      const metal = metalsToUse.find(m =>
        m.id === val ||
        norm(m.id) === valNorm ||
        norm(m.name) === valNorm
      );
      if (metal) price += metal.price;
    }

    // Carat selection does NOT add price — it only filters diamond options.
    // The diamond/stone price includes the full cost for that carat+color+clarity.

    // Add stone price
    if (configuration.stone) {
      price += configuration.stone.price;
    }

    return price;
  }, [configuration, metalsToUse, stylesToUse, shanksToUse, caratOptionsToUse]);

  const canAdvanceStep = useCallback((step: number): boolean => {
    switch (step) {
      case 0: return configuration.style !== null;
      case 1: return configuration.shank !== null;
      case 2: return configuration.metal !== null;
      case 3: return configuration.shape !== null;
      case 4: return configuration.caratRange !== null;
      case 5: return configuration.stone !== null;
      case 6: return true; // Engraving is optional
      case 7: return configuration.size !== '';
      case 8: return true; // Estimate summary - always passable
      default: return false;
    }
  }, [configuration]);

  const goToNextStep = useCallback(() => {
    if (currentStep < 8 && canAdvanceStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, canAdvanceStep]);

  const goToPreviousStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step <= 8) {
      setCurrentStep(step);
    }
  }, []);

  const resetConfiguration = useCallback(() => {
    setConfiguration(initialConfig);
    setCurrentStep(0);
  }, []);

  // Reset to default base state (solitaire/high-polish/rose-gold/round) for chat resets
  const clearConfiguration = useCallback(() => {
    setConfiguration(initialConfig);
    setCurrentStep(0);
  }, []);

  return {
    configuration,
    currentStep,
    updateStyle,
    updateShank,
    updateMetal,
    updateShape,
    updateCaratRange,
    updateStone,
    updateEngraving,
    updateSize,
    calculatePrice,
    canAdvanceStep,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    resetConfiguration,
    clearConfiguration,
  };
};
