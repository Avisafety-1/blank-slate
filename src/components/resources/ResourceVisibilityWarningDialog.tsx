import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, FileText, Package, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MissingVisibility, DepartmentInfo } from "@/lib/droneVisibilityCheck";
import { grantMissingVisibility } from "@/lib/droneVisibilityCheck";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missing: MissingVisibility[];
  departments: DepartmentInfo[];
  /** Called when user wants to proceed (after optional auto-grant) */
  onContinue: () => void | Promise<void>;
  /** Called when user cancels — saving should be aborted */
  onCancel: () => void;
  /** Optional label for the parent resource (e.g. "dronen", "utstyret"). Defaults to "dronen". */
  resourceLabel?: string;
}

const typeIcons: Record<MissingVisibility["resourceType"], any> = {
  document: FileText,
  equipment: Package,
  personnel: User,
};

export const ResourceVisibilityWarningDialog = ({
  open,
  onOpenChange,
  missing,
  departments,
  onContinue,
  onCancel,
  resourceLabel,
}: Props) => {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const effectiveLabel = resourceLabel ?? t('resourceDialogs.resourceVisibility.descriptionDrone');
  const typeLabel: Record<MissingVisibility["resourceType"], string> = {
    document: t('resourceDialogs.resourceVisibility.typeDocument'),
    equipment: t('resourceDialogs.resourceVisibility.typeEquipment'),
    personnel: t('resourceDialogs.resourceVisibility.typePersonnel'),
  };

  const deptName = (id: string) => departments.find((d) => d.id === id)?.navn || id.slice(0, 8);
  const autoFixable = missing.filter((m) => m.resourceType !== "personnel");
  const personnelOnly = missing.filter((m) => m.resourceType === "personnel");

  const handleGrantAll = async () => {
    setWorking(true);
    try {
      await grantMissingVisibility(autoFixable);
      toast.success(t('resourceDialogs.resourceVisibility.grantSuccess', { n: autoFixable.length }));
      await onContinue();
      onOpenChange(false);
    } catch (e: any) {
      console.error("Grant visibility error:", e);
      toast.error(t('resourceDialogs.resourceVisibility.grantFailed', { msg: e.message }));
    } finally {
      setWorking(false);
    }
  };

  const handleProceed = async () => {
    setWorking(true);
    try {
      await onContinue();
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); else onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            {t('resourceDialogs.resourceVisibility.title')}
          </DialogTitle>
          <DialogDescription>
            {t('resourceDialogs.resourceVisibility.descriptionGeneric', { res: effectiveLabel })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('resourceDialogs.resourceVisibility.typeHead')}</TableHead>
                <TableHead>{t('resourceDialogs.resourceVisibility.nameHead')}</TableHead>
                <TableHead>{t('resourceDialogs.resourceVisibility.missingHead')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {missing.map((m, i) => {
                const Icon = typeIcons[m.resourceType];
                return (
                  <TableRow key={`${m.resourceType}-${m.resourceId}-${i}`}>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        {typeLabel[m.resourceType]}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{m.resourceName}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {m.missingDeptIds.map((d) => (
                          <Badge key={d} variant="outline" className="text-xs">
                            {deptName(d)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {personnelOnly.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span>
              {t('resourceDialogs.resourceVisibility.personnelWarning')}
            </span>
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={handleCancel} disabled={working}>
            {t('resourceDialogs.resourceVisibility.cancel')}
          </Button>
          <Button variant="outline" onClick={handleProceed} disabled={working}>
            {t('resourceDialogs.resourceVisibility.proceed')}
          </Button>
          {autoFixable.length > 0 && (
            <Button onClick={handleGrantAll} disabled={working}>
              {working ? t('resourceDialogs.resourceVisibility.updating') : t('resourceDialogs.resourceVisibility.makeVisible', { n: autoFixable.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
