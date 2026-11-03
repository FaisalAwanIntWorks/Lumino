import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, ...props }, ref) => {
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      onFocus?.(e);
      if (type === "number") {
        e.target.select();
      }
    };

    return (
      <input
        type={type}
        onFocus={handleFocus}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm transition-all duration-200",
          "ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:border-input focus-visible:ring-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "hover:border-input",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
