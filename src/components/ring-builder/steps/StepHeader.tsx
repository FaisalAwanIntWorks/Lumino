interface StepHeaderProps {
  title?: string;
  description: string;
}

export const StepHeader = ({ description }: StepHeaderProps) => {
  return (
    <div className="text-center space-y-1 mb-1 md:mb-3 animate-fade-in">
      <p className="text-[10px] md:text-xs text-muted-foreground leading-snug max-w-2xl mx-auto">
        {description}
      </p>
    </div>
  );
};
