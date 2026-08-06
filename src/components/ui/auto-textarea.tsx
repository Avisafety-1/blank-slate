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

    const handleWheel = React.useCallback((e: React.WheelEvent<HTMLTextAreaElement>) => {
      const el = innerRef.current;
      if (!el) return;
      const canScroll = el.scrollHeight > el.clientHeight + 1;
      if (!canScroll) return;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      // Keep the scroll inside the textarea unless we're at an edge
      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
        e.stopPropagation();
        el.scrollTop += e.deltaY;
        e.preventDefault();
      }
    }, []);

    return (
      <Textarea
        ref={setRefs}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        onWheel={handleWheel}
        style={{
          minHeight,
          maxHeight,
          overflowY: "auto",
          resize: "vertical",
          overscrollBehavior: "contain",
          touchAction: "pan-y",
        }}
        className={cn(className)}
        {...props}
      />
    );
  }
);
AutoTextarea.displayName = "AutoTextarea";

export { AutoTextarea };
