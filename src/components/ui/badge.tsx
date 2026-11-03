import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-md shadow-emerald/30 hover:shadow-lg hover:shadow-emerald/40",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow-md hover:shadow-lg",
        outline: "text-foreground border border-border hover:bg-muted",
        success: "gradient-emerald text-white shadow-md shadow-emerald/30 hover:shadow-lg hover:shadow-emerald/40",
        warning: "gradient-gold text-foreground shadow-md shadow-gold/30 hover:shadow-lg hover:shadow-gold/40",
        luxury: "gradient-luxury text-white shadow-md shadow-luxury hover:shadow-lg hover:shadow-luxury",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
