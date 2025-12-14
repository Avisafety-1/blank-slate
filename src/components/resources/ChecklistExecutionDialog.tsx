import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  checklistId: string;
  itemName: string;
  onComplete: () => void | Promise<void>;
}

export const ChecklistExecutionDialog = ({ 
  open, 
  onOpenChange, 
  checklistId, 
  itemName,
  onComplete 
}: ChecklistExecutionDialogProps) => {
  const [checklistTitle, setChecklistTitle] = useState<string>("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    if (open && checklistId) {
      fetchChecklist();
    }
  }, [open, checklistId]);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    // Only reset when dialog actually opens (false → true transition)
    if (open && !prevOpenRef.current) {
      setCheckedItems(new Set());
    }
    prevOpenRef.current = open;
  }, [open]);

  const fetchChecklist = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("tittel, beskrivelse")
        .eq("id", checklistId)
        .single();

      if (error) throw error;

      setChecklistTitle(data.tittel);
      
      if (data.beskrivelse) {
        try {
          const parsedItems = JSON.parse(data.beskrivelse) as ChecklistItem[];
          setItems(parsedItems);
        } catch {
          setItems([]);
        }
      }
    } catch (error) {
      console.error("Error fetching checklist:", error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleItem = (itemId: string) => {
    setCheckedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const allItemsChecked = items.length > 0 && checkedItems.size === items.length;

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await onComplete();
      onOpenChange(false);
    } catch (error) {
      console.error("Error completing:", error);
    } finally {
      setIsCompleting(false);
    }
  };

  const checkedCount = checkedItems.size;
  const totalCount = items.length;
  const progressPercentage = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <span className="truncate">{checklistTitle || "Sjekkliste"}</span>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {itemName}
          </p>
        </DialogHeader>

        {/* Progress bar */}
        <div className="space-y-1">
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

        <ScrollArea className="flex-1 min-h-0 h-[calc(90vh-280px)] pr-4">
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
        </ScrollArea>

        <DialogFooter className="gap-2 pt-4 border-t">
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
