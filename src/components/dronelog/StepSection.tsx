import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StepSectionProps {
  id: string;
  title?: string;
  description?: string;
  children: ReactNode;
}

interface SectionCardProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  accentClassName?: string;
}

/** One numbered step in the flight log result view. */
export const StepSection = ({ id, children }: StepSectionProps) => (
  <section id={id} className="scroll-mt-4 space-y-3">
    {children}
  </section>
);

/** Bordered card with a thick left accent and a title bar, inspired by maintenance cards. */
export const SectionCard = ({
  title,
  icon,
  children,
  className,
  accentClassName = "bg-primary",
}: SectionCardProps) => (
  <div
    className={cn(
      "relative overflow-hidden rounded-xl border-2 border-border bg-card shadow-sm",
      className
    )}
  >
    <div className={cn("absolute left-0 top-0 h-full w-1.5", accentClassName)} />
    <div className="pl-4 p-3 space-y-3">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      {children}
    </div>
  </div>
);
