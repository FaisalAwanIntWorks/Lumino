import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useEffect, useState } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  gradient?: string;
}

export const StatCard = ({ title, value, icon: Icon, trend }: StatCardProps) => {
  const [displayValue, setDisplayValue] = useState(0);
  const numericValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : value;

  useEffect(() => {
    if (typeof numericValue === 'number' && !isNaN(numericValue)) {
      const duration = 1000;
      const steps = 50;
      const increment = numericValue / steps;
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= numericValue) {
          setDisplayValue(numericValue);
          clearInterval(timer);
        } else {
          setDisplayValue(Math.floor(current));
        }
      }, duration / steps);

      return () => clearInterval(timer);
    }
  }, [numericValue]);

  return (
    <Card className="group relative overflow-hidden p-6 border-border bg-card hover-lift animate-fade-in h-full">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            {title}
          </p>
          <h3 className="text-4xl font-semibold text-foreground mb-2">
            {typeof value === 'string' ? value : displayValue.toLocaleString()}
          </h3>
          {trend && (
            <div className="flex items-center gap-2 mt-3">
              <span className={`text-sm font-semibold ${
                trend.value >= 0 
                  ? 'text-primary' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {trend.value >= 0 ? '+' : ''}{trend.value}%
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {trend.label}
              </span>
            </div>
          )}
        </div>
        
        <div className="relative">
          {/* Icon container with gradient background */}
          <div className="relative rounded-2xl gradient-emerald p-4 shadow-lg shadow-emerald group-hover:scale-110 transition-transform duration-300">
            <Icon className="h-7 w-7 text-white" />
          </div>
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-2xl gradient-emerald blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
        </div>
      </div>
    </Card>
  );
};
