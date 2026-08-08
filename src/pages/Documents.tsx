import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtimeChannel";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, ListChecks, FolderPlus, ClipboardCheck } from "lucide-react";
import DocumentsFilterBar from "@/components/documents/DocumentsFilterBar";
import DocumentsList from "@/components/documents/DocumentsList";
import DocumentCardModal from "@/components/documents/DocumentCardModal";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { CreateChecklistDialog } from "@/components/documents/CreateChecklistDialog";
import EvaluationFormDialog from "@/components/documents/EvaluationFormDialog";
import EvaluationFormPreview from "@/components/evaluation/EvaluationFormPreview";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEvaluationTemplates, type EvaluationTemplate } from "@/hooks/useEvaluationTemplates";
import { toast } from "sonner";
import droneBackground from "@/assets/drone-background.png";
import FolderGrid from "@/components/documents/FolderGrid";
import { useTranslation } from "react-i18next";


export type DocumentCategory = "regelverk" | "prosedyrer" | "sjekklister" | "rapporter" | "nettsider" | "oppdrag" | "loggbok" | "kml-kmz" | "dokumentstyring" | "risikovurderinger" | "operasjonsmanual" | "vurderingsskjema" | "annet";
export type DocumentSortOption = "newest" | "oldest" | "expiry" | "alpha_asc" | "alpha_desc";
export type DocumentStatusFilter = "expired" | "expiring_soon" | "valid" | "no_expiry";

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
  company_id?: string | null;
  company_name?: string | null;
  visible_to_children?: boolean | null;
  global_visibility?: boolean | null;
}

const getDocumentStatus = (doc: Document): DocumentStatusFilter => {
  if (!doc.gyldig_til) return "no_expiry";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(doc.gyldig_til);
  expiryDate.setHours(0, 0, 0, 0);
  if (expiryDate < today) return "expired";
  const warningDays = doc.varsel_dager_for_utløp ?? 30;
  const warningDate = new Date(today);
  warningDate.setDate(warningDate.getDate() + warningDays);
  if (expiryDate <= warningDate) return "expiring_soon";
  return "valid";
};

const Documents = () => {
  const { user, loading, companyId, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<DocumentCategory[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<DocumentStatusFilter[]>([]);
  const [sortOption, setSortOption] = useState<DocumentSortOption>("newest");
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createChecklistOpen, setCreateChecklistOpen] = useState(false);
  const [createEvaluationOpen, setCreateEvaluationOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EvaluationTemplate | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<EvaluationTemplate | null>(null);
  const { templates: evaluationTemplates } = useEvaluationTemplates();

  useEffect(() => {
    if (!loading && !user && navigator.onLine) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // Deep-link handling: ?id=<document-uuid>
  const [searchParams, setSearchParams] = useSearchParams();

  const { departmentsEnabled } = useAuth();

  const { data: documents, isLoading, refetch } = useQuery({
    queryKey: ["documents", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").order("opprettet_dato", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as any[];
      const ownerIds = Array.from(new Set(rows.map((d) => d.company_id).filter(Boolean))) as string[];
      let nameMap = new Map<string, string>();
      if (ownerIds.length > 0) {
        const { data: names } = await supabase.rpc("get_company_names", { _company_ids: ownerIds });
        (names || []).forEach((c: any) => nameMap.set(c.id, c.navn));
      }
      return rows.map((d) => ({ ...d, company_name: d.company_id ? nameMap.get(d.company_id) ?? null : null })) as (Document & { company_name?: string })[];
    },
    refetchOnMount: 'always',
  });


  useEffect(() => {
    const channel = createUniqueChannel('documents-page-changes').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'documents'
    }, () => {
      refetch();
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  // Deep-link handling: ?id=<document-uuid>
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || !documents) return;
    const doc = documents.find((d) => d.id === id);
    if (doc) {
      setSelectedDocument(doc);
      setIsCreating(false);
      setIsModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, documents, setSearchParams]);

  const templateDocuments: Document[] = (evaluationTemplates ?? []).map((tpl) => ({
    id: tpl.id,
    tittel: tpl.title,
    beskrivelse: tpl.description,
    kategori: "vurderingsskjema",
    gyldig_til: null,
    varsel_dager_for_utløp: null,
    fil_url: null,
    fil_navn: null,
    nettside_url: null,
    opprettet_dato: tpl.created_at,
    oppdatert_dato: tpl.updated_at,
    opprettet_av: null,
    company_id: tpl.company_id,
    evaluation_template: tpl,
  } as any));

  const allDocuments = [...(documents ?? []), ...templateDocuments];

  const filteredDocuments = allDocuments.filter(doc => {
    const matchesSearch = searchQuery === "" ||
      doc.tittel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.beskrivelse?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.fil_url?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.nettside_url?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategories.length === 0 ||
      selectedCategories.includes(doc.kategori.toLowerCase().trim() as DocumentCategory);

    const matchesStatus = selectedStatuses.length === 0 ||
      selectedStatuses.includes(getDocumentStatus(doc));

    return matchesSearch && matchesCategory && matchesStatus;
  }).sort((a, b) => {
    switch (sortOption) {
      case "oldest":
        return new Date(a.opprettet_dato).getTime() - new Date(b.opprettet_dato).getTime();
      case "expiry":
        if (!a.gyldig_til && !b.gyldig_til) return 0;
        if (!a.gyldig_til) return 1;
        if (!b.gyldig_til) return -1;
        return new Date(a.gyldig_til).getTime() - new Date(b.gyldig_til).getTime();
      case "alpha_asc":
        return a.tittel.localeCompare(b.tittel, "nb");
      case "alpha_desc":
        return b.tittel.localeCompare(a.tittel, "nb");
      case "newest":
      default:
        return new Date(b.opprettet_dato).getTime() - new Date(a.opprettet_dato).getTime();
    }
  });

  const handleOpenDocument = (document: Document) => {
    const tpl = (document as any).evaluation_template as EvaluationTemplate | undefined;
    if (tpl) {
      setViewingTemplate(tpl);
      return;
    }
    setSelectedDocument(document);
    setIsCreating(false);
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
    toast.success(isCreating ? t('documents.toasts.created') : t('documents.toasts.updated'));
  };

  const handleDeleteSuccess = () => {
    refetch();
    handleCloseModal();
    toast.success(t('documents.toasts.deleted'));
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">{t('common.loading')}</p>
      </div>;
  }

  return <div className="min-h-screen relative w-full overflow-x-hidden">
      <div className="fixed inset-0 z-0" style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat"
      }} />
      <div className="relative z-10 w-full">
        <main className="w-full px-3 sm:px-4 py-3 sm:py-5">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h1 className="text-4xl font-bold text-foreground">{t('pages.documents.title')}</h1>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setCreateChecklistOpen(true)} variant="secondary" size="default">
                    <ListChecks className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t('pages.documents.newChecklist')}</span>
                  </Button>
                  <Button onClick={() => setCreateEvaluationOpen(true)} variant="secondary" size="default">
                    <ClipboardCheck className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t('pages.documents.newEvaluationForm')}</span>
                  </Button>
                  <Button onClick={() => setCreateFolderOpen(true)} variant="secondary" size="default">
                    <FolderPlus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t('pages.documents.newFolder')}</span>
                  </Button>
                  <Button onClick={() => setCreateDialogOpen(true)} size="default">
                    <Plus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t('pages.documents.newDocument')}</span>
                  </Button>
                </div>
              )}
            </div>


            <FolderGrid isAdmin={isAdmin} companyId={companyId} createOpen={createFolderOpen} onCreateOpenChange={setCreateFolderOpen} />






            <DocumentsFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategories={selectedCategories}
              onCategoriesChange={setSelectedCategories}
              selectedStatuses={selectedStatuses}
              onStatusesChange={setSelectedStatuses}
              sortOption={sortOption}
              onSortChange={setSortOption}
            />

            <DocumentsList
              documents={filteredDocuments || []}
              isLoading={isLoading}
              onDocumentClick={handleOpenDocument}
              getDocumentStatus={getDocumentStatus}
              canEditEvaluation={isAdmin}
              onViewEvaluation={(doc) => setViewingTemplate((doc as any).evaluation_template)}
              onEditEvaluation={(doc) => setEditingTemplate((doc as any).evaluation_template)}
            />


            <DocumentUploadDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSuccess={() => {
              refetch();
              toast.success(t('documents.toasts.created'));
            }} />

            <CreateChecklistDialog
              open={createChecklistOpen}
              onOpenChange={setCreateChecklistOpen}
              onSuccess={() => { refetch(); }}
            />

            <EvaluationFormDialog
              open={createEvaluationOpen}
              onOpenChange={setCreateEvaluationOpen}
            />

            <EvaluationFormDialog
              open={!!editingTemplate}
              onOpenChange={(open) => { if (!open) setEditingTemplate(null); }}
              template={editingTemplate}
            />

            <Dialog open={!!viewingTemplate} onOpenChange={(open) => !open && setViewingTemplate(null)}>
              <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="break-words pr-6">{viewingTemplate?.title}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-2 -mr-2">
                  {viewingTemplate && (
                    <EvaluationFormPreview
                      title={viewingTemplate.title}
                      description={viewingTemplate.description ?? ""}
                      categories={viewingTemplate.structure}
                      headerDisabled
                    />
                  )}
                </div>
              </DialogContent>
            </Dialog>



            <DocumentCardModal
              document={selectedDocument}
              isOpen={isModalOpen}
              onClose={handleCloseModal}
              onSaveSuccess={handleSaveSuccess}
              onDeleteSuccess={handleDeleteSuccess}
              isAdmin={isAdmin}
              isCreating={isCreating}
              isOwnerCompany={isCreating || selectedDocument?.company_id === companyId}
            />
          </div>
        </main>
      </div>
    </div>;
};

export default Documents;
