import * as React from 'react';
import { cn } from '@/lib/utils';
import type { QuoteEstimatorTheme } from '@/lib/quote-estimator-theme';
import { withAlpha } from '@/lib/color-utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  theme: QuoteEstimatorTheme;
  /** Render the outer halo (credit block, primary button). */
  glow?: boolean;
  /** Allow the halo to breathe slowly, only above a moderate glow intensity. */
  pulse?: boolean;
  /** Override the corner radius token (e.g. pill buttons). */
  radius?: number;
  as?: 'div' | 'section' | 'li';
}

/** Above this the halo may breathe; below it the glow stays perfectly static. */
const GLOW_PULSE_THRESHOLD = 0.5;

/**
 * The single surface primitive for the Quote Estimator skin.
 *
 * Every value comes from the theme tokens. With surfaceOpacity, surfaceBlur,
 * borderOpacity and glowIntensity all at 0 — the default — this renders a
 * plain solid card: no backdrop-filter declaration, no border rule, no glow
 * layer. The effects are omitted rather than set to a transparent value, so
 * nothing invisible is left behind.
 */
export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ theme, glow = false, pulse = false, radius, className, style, children, as = 'div', ...rest }, ref) => {
    const hasBlur = theme.surfaceBlur > 0;
    const hasBorder = theme.borderOpacity > 0;
    const hasGlow = glow && theme.glowIntensity > 0;
    const breathes = hasGlow && pulse && theme.glowIntensity > GLOW_PULSE_THRESHOLD;
    const r = radius ?? theme.borderRadius;

    const surface =
      theme.surfaceOpacity > 0
        ? withAlpha(theme.surfaceColor, theme.surfaceOpacity)
        : theme.tileBackground;

    const cardStyle: React.CSSProperties = {
      backgroundColor: surface,
      borderRadius: r,
      color: theme.fontColor,
      ...style,
    };

    if (hasBlur) {
      // Solid fallback already applied above for browsers without support.
      (cardStyle as any).backdropFilter = `blur(${theme.surfaceBlur}px)`;
      (cardStyle as any).WebkitBackdropFilter = `blur(${theme.surfaceBlur}px)`;
    }
    if (hasBorder) {
      cardStyle.border = `1px solid ${withAlpha(theme.borderColor, theme.borderOpacity)}`;
      // Hairline: brighter along the top edge so light reads as falling from
      // above. Same borderColor family, no second colour introduced.
      cardStyle.boxShadow = `inset 0 1px 0 ${withAlpha(theme.borderColor, Math.min(1, theme.borderOpacity * 1.8))}, inset 0 -1px 0 ${withAlpha(theme.borderColor, theme.borderOpacity * 0.5)}`;
    }
    if (hasGlow) {
      const halo = `0 0 ${Math.round(24 + theme.glowIntensity * 40)}px ${withAlpha(theme.glowColor, theme.glowIntensity * 0.5)}`;
      cardStyle.boxShadow = cardStyle.boxShadow ? `${cardStyle.boxShadow}, ${halo}` : halo;
    }

    const Tag = as as any;
    return (
      <Tag
        ref={ref}
        className={cn('relative', breathes && 'qe-glow-breathe', className)}
        style={cardStyle}
        {...rest}
      >
        {children}
      </Tag>
    );
  }
);
GlassCard.displayName = 'GlassCard';
