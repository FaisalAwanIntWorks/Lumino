import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2 } from "lucide-react";

/**
 * A non-dismissible loading modal specifically for the Sign In flow.
 * (No close button, no outside click, no ESC close.)
 */
export function SigningInDialog({ open }: { open: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={() => {}} modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={
            "fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-2xl"
          }
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Signing in</DialogPrimitive.Title>

          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Signing in…</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Please wait.</p>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
