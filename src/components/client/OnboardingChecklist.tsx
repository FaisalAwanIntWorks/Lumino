import { useNavigate } from 'react-router-dom';
import { useOnboardingChecklist } from '@/hooks/useOnboardingChecklist';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';

export default function OnboardingChecklist() {
  const { steps, allComplete, completedCount, totalCount, loading } = useOnboardingChecklist();
  const navigate = useNavigate();

  if (loading || allComplete || totalCount === 0) return null;

  const percent = Math.round((completedCount / totalCount) * 100);

  return (
    <div
      className="rounded-2xl border border-border bg-card glass-panel p-5 sm:p-6 mb-8"
      style={{ opacity: 0, animation: 'fadeUpIn 0.4s ease-out 0.08s forwards' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Welcome! Complete your setup
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount} of {totalCount} steps completed
          </p>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{percent}%</span>
      </div>

      <Progress value={percent} className="h-1.5 mb-5" />

      <div className="space-y-1">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
              step.completed
                ? 'opacity-60'
                : 'hover:bg-muted/50 cursor-pointer'
            }`}
            onClick={() => !step.completed && navigate(step.href)}
            role={step.completed ? undefined : 'button'}
            tabIndex={step.completed ? undefined : 0}
            onKeyDown={(e) => {
              if (!step.completed && (e.key === 'Enter' || e.key === ' ')) {
                navigate(step.href);
              }
            }}
          >
            <div className="flex items-center gap-3">
              {step.completed ? (
                <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-[18px] w-[18px] text-muted-foreground/40 shrink-0" />
              )}
              <div>
                <p className={`text-sm font-medium ${step.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground hidden sm:block">{step.description}</p>
              </div>
            </div>
            {!step.completed && (
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
