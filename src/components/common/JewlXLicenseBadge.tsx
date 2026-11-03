import { Badge } from '@/components/ui/badge';
import { Shield } from 'lucide-react';

interface JewlXLicenseBadgeProps {
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function JewlXLicenseBadge({ size = 'sm', className = '' }: JewlXLicenseBadgeProps) {
  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5'
  };

  const iconSizes = {
    xs: 'h-2.5 w-2.5',
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5'
  };

  return (
    <Badge 
      variant="secondary" 
      className={`bg-primary/10 text-primary border-primary/20 flex items-center gap-1 ${sizeClasses[size]} ${className}`}
    >
      <Shield className={iconSizes[size]} />
      <span>Licensed by JewlX</span>
    </Badge>
  );
}
