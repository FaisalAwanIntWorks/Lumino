import { Lightbulb } from 'lucide-react';

interface ExpertTipProps {
  tip: string;
}

const STEP_TIPS: Record<number, string> = {
  0: "Classic styles like solitaire never go out of fashion, while halo settings add extra sparkle.",
  1: "A pave shank adds brilliance, while cathedral styles lift and protect the center stone.",
  2: "Platinum is the most durable, while white gold offers similar aesthetics at a lower price.",
  3: "Round brilliant cuts reflect the most light, while emerald cuts showcase clarity.",
  4: "A 1-carat diamond is a popular choice, balancing size with value.",
  5: "VS1-VS2 clarity offers the best value—inclusions are invisible to the naked eye.",
  6: "A personal engraving makes your ring truly one-of-a-kind and meaningful.",
  7: "Most rings can be resized, but it's best to get the right size from the start."
};

export const ExpertTip = ({ tip }: ExpertTipProps) => {
  return (
    <div className="mx-3 md:mx-4 mt-2 p-2.5 md:p-3 bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-xl border border-accent-gold/30 rounded-lg animate-fade-in shadow-[0_8px_32px_rgba(212,175,55,0.15),inset_0_1px_1px_rgba(255,255,255,0.2)] relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-r from-accent-gold/0 via-accent-gold/5 to-accent-gold/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="flex gap-2 items-start relative z-10">
        <div className="p-1.5 bg-gradient-to-br from-accent-gold/20 to-accent-gold/10 rounded-md shrink-0 shadow-[0_0_20px_hsl(var(--accent-gold)/0.3)] backdrop-blur-sm">
          <Lightbulb className="h-3.5 w-3.5 text-accent-gold drop-shadow-[0_0_8px_hsl(var(--accent-gold)/0.6)]" />
        </div>
        <div>
          <h4 className="font-serif font-bold text-[10px] text-accent-gold mb-0.5 tracking-wide uppercase">Expert Tip</h4>
          <p className="text-[10px] text-foreground/70 leading-snug">{tip}</p>
        </div>
      </div>
    </div>
  );
};

export { STEP_TIPS };
