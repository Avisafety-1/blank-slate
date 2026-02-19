import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Circle, ClipboardCheck } from "lucide-react";

interface ChecklistItem {
  id: string;
  text: string;
}

interface ChecklistExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Array of checklist IDs (multi-tab mode) */
  checklistIds?: string[];
  /** Already-completed checklist IDs */
  completedIds?: string[];
  /** Backward-compat: single checklist ID */
  checklistId?: string;
  itemName: string;
  /** Called with the completed checklistId */
  onComplete: (checklistId: string) => void | Promise<void>;
}

export const ChecklistExecutionDialog = (props: ChecklistExecutionDialogProps) => {
  const { open, onOpenChange, itemName, onComplete, completedIds = [] } = props;

  // Resolve IDs — support both old single-ID and new array prop
  const checklistIds: string[] = props.checklistIds ?? (props.checklistId ? [props.checklistId] : []);

  const [activeChecklistId, setActiveChecklistId] = useState<string>("");
  const [checklistTitles, setChecklistTitles] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checkedByTab, setCheckedByTab] = useState<Record<string, Set<string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  const completedChecklistIds = new Set(completedIds);

  // Derived checked items for active tab
  const checkedItems: Set<string> = checkedByTab[activeChecklistId] ?? new Set();

  // When dialog opens, initialise active tab to first incomplete checklist
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current && checklistIds.length > 0) {
      const firstIncomplete =
        checklistIds.find((id) => !completedChecklistIds.has(id)) ?? checklistIds[0];
      setActiveChecklistId(firstIncomplete);
      setCheckedByTab({});
    }
    prevOpenRef.current = open;
  }, [open]);

  // Fetch all checklist titles once when IDs are known
  useEffect(() => {
    if (!open || checklistIds.length === 0) return;
    const fetchTitles = async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, tittel")
        .in("id", checklistIds);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((d) => { map[d.id] = d.tittel; });
        setChecklistTitles(map);
      }
    };
    fetchTitles();
  }, [open, checklistIds.join(",")]);

  // Fetch items for the active checklist whenever it changes
  useEffect(() => {
    if (!open || !activeChecklistId) return;
    const fetchItems = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("documents")
          .select("beskrivelse")
          .eq("id", activeChecklistId)
          .single();
        if (error) throw error;
        if (data?.beskrivelse) {
          try {
            setItems(JSON.parse(data.beskrivelse) as ChecklistItem[]);
          } catch {
            setItems([]);
          }
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchItems();
  }, [open, activeChecklistId]);

  const handleTabChange = (newId: string) => {
    setActiveChecklistId(newId);
  };

  const handleToggleItem = (itemId: string) => {
    setCheckedByTab((prev) => {
      const current = new Set(prev[activeChecklistId] ?? []);
      if (current.has(itemId)) current.delete(itemId);
      else current.add(itemId);
      return { ...prev, [activeChecklistId]: current };
    });
  };

  const allItemsChecked = items.length > 0 && checkedItems.size === items.length;
  const checkedCount = checkedItems.size;
  const totalCount = items.length;
  const progressPercentage = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await onComplete(activeChecklistId);

      // Mark this tab as completed in local state so the icon updates immediately
      const nowCompleted = new Set([...completedChecklistIds, activeChecklistId]);

      // Find the next incomplete tab
      const nextIncomplete = checklistIds.find((id) => !nowCompleted.has(id));
      if (nextIncomplete) {
        setActiveChecklistId(nextIncomplete);
      } else {
        // All done — close dialog
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error completing:", error);
    } finally {
      setIsCompleting(false);
    }
  };

  const showTabs = checklistIds.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <span className="truncate">
              {showTabs
                ? itemName || "Sjekklister"
                : checklistTitles[activeChecklistId] || "Sjekkliste"}
            </span>
          </DialogTitle>
          {showTabs && (
            <p className="text-sm text-muted-foreground">
              {checklistTitles[activeChecklistId] || ""}
            </p>
          )}
          {!showTabs && itemName && (
            <p className="text-sm text-muted-foreground">{itemName}</p>
          )}
        </DialogHeader>

        {/* Tab navigation — only shown when multiple checklists */}
        {showTabs && (
          <Tabs value={activeChecklistId} onValueChange={handleTabChange}>
            <TabsList className="w-full">
              {checklistIds.map((id) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="flex-1 gap-1.5 text-xs"
                >
                  {completedChecklistIds.has(id) && (
                    <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                  )}
                  <span className="truncate">{checklistTitles[id] || "…"}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Progress bar */}
        <div className="space-y-1 flex-shrink-0">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Fremgang</span>
            <span className="font-medium">{checkedCount} av {totalCount}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-4" style={{ maxHeight: 'calc(90vh - 260px)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Laster sjekkliste...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Ingen punkter i sjekklisten</p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {items.map((item, index) => {
                const isChecked = checkedItems.has(item.id);
                return (
                  <div
                    key={item.id}
                    role="checkbox"
                    aria-checked={isChecked}
                    tabIndex={0}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                      isChecked
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-background/50 border-border hover:bg-muted/50'
                    }`}
                    onClick={() => handleToggleItem(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggleItem(item.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-center mt-0.5">
                      {isChecked ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                        {index + 1}. {item.text}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!allItemsChecked || isCompleting}
            className="gap-2"
          >
            {isCompleting ? (
              "Fullfører..."
            ) : allItemsChecked ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Fullfør
              </>
            ) : (
              `Kryss av alle punkter (${checkedCount}/${totalCount})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
