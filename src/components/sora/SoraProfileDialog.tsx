import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSoraProfile } from "@/hooks/useSoraProfile";
import { SoraProfileEditor } from "./SoraProfileEditor";

interface Props {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
}

export function SoraProfileDialog({ documentId, open, onOpenChange, readOnly }: Props) {
  const { t } = useTranslation();
  const { document } = useSoraProfile(documentId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] p-0 gap-0 flex flex-col overflow-hidden dialog-max-h">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 text-left">
          <DialogTitle>{t("soraProfile.title")}</DialogTitle>
          <DialogDescription className="truncate">{document?.tittel ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 px-4 pt-3">
          <SoraProfileHelp />
        </div>
        <SoraProfileEditor documentId={documentId} readOnly={readOnly} />
      </DialogContent>
    </Dialog>
  );
}
