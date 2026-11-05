import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { MetalOption } from '@/types/ring-builder';
import { X } from 'lucide-react';

interface MetalInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metal: MetalOption | null;
}

const getBadgeColor = (metal: MetalOption): string => {
  const name = metal.name.toLowerCase();
  const colorFamily = metal.colorFamily?.toLowerCase() || '';
  
  if (colorFamily === 'yellow' || name.includes('yellow')) return '#FFD700';
  if (colorFamily === 'rose' || name.includes('rose')) return '#E8B4B8';
  if (colorFamily === 'white' || name.includes('white') || name.includes('platinum')) return '#E8E8E8';
  return '#C0C0C0';
};

const METAL_DESCRIPTIONS: Record<string, string> = {
  '14k yellow gold': 'A timeless choice with a warm, radiant golden hue that flatters all skin tones. The 58.5% gold content strikes the perfect balance between beauty and durability, making it highly resistant to scratches and ideal for everyday wear. Low maintenance and resistant to tarnish, it pairs beautifully with any gemstone.',
  '14k rose gold': 'A romantic, warm pink tone created by blending gold with copper. Its unique blush color symbolizes love and complements all skin tones beautifully. The 58.5% gold content makes it one of the most durable gold options available, while its vintage charm works equally well in modern and classic designs.',
  '18k yellow gold': 'A richer, deeper golden color thanks to its 75% pure gold content. The higher gold percentage gives it a more vibrant, luxurious appearance that\'s prized worldwide. Slightly softer than 14K, making it excellent for intricate detailing. A great choice for sensitive skin due to its lower alloy content.',
  '18k white gold': 'A sleek, silvery white appearance that offers a modern, sophisticated look similar to platinum at a more accessible price point. With 75% pure gold content, it combines luxury with versatility. Finished with rhodium plating for extra brilliance and protection. An excellent hypoallergenic option when made nickel free.',
  '18k rose gold': 'A romantic, warm pink tone created by blending gold with copper. With 75% pure gold content, its unique blush color symbolizes love and complements all skin tones beautifully. Its vintage charm works equally well in modern and classic designs, while the higher gold purity offers a richer, deeper rose hue.',
  'platinum': 'The pinnacle of precious metals for jewelry. Exceptionally dense and durable, it feels substantial on the finger and holds gemstones securely. Completely hypoallergenic with no nickel content. Over time it develops a beautiful patina that many love, and it can always be polished back to a mirror finish.',
};

const getMetalDescription = (metal: MetalOption): string => {
  const name = metal.name.toLowerCase().trim();
  if (METAL_DESCRIPTIONS[name]) return METAL_DESCRIPTIONS[name];
  for (const [key, desc] of Object.entries(METAL_DESCRIPTIONS)) {
    if (name.includes(key) || key.includes(name)) return desc;
  }
  const karatMatch = name.match(/(\d+)\s*k/i);
  if (karatMatch) {
    const karat = parseInt(karatMatch[1]);
    const purity = Math.round((karat / 24) * 1000) / 10;
    const colorFamily = metal.colorFamily?.toLowerCase() || '';
    const colorName = colorFamily || (name.includes('rose') ? 'rose' : name.includes('white') ? 'white' : 'yellow');
    if (karat >= 20) return `With ${purity}% pure gold content, ${karat}K gold offers an exceptionally rich color and luxurious feel. Higher purity means a more vivid golden tone and excellent hypoallergenic properties, though it will be softer and more suited to special occasion pieces or designs with lower exposure to daily wear.`;
    if (karat < 14) return `With ${purity}% pure gold content, ${karat}K gold is the most durable and affordable gold option. Its higher alloy content makes it extremely resistant to scratches and dents, ideal for active lifestyles. The color will be slightly more subtle than higher karat options.`;
    return `This ${karat}K ${colorName} gold contains ${purity}% pure gold. Higher karat numbers mean richer color and greater purity, while lower karats offer increased durability and scratch resistance. Your jeweler has selected this option to give you the ideal balance for this piece.`;
  }
  return 'A beautiful precious metal choice for your ring. Each metal type offers unique characteristics in terms of durability, color, and style.';
};

export const MetalInfoDialog = ({ open, onOpenChange, metal }: MetalInfoDialogProps) => {
  if (!open || !metal) return null;

  const badgeColor = getBadgeColor(metal);
  const description = getMetalDescription(metal);

  return createPortal(
    <div className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200">
      <div className="aurezo-info-backdrop fixed inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      
      <div className="fixed inset-0 md:left-[50%] flex items-stretch">
        <div className="relative w-full h-full overflow-y-auto bg-background">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors z-10"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>

          <div className="flex flex-col items-center justify-center text-center min-h-full px-6 py-12 max-w-lg mx-auto">
            <div 
              className="w-20 h-20 rounded-full flex items-center justify-center mb-5 shadow-lg"
              style={{ backgroundColor: badgeColor }}
            />

            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
              Metal
            </span>

            <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-4">
              {metal.name}
            </h2>

            <p className="text-muted-foreground text-xs md:text-sm leading-relaxed mb-6 max-w-xs">
              {description}
            </p>

            <Button
              onClick={() => onOpenChange(false)}
              className="px-8 py-5 text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 transition-all duration-300"
            >
              Got It!
            </Button>
          </div>
        </div>
      </div>
    </div>
  , document.body);
};
