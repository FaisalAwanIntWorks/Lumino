import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Options data
const STYLE_OPTIONS = [
  { id: 'solitaire', name: 'Solitaire', description: 'Classic single stone elegance' },
  { id: 'three-stone', name: 'Three Stone', description: 'Past, present, future symbolism' },
  { id: 'halo', name: 'Halo', description: 'Surrounded by smaller diamonds' },
  { id: 'pave-rail', name: 'Pavé Rail', description: 'Diamond-studded band' },
];

const SHANK_OPTIONS = [
  { id: 'high-polish', name: 'High Polish', description: 'Smooth, mirror-like finish' },
  { id: 'castel-pave', name: 'Castel Pavé', description: 'Delicate pavé detailing' },
  { id: '3-row-pave', name: '3 Row Pavé', description: 'Triple row of diamonds' },
  { id: 'tapered', name: 'Tapered', description: 'Tapered shank style' },
  { id: 'eternity', name: 'Eternity', description: 'Eternity shank style' },
  { id: 'marquise-cut', name: 'Marquise Cut', description: 'Marquise cut shank style' },
];

const COLOR_OPTIONS = [
  { id: 'yellow', name: 'Yellow Gold', color: '#FFD700' },
  { id: 'rose', name: 'Rose Gold', color: '#E8B4B8' },
  { id: 'white', name: 'White Gold / Platinum', color: '#E8E8E8' },
];

const SHAPE_OPTIONS = [
  { id: 'round', name: 'Round' },
  { id: 'oval', name: 'Oval' },
  { id: 'princess', name: 'Princess' },
  { id: 'radiant', name: 'Radiant' },
  { id: 'emerald', name: 'Emerald' },
  { id: 'cushion', name: 'Cushion' },
  { id: 'pear', name: 'Pear' },
  { id: 'marquise', name: 'Marquise' },
];

const STEPS = [
  { id: 1, title: 'Styles', description: 'Select ring styles you offer' },
  { id: 2, title: 'Shanks', description: 'Choose band styles' },
  { id: 3, title: 'Colors', description: 'Pick available colors' },
  { id: 4, title: 'Shapes', description: 'Select diamond shapes' },
  { id: 5, title: 'Review', description: 'Confirm your catalog' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  
  const [selections, setSelections] = useState({
    styles: [] as string[],
    shanks: [] as string[],
    colors: [] as string[],
    shapes: [] as string[],
  });

  // Fetch client ID
  useEffect(() => {
    const fetchClientId = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setClientId(data.id);
    };
    fetchClientId();
  }, [user]);

  const toggleSelection = (category: keyof typeof selections, id: string) => {
    setSelections(prev => ({
      ...prev,
      [category]: prev[category].includes(id)
        ? prev[category].filter(item => item !== id)
        : [...prev[category], id],
    }));
  };

  const selectAll = (category: keyof typeof selections, options: { id: string }[]) => {
    setSelections(prev => ({
      ...prev,
      [category]: options.map(o => o.id),
    }));
  };

  const clearAll = (category: keyof typeof selections) => {
    setSelections(prev => ({
      ...prev,
      [category]: [],
    }));
  };

  const calculateTotalCombinations = () => {
    const { styles, shanks, colors, shapes } = selections;
    return styles.length * shanks.length * colors.length * shapes.length;
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return selections.styles.length > 0;
      case 2: return selections.shanks.length > 0;
      case 3: return selections.colors.length > 0;
      case 4: return selections.shapes.length > 0;
      case 5: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleGenerateCatalog = async () => {
    if (!clientId) {
      toast.error('Client not found');
      return;
    }

    setIsGenerating(true);
    try {
      const { error } = await supabase.functions.invoke('generate-client-catalog', {
        body: {
          clientId,
          styles: selections.styles,
          shanks: selections.shanks,
          colors: selections.colors,
          shapes: selections.shapes,
        },
      });

      if (error) throw error;

      navigate('/client/catalog', { replace: true });
    } catch (error: any) {
      console.error('Error generating catalog:', error);
      toast.error(error.message || 'Failed to generate catalog');
    } finally {
      setIsGenerating(false);
    }
  };

  const renderOptionCard = (
    option: { id: string; name: string; description?: string; color?: string },
    category: keyof typeof selections,
    isSelected: boolean
  ) => (
    <motion.div
      key={option.id}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => toggleSelection(category, option.id)}
      className={`
        relative cursor-pointer rounded-xl p-4 transition-all duration-200
        ${isSelected
          ? 'bg-primary/20 border-2 border-primary shadow-lg shadow-primary/20'
          : 'bg-card/50 border border-border/50 hover:border-primary/50'
        }
        backdrop-blur-sm
      `}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
          <Check className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
      
      {option.color && (
        <div
          className="w-8 h-8 rounded-full mb-2 border border-border/50"
          style={{ backgroundColor: option.color }}
        />
      )}
      
      <h3 className="font-semibold text-foreground">{option.name}</h3>
      {option.description && (
        <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
      )}
    </motion.div>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-muted-foreground">
                {selections.styles.length} of {STYLE_OPTIONS.length} selected
              </span>
              <div className="space-x-2">
                <Button variant="ghost" size="sm" onClick={() => selectAll('styles', STYLE_OPTIONS)}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={() => clearAll('styles')}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {STYLE_OPTIONS.map(option =>
                renderOptionCard(option, 'styles', selections.styles.includes(option.id))
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-muted-foreground">
                {selections.shanks.length} of {SHANK_OPTIONS.length} selected
              </span>
              <div className="space-x-2">
                <Button variant="ghost" size="sm" onClick={() => selectAll('shanks', SHANK_OPTIONS)}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={() => clearAll('shanks')}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {SHANK_OPTIONS.map(option =>
                renderOptionCard(option, 'shanks', selections.shanks.includes(option.id))
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-muted-foreground">
                {selections.colors.length} of {COLOR_OPTIONS.length} selected
              </span>
              <div className="space-x-2">
                <Button variant="ghost" size="sm" onClick={() => selectAll('colors', COLOR_OPTIONS)}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={() => clearAll('colors')}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {COLOR_OPTIONS.map(option =>
                renderOptionCard(option, 'colors', selections.colors.includes(option.id))
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-muted-foreground">
                {selections.shapes.length} of {SHAPE_OPTIONS.length} selected
              </span>
              <div className="space-x-2">
                <Button variant="ghost" size="sm" onClick={() => selectAll('shapes', SHAPE_OPTIONS)}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={() => clearAll('shapes')}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {SHAPE_OPTIONS.map(option =>
                renderOptionCard(option, 'shapes', selections.shapes.includes(option.id))
              )}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="bg-card rounded-xl p-6 border border-border">
              <h3 className="text-xl font-semibold text-foreground mb-4">Your Selections</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground text-sm">Styles</p>
                  <p className="text-foreground font-medium">
                    {selections.styles.map(s => STYLE_OPTIONS.find(o => o.id === s)?.name).join(', ')}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Shanks</p>
                  <p className="text-foreground font-medium">
                    {selections.shanks.map(s => SHANK_OPTIONS.find(o => o.id === s)?.name).join(', ')}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Colors</p>
                  <p className="text-foreground font-medium">
                    {selections.colors.map(s => COLOR_OPTIONS.find(o => o.id === s)?.name).join(', ')}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Shapes</p>
                  <p className="text-foreground font-medium">
                    {selections.shapes.map(s => SHAPE_OPTIONS.find(o => o.id === s)?.name).join(', ')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-primary/10 rounded-xl p-6 border border-primary/30 text-center">
              <p className="text-4xl font-bold text-primary">{calculateTotalCombinations()}</p>
              <p className="text-muted-foreground mt-1">Ring combinations will be created</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress bar */}
      <div className="w-full bg-muted/30 h-1">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${(currentStep / 5) * 100}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex justify-center py-6 px-4">
        <div className="flex items-center gap-2">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all
                  ${currentStep > step.id
                    ? 'bg-primary text-primary-foreground'
                    : currentStep === step.id
                    ? 'bg-primary/20 text-primary border-2 border-primary'
                    : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-8 h-0.5 mx-1 ${
                    currentStep > step.id ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-foreground">
                  {STEPS[currentStep - 1].title}
                </h1>
                <p className="text-muted-foreground mt-2">
                  {STEPS[currentStep - 1].description}
                </p>
              </div>

              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      <div className="border-t border-border bg-card p-4">
        <div className="max-w-2xl mx-auto flex justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {currentStep < 5 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleGenerateCatalog}
              disabled={isGenerating || !canProceed()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate Catalog
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
