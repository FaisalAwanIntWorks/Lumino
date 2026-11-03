interface StepHeadingProps {
  preText: string;
  highlightText: string;
  subtitle?: string;
  accentColor?: string;
  fontColor?: string;
}

export function StepHeading({ preText, highlightText, subtitle, accentColor, fontColor }: StepHeadingProps) {
  return (
    <div className="text-center space-y-2 max-w-2xl mx-auto">
      <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight leading-tight">
        <span style={{ color: fontColor || '#ffffff' }}>{preText} </span>
        <span style={{ color: accentColor || 'hsl(142, 53%, 53%)' }}>{highlightText}</span>
      </h1>
      {subtitle && (
        <p className="text-sm md:text-base max-w-lg mx-auto animate-fade-in" style={{ color: fontColor ? `${fontColor}80` : 'rgba(255,255,255,0.5)' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
