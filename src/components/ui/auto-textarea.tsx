import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface AutoTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Minimum height in px (defaults to ~2 rows) */
  minHeight?: number;
  /** Maximum height in px before the field becomes scrollable */
  maxHeight?: number;
}

/**
 * Textarea that grows automatically with its content so all text stays visible.
 */
const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  ({ className, value, minHeight = 56, maxHeight, onChange, ...props }, forwardedRef) => {
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
      const next = Math.max(el.scrollHeight, minHeight);
      el.style.height = `${maxHeight ? Math.min(next, maxHeight) : next}px`;
      el.style.overflowY = maxHeight && next > maxHeight ? "auto" : "hidden";
    }, [minHeight, maxHeight]);

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
        style={{ minHeight, maxHeight, overflowY: "auto", resize: "vertical" }}
        className={cn(className)}
        {...props}
      />
    );
  }
);
AutoTextarea.displayName = "AutoTextarea";

export { AutoTextarea };
