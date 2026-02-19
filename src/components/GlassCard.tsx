import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { GripVertical } from "lucide-react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  dragHandleProps?: any;
}

export const GlassCard = ({ children, className, dragHandleProps }: GlassCardProps) => {
  return (
    <div
      className={cn(
        "bg-card/80 backdrop-blur-md border border-glass rounded-lg p-3 sm:p-5 shadow-lg relative group w-full",
        className,
      )}
    >
      {dragHandleProps && (
        <div
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
          className="absolute top-3 right-3 sm:top-5 sm:right-5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
        >
          <GripVertical className="w-5 h-5 text-primary" />
        </div>
      )}
      {children}
    </div>
  );
};
