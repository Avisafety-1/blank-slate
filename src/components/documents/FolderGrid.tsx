import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FolderOpen, Plus } from "lucide-react";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { FolderDetailDialog } from "./FolderDetailDialog";

interface FolderGridProps {
  isAdmin: boolean;
  companyId: string | null;
}

interface Folder {
  id: string;
  name: string;
  item_count: number;
}

const FolderGrid = ({ isAdmin, companyId }: FolderGridProps) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: folders, refetch } = useQuery({
    queryKey: ["document-folders", companyId],
    queryFn: async () => {
      const { data: foldersData } = await supabase
        .from("document_folders")
        .select("id, name")
        .order("created_at", { ascending: true });

      if (!foldersData?.length) return [];

      const { data: items } = await supabase
        .from("document_folder_items")
        .select("folder_id");

      const countMap = new Map<string, number>();
      (items || []).forEach((item: any) => {
        countMap.set(item.folder_id, (countMap.get(item.folder_id) || 0) + 1);
      });

      return foldersData.map((f: any) => ({
        id: f.id,
        name: f.name,
        item_count: countMap.get(f.id) || 0,
      })) as Folder[];
    },
    enabled: !!companyId,
  });

  if (!folders?.length && !isAdmin) return null;

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {folders?.map((folder) => (
          <button
            key={folder.id}
            onClick={() => { setSelectedFolder(folder); setDetailOpen(true); }}
            className="aspect-square rounded-lg border border-glass bg-card/80 backdrop-blur-md flex flex-col items-center justify-center gap-1.5 hover:bg-accent/15 transition-colors cursor-pointer p-2"
          >
            <FolderOpen className="h-8 w-8 text-primary" />
            <span className="text-xs font-medium text-foreground text-center line-clamp-2 leading-tight">{folder.name}</span>
            <span className="text-[10px] text-muted-foreground">{folder.item_count} dok.</span>
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => setCreateOpen(true)}
            className="aspect-square rounded-lg border border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1.5 hover:bg-accent/15 transition-colors cursor-pointer"
          >
            <Plus className="h-7 w-7 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Ny mappe</span>
          </button>
        )}
      </div>

      <CreateFolderDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={refetch} />
      <FolderDetailDialog
        folder={selectedFolder}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefresh={refetch}
        isAdmin={isAdmin}
      />
    </>
  );
};

export default FolderGrid;
