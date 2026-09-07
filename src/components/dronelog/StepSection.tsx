import type { ReactNode } from "react";

interface StepSectionProps {
  id: string;
  index: number;
  title: string;
  description?: string;
  done?: boolean;
  children: ReactNode;
}

/** One numbered step in the flight log result view. */
export const StepSection = ({ id, title, description, children }: StepSectionProps) => (
  <section id={id} className="scroll-mt-4 space-y-3">
    <div className="flex items-center gap-3 border-b-2 border-border pb-2">
      <div className="min-w-0 border-l-4 border-primary pl-3">
        <h3 className="text-base font-semibold leading-tight text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground leading-tight">{description}</p>}
      </div>
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

export interface StepDescriptor {
  id: string;
  label: string;
  done?: boolean;
}

interface StepIndicatorProps {
  steps: StepDescriptor[];
}

/** Clickable 1-2-3 progress row shown above the steps. */
export const StepIndicator = ({ steps }: StepIndicatorProps) => (
  <div className="flex items-center gap-1.5 overflow-x-auto">
    {steps.map((s, i) => (
      <button
        key={s.id}
        type="button"
        onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
            s.done ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary"
          }`}
        >
          {s.done ? <Check className="h-2.5 w-2.5" /> : i + 1}
        </span>
        {s.label}
      </button>
    ))}
  </div>
);
