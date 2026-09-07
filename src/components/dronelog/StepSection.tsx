import type { ReactNode } from "react";

interface StepSectionProps {
  id: string;
  title: string;
  description?: string;
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

