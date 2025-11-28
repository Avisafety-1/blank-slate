import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import DocumentsFilterBar from "@/components/documents/DocumentsFilterBar";
import DocumentsList from "@/components/documents/DocumentsList";
import DocumentCardModal from "@/components/documents/DocumentCardModal";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { toast } from "sonner";
import droneBackground from "@/assets/drone-background.png";
import { Header } from "@/components/Header";
export type DocumentCategory = "regelverk" | "prosedyrer" | "sjekklister" | "rapporter" | "nettsider" | "annet";
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
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { isAdmin } = useAdminCheck();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<DocumentCategory[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);
  const {
    data: documents,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["documents"],
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
  const filteredDocuments = documents?.filter(doc => {
    const matchesSearch = searchQuery === "" || doc.tittel.toLowerCase().includes(searchQuery.toLowerCase()) || doc.beskrivelse?.toLowerCase().includes(searchQuery.toLowerCase()) || doc.fil_url?.toLowerCase().includes(searchQuery.toLowerCase()) || doc.nettside_url?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(doc.kategori as DocumentCategory);
    return matchesSearch && matchesCategory;
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>
    );
  }

  return <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div className="fixed inset-0 z-0" style={{
      backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
      backgroundSize: "cover",
      backgroundPosition: "center center",
      backgroundAttachment: "fixed",
      backgroundRepeat: "no-repeat"
    }} />

      {/* Content */}
      <div className="relative z-10 w-full">
        <Header />

        {/* Main Content */}
        <main className="w-full px-3 sm:px-4 py-3 sm:py-5">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-4xl font-bold text-foreground">Dokumenter</h1>
              {isAdmin && <Button onClick={() => setCreateDialogOpen(true)} size="lg">
                  <Plus className="mr-2" />
                  Nytt dokument
                </Button>}
            </div>

            <DocumentsFilterBar searchQuery={searchQuery} onSearchChange={setSearchQuery} selectedCategories={selectedCategories} onCategoriesChange={setSelectedCategories} />

            <DocumentsList documents={filteredDocuments || []} isLoading={isLoading} onDocumentClick={handleOpenDocument} />

            <DocumentUploadDialog
              open={createDialogOpen}
              onOpenChange={setCreateDialogOpen}
              onSuccess={() => {
                refetch();
                toast.success("Dokument opprettet");
              }}
            />

            <DocumentCardModal document={selectedDocument} isOpen={isModalOpen} onClose={handleCloseModal} onSaveSuccess={handleSaveSuccess} onDeleteSuccess={handleDeleteSuccess} isAdmin={isAdmin} isCreating={isCreating} />
          </div>
        </main>
      </div>
    </div>;
};
export default Documents;