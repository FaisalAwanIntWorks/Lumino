import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[100px] w-full rounded-lg border-2 border-input bg-background px-4 py-3 text-sm text-foreground transition-all duration-200",
        "ring-offset-background placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:border-input focus-visible:ring-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "hover:border-input",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
