import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Document } from "@/pages/Documents";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download, ArrowUpDown, FileText, FileImage, FileSpreadsheet, File } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const openUrl = (url: string) => {
  let finalUrl = url;
  if (!url.match(/^https?:\/\//i)) {
    finalUrl = `https://${url}`;
  }
  window.open(finalUrl, "_blank");
};

// Helper to determine if file can be opened in browser
const canOpenInBrowser = (fileName?: string | null): boolean => {
  if (!fileName) return false;
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'txt'].includes(ext || '');
};

// Get appropriate icon for file type
const getFileIcon = (fileName?: string | null) => {
  if (!fileName) return File;
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'pdf':
    case 'doc':
    case 'docx':
    case 'txt':
      return FileText;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg':
      return FileImage;
    case 'xls':
    case 'xlsx':
      return FileSpreadsheet;
    default:
      return File;
  }
};

interface DocumentsListProps {
  documents: Document[];
  isLoading: boolean;
  onDocumentClick: (document: Document) => void;
  sortByExpiry: boolean;
  onToggleSortByExpiry: () => void;
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
  onDocumentClick,
  sortByExpiry,
  onToggleSortByExpiry
}: DocumentsListProps) => {

  const handleOpenFile = async (filUrl: string) => {
    try {
      if (filUrl.startsWith('http://') || filUrl.startsWith('https://')) {
        window.open(filUrl, '_blank');
        return;
      }
      
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(filUrl, 3600);

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error opening file:', error);
      toast.error('Kunne ikke åpne dokumentet');
    }
  };

  const handleDownloadFile = async (filUrl: string, originalFileName?: string) => {
    try {
      if (filUrl.startsWith('http://') || filUrl.startsWith('https://')) {
        window.open(filUrl, '_blank');
        toast.info('Åpner ekstern lenke');
        return;
      }
      
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
        toast.success('Dokumentet ble lastet ned');
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
            <TableHead className="bg-slate-200 text-slate-950 shadow-sm px-2 md:px-4">
              <span className="md:hidden">Kat.</span>
              <span className="hidden md:inline">Kategori</span>
            </TableHead>
            <TableHead 
              className={cn(
                "bg-slate-200 text-slate-950 hidden md:table-cell cursor-pointer select-none transition-all",
                sortByExpiry && "ring-2 ring-primary ring-inset bg-slate-300"
              )}
              onClick={onToggleSortByExpiry}
            >
              <div className="flex items-center gap-1">
                Utløpsdato
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead className="bg-slate-200 text-slate-950 hidden lg:table-cell">Opprettet</TableHead>
            <TableHead className="bg-slate-200 text-slate-950 text-right pl-1 md:pl-4">Handlinger</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map(doc => <TableRow key={doc.id} className="cursor-pointer hover:bg-accent" onClick={() => onDocumentClick(doc)}>
              <TableCell className="font-medium bg-slate-200/50 text-slate-950 shadow-sm rounded-none max-w-[150px] md:max-w-none truncate">{doc.tittel}</TableCell>
              <TableCell className="bg-slate-200/50 text-slate-950 px-2 md:px-4">
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
              <TableCell className="bg-slate-200/50 text-slate-950 text-right pl-1 md:pl-4">
                <TooltipProvider>
                  <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                    {doc.nettside_url && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openUrl(doc.nettside_url!)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Åpne nettside</TooltipContent>
                      </Tooltip>
                    )}
                    {doc.fil_url && !doc.nettside_url && (
                      <>
                        {/* Open button for viewable files */}
                        {canOpenInBrowser(doc.fil_navn) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenFile(doc.fil_url!)}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Åpne i nettleser</TooltipContent>
                          </Tooltip>
                        )}
                        {/* Download button */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadFile(doc.fil_url!, doc.fil_navn || undefined)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Last ned</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </div>
                </TooltipProvider>
              </TableCell>
            </TableRow>)}
        </TableBody>
      </Table>
    </div>;
};
export default DocumentsList;