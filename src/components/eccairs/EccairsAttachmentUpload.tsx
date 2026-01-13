import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, FileIcon, Loader2, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ECCAIRS_GATEWAY = import.meta.env.VITE_ECCAIRS_GATEWAY_URL || "";
const ECCAIRS_GATEWAY_KEY = import.meta.env.VITE_ECCAIRS_GATEWAY_KEY || "";

interface EccairsAttachmentUploadProps {
  incidentId: string;
  e2Id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface FileWithStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export function EccairsAttachmentUpload({ 
  incidentId, 
  e2Id, 
  open, 
  onOpenChange, 
  onSuccess 
}: EccairsAttachmentUploadProps) {
  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    
    const newFiles: FileWithStatus[] = Array.from(selectedFiles).map(file => ({
      file,
      status: 'pending' as const
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (!ECCAIRS_GATEWAY) {
      toast.error("ECCAIRS gateway URL er ikke konfigurert");
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.error("Du må være logget inn");
      return;
    }

    if (files.length === 0) {
      toast.error("Velg minst én fil");
      return;
    }

    setIsUploading(true);

    // Upload files one by one to show progress
    for (let i = 0; i < files.length; i++) {
      const fileItem = files[i];
      if (fileItem.status !== 'pending') continue;

      setFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: 'uploading' } : f
      ));

      try {
        const formData = new FormData();
        formData.append('files', fileItem.file);
        formData.append('attributePath', '24.ATTRIBUTES.793');
        formData.append('versionType', 'MINOR');

        const res = await fetch(`${ECCAIRS_GATEWAY}/api/eccairs/attachments/${encodeURIComponent(e2Id)}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...(ECCAIRS_GATEWAY_KEY ? { 'x-api-key': ECCAIRS_GATEWAY_KEY } : {}),
          },
          body: formData,
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Opplasting feilet (${res.status})`);
        }

        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'success' } : f
        ));
      } catch (err: any) {
        console.error('Attachment upload failed:', err);
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'error', error: err?.message || 'Ukjent feil' } : f
        ));
      }
    }

    setIsUploading(false);

    const successCount = files.filter(f => f.status === 'success').length;
    const errorCount = files.filter(f => f.status === 'error').length;

    if (successCount > 0 && errorCount === 0) {
      toast.success(`${successCount} vedlegg lastet opp`);
      onSuccess?.();
      handleClose();
    } else if (successCount > 0) {
      toast.success(`${successCount} vedlegg lastet opp, ${errorCount} feilet`);
    } else {
      toast.error("Ingen vedlegg ble lastet opp");
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setFiles([]);
      onOpenChange(false);
    }
  };

  const pendingFiles = files.filter(f => f.status === 'pending').length;
  const uploadProgress = files.length > 0 
    ? Math.round((files.filter(f => f.status === 'success' || f.status === 'error').length / files.length) * 100) 
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Last opp vedlegg</DialogTitle>
          <DialogDescription>
            Vedlegg legges til i ECCAIRS-rapporten ({e2Id})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              isDragging 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Dra og slipp filer her, eller klikk for å velge
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {files.map((fileItem, index) => (
                <div 
                  key={index} 
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm"
                >
                  <FileIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{fileItem.file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(fileItem.file.size / 1024).toFixed(0)} KB
                  </span>
                  {fileItem.status === 'pending' && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                      className="p-1 hover:bg-muted rounded"
                      disabled={isUploading}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {fileItem.status === 'uploading' && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  )}
                  {fileItem.status === 'success' && (
                    <Check className="w-4 h-4 text-green-600" />
                  )}
                  {fileItem.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-600" aria-label={fileItem.error} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar during upload */}
          {isUploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} />
              <p className="text-xs text-center text-muted-foreground">
                Laster opp... {uploadProgress}%
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Avbryt
          </Button>
          <Button 
            onClick={uploadFiles} 
            disabled={isUploading || pendingFiles === 0}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Laster opp...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Last opp ({pendingFiles})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
