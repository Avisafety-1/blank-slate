import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface AutoTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Minimum height in px (defaults to ~2 rows) */
  minHeight?: number;
}

/**
 * Textarea that grows automatically with its content so all text stays visible.
 */
const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  ({ className, value, minHeight = 56, onChange, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef]
    );

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
    }, [minHeight]);

    React.useLayoutEffect(() => {
      resize();
    }, [resize, value]);

    return (
      <Textarea
        ref={setRefs}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        style={{ minHeight, overflow: "hidden", resize: "none" }}
        className={cn(className)}
        {...props}
      />
    );
  }
);
AutoTextarea.displayName = "AutoTextarea";

export { AutoTextarea };
