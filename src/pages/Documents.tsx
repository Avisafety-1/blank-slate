import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, ListChecks } from "lucide-react";
import DocumentsFilterBar from "@/components/documents/DocumentsFilterBar";
import DocumentsList from "@/components/documents/DocumentsList";
import DocumentCardModal from "@/components/documents/DocumentCardModal";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { CreateChecklistDialog } from "@/components/documents/CreateChecklistDialog";
import { toast } from "sonner";
import droneBackground from "@/assets/drone-background.png";

export type DocumentCategory = "regelverk" | "prosedyrer" | "sjekklister" | "rapporter" | "nettsider" | "oppdrag" | "loggbok" | "kml-kmz" | "dokumentstyring" | "risikovurderinger" | "annet";
export interface Document {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  kategori: string;
  gyldig_til: string | null;
  varsel_dager_for_utløp: number | null;
  fil_url: string | null;
  fil_navn: string | null;
  nettside_url: string | null;
  opprettet_dato: string;
  oppdatert_dato: string | null;
  opprettet_av: string | null;
}
const Documents = () => {
  const {
    user,
    loading,
    companyId
  } = useAuth();
  const navigate = useNavigate();
  const {
    isAdmin
  } = useAdminCheck();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<DocumentCategory[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createChecklistOpen, setCreateChecklistOpen] = useState(false);
  const [sortByExpiry, setSortByExpiry] = useState(false);
  useEffect(() => {
    if (!loading && !user && navigator.onLine) {
      navigate("/auth", {
        replace: true
      });
    }
  }, [user, loading, navigate]);
  const {
    data: documents,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["documents", companyId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("documents").select("*").order("opprettet_dato", {
        ascending: false
      });
      if (error) throw error;
      return data as Document[];
    }
  });

  // Real-time subscription for documents
  useEffect(() => {
    const channel = supabase.channel('documents-page-changes').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'documents'
    }, () => {
      refetch();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);
  const filteredDocuments = documents?.filter(doc => {
    const matchesSearch = searchQuery === "" || doc.tittel.toLowerCase().includes(searchQuery.toLowerCase()) || doc.beskrivelse?.toLowerCase().includes(searchQuery.toLowerCase()) || doc.fil_url?.toLowerCase().includes(searchQuery.toLowerCase()) || doc.nettside_url?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(doc.kategori.toLowerCase().trim() as DocumentCategory);
    return matchesSearch && matchesCategory;
  })?.sort((a, b) => {
    if (sortByExpiry) {
      // Sort by expiry date - nearest first, docs without expiry at the end
      if (!a.gyldig_til && !b.gyldig_til) return 0;
      if (!a.gyldig_til) return 1;
      if (!b.gyldig_til) return -1;
      return new Date(a.gyldig_til).getTime() - new Date(b.gyldig_til).getTime();
    }
    // Default: sort by creation date (newest first)
    return new Date(b.opprettet_dato).getTime() - new Date(a.opprettet_dato).getTime();
  });
  const handleOpenDocument = (document: Document) => {
    setSelectedDocument(document);
    setIsCreating(false);
    setIsModalOpen(true);
  };
  const handleCreateNew = () => {
    setSelectedDocument(null);
    setIsCreating(true);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDocument(null);
    setIsCreating(false);
  };
  const handleSaveSuccess = () => {
    refetch();
    handleCloseModal();
    toast.success(isCreating ? "Dokument opprettet" : "Dokument oppdatert");
  };
  const handleDeleteSuccess = () => {
    refetch();
    handleCloseModal();
    toast.success("Dokument slettet");
  };
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>;
  }
  return <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div className="fixed inset-0 z-0" style={{
      backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
      backgroundSize: "cover",
      backgroundPosition: "center center",
      backgroundRepeat: "no-repeat"
    }} />

      {/* Content */}
      <div className="relative z-10 w-full">
        {/* Main Content */}
        <main className="w-full px-3 sm:px-4 py-3 sm:py-5">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h1 className="text-4xl font-bold text-foreground">Dokumenter</h1>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button onClick={() => setCreateChecklistOpen(true)} variant="secondary" size="default">
                    <ListChecks className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Ny sjekkliste</span>
                  </Button>
                  <Button onClick={() => setCreateDialogOpen(true)} size="default">
                    <Plus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Nytt dokument</span>
                  </Button>
                </div>
              )}
            </div>

            <DocumentsFilterBar searchQuery={searchQuery} onSearchChange={setSearchQuery} selectedCategories={selectedCategories} onCategoriesChange={setSelectedCategories} />

            <DocumentsList 
              documents={filteredDocuments || []} 
              isLoading={isLoading} 
              onDocumentClick={handleOpenDocument}
              sortByExpiry={sortByExpiry}
              onToggleSortByExpiry={() => setSortByExpiry(!sortByExpiry)}
            />

            <DocumentUploadDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSuccess={() => {
            refetch();
            toast.success("Dokument opprettet");
          }} />

            <CreateChecklistDialog 
              open={createChecklistOpen} 
              onOpenChange={setCreateChecklistOpen} 
              onSuccess={() => {
                refetch();
              }} 
            />

            <DocumentCardModal document={selectedDocument} isOpen={isModalOpen} onClose={handleCloseModal} onSaveSuccess={handleSaveSuccess} onDeleteSuccess={handleDeleteSuccess} isAdmin={isAdmin} isCreating={isCreating} />
          </div>
        </main>
      </div>
    </div>;
};
export default Documents;