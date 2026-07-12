import { HelpCircle, PlayCircle, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGuidedTour } from "./GuidedTourProvider";
import { getTourList } from "@/tours/tourDefinitions";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  variant?: "icon" | "default";
  className?: string;
  onBeforeStart?: () => void;
}

export const StartTourButton = ({ variant = "icon", className, onBeforeStart }: Props) => {
  const { t } = useTranslation();
  const { start, isCompleted, resetAll } = useGuidedTour();
  const { isAdmin, isSuperAdmin } = useAuth();
  const tourList = getTourList(t);
  const visibleTours = tourList.filter((tour) => tour.id !== "admin" || isAdmin || isSuperAdmin);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="sm" className={className} title={t("tours.ui.startTraining")} data-tour="header-help">
            <HelpCircle className="w-4 h-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className={className} data-tour="header-help">
            <HelpCircle className="w-4 h-4 mr-2" />
            {t("tours.ui.startTraining")}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 z-[1300] max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel>{t("tours.ui.menuLabel")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visibleTours.map((tour) => (
          <DropdownMenuItem
            key={tour.id}
            onClick={() => {
              onBeforeStart?.();
              // Notify any open dialogs (e.g. ProfileDialog) so they close themselves.
              window.dispatchEvent(new CustomEvent('avisafe:tour-starting'));
              // Fallback: dispatch Escape for non-listening dialogs.
              document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]').forEach((el) => {
                el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
              });
              setTimeout(() => start(tour.id), 300);
            }}
            className="flex items-start gap-2 py-2"
          >
            <PlayCircle className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium flex items-center gap-2">
                {tour.title}
                {isCompleted(tour.id) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">{t("tours.ui.completed")}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2">{tour.description}</div>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={resetAll} className="text-xs text-muted-foreground">
          <RotateCcw className="w-3 h-3 mr-2" />
          {t("tours.ui.resetAll")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
