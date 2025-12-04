import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Document } from "@/pages/Documents";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const openUrl = (url: string) => {
  let finalUrl = url;
  if (!url.match(/^https?:\/\//i)) {
    finalUrl = `https://${url}`;
  }
  window.open(finalUrl, "_blank");
};
interface DocumentsListProps {
  documents: Document[];
  isLoading: boolean;
  onDocumentClick: (document: Document) => void;
}
const CATEGORY_LABELS: Record<string, string> = {
  regelverk: "Regelverk",
  prosedyrer: "Prosedyrer",
  sjekklister: "Sjekklister",
  rapporter: "Rapporter",
  nettsider: "Nettsider",
  annet: "Annet"
};
const DocumentsList = ({
  documents,
  isLoading,
  onDocumentClick
}: DocumentsListProps) => {

  const handleDownloadFile = async (filUrl: string, originalFileName?: string) => {
    try {
      if (filUrl.startsWith('http://') || filUrl.startsWith('https://')) {
        // External URL - just open it
        window.open(filUrl, '_blank');
        return;
      }
      
      // Storage path - download with original filename
      const { data, error } = await supabase.storage
        .from('documents')
        .download(filUrl);

      if (error) throw error;
      
      if (data) {
        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = originalFileName || filUrl.split('/').pop() || 'document';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Kunne ikke laste ned dokumentet');
    }
  };

  if (isLoading) {
    return <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>;
  }
  if (documents.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">
        Ingen dokumenter funnet
      </div>;
  }
  return <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="bg-slate-200 text-slate-950 opacity-100">Tittel</TableHead>
            <TableHead className="bg-slate-200 text-slate-950 shadow-sm">Kategori</TableHead>
            <TableHead className="bg-slate-200 text-slate-950 hidden md:table-cell">Utløpsdato</TableHead>
            <TableHead className="bg-slate-200 text-slate-950 hidden lg:table-cell">Opprettet</TableHead>
            <TableHead className="bg-slate-200 text-slate-950 text-right">Handlinger</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map(doc => <TableRow key={doc.id} className="cursor-pointer hover:bg-accent" onClick={() => onDocumentClick(doc)}>
              <TableCell className="font-medium bg-slate-200/50 text-slate-950 shadow-sm rounded-none max-w-[150px] md:max-w-none truncate">{doc.tittel}</TableCell>
              <TableCell className="bg-slate-200/50 text-slate-950">
                <Badge variant="secondary" className="text-xs whitespace-nowrap">
                  {CATEGORY_LABELS[doc.kategori] || doc.kategori}
                </Badge>
              </TableCell>
              <TableCell className="bg-slate-200/50 text-slate-950 hidden md:table-cell">
                {doc.gyldig_til ? format(new Date(doc.gyldig_til), "dd.MM.yyyy", {
              locale: nb
            }) : "Ingen utløpsdato"}
              </TableCell>
              <TableCell className="bg-slate-200/50 text-slate-950 hidden lg:table-cell">
                {format(new Date(doc.opprettet_dato), "dd.MM.yyyy", {
              locale: nb
            })}
              </TableCell>
              <TableCell className="bg-slate-200/50 text-slate-950 text-right">
                <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                  {doc.nettside_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openUrl(doc.nettside_url!)}
                      title="Åpne nettside"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                  {doc.fil_url && !doc.nettside_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadFile(doc.fil_url!, doc.fil_navn || undefined)}
                      title="Last ned dokument"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>)}
        </TableBody>
      </Table>
    </div>;
};
export default DocumentsList;