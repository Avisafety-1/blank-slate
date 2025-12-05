import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { MapPin, Calendar, AlertTriangle, User, MessageSquare, Send, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { sendNotificationEmail, generateIncidentNotificationHTML } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Incident = Tables<"incidents">;

type IncidentComment = {
  id: string;
  comment_text: string;
  created_by_name: string;
  created_at: string;
};

interface IncidentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incident: Incident | null;
}

const severityColors = {
  Lav: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  Middels: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Høy: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30",
  Kritisk: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
};

const statusColors = {
  Ny: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  "Under utredning": "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  "Tiltak iverksatt": "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
  Lukket: "bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30",
  Åpen: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
  "Under behandling": "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Ferdigbehandlet: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
};

export const IncidentDetailDialog = ({ open, onOpenChange, incident }: IncidentDetailDialogProps) => {
  const { user, companyId } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [relatedMission, setRelatedMission] = useState<{ id: string; tittel: string; lokasjon: string; status: string } | null>(null);
  const [oppfolgingsansvarlig, setOppfolgingsansvarlig] = useState<{ id: string; full_name: string } | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [updatingResponsible, setUpdatingResponsible] = useState(false);
  const [comments, setComments] = useState<IncidentComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("");
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });
        setIsAdmin(data || false);
        
        // Hent brukerens navn
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        
        setCurrentUserName(profile?.full_name || 'Ukjent bruker');
      }
    };
    
    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('approved', true)
          .order('full_name', { ascending: true });

        if (error) throw error;
        setUsers(data || []);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    
    checkAdmin();
    fetchUsers();
  }, []);

  useEffect(() => {
    const fetchRelatedMission = async () => {
      if (!incident?.mission_id) {
        setRelatedMission(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('missions')
          .select('id, tittel, lokasjon, status')
          .eq('id', incident.mission_id)
          .single();

        if (error) throw error;
        setRelatedMission(data);
      } catch (error) {
        console.error('Error fetching related mission:', error);
        setRelatedMission(null);
      }
    };

    fetchRelatedMission();
  }, [incident?.mission_id]);

  // Synkroniser selectedResponsibleId med incident prop
  useEffect(() => {
    setSelectedResponsibleId(incident?.oppfolgingsansvarlig_id || null);
  }, [incident?.oppfolgingsansvarlig_id]);

  useEffect(() => {
    const fetchOppfolgingsansvarlig = async () => {
      if (!incident?.oppfolgingsansvarlig_id) {
        setOppfolgingsansvarlig(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', incident.oppfolgingsansvarlig_id)
          .maybeSingle();

        if (error) throw error;
        setOppfolgingsansvarlig(data);
      } catch (error) {
        console.error('Error fetching oppfolgingsansvarlig:', error);
        setOppfolgingsansvarlig(null);
      }
    };

    fetchOppfolgingsansvarlig();
  }, [incident?.oppfolgingsansvarlig_id]);

  useEffect(() => {
    const fetchComments = async () => {
      if (!incident?.id) {
        setComments([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('incident_comments')
          .select('id, comment_text, created_by_name, created_at')
          .eq('incident_id', incident.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setComments(data || []);
      } catch (error) {
        console.error('Error fetching comments:', error);
        setComments([]);
      }
    };

    fetchComments();
    
    if (!incident?.id) return;
    
    const channel = supabase
      .channel(`incident_comments_${incident.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'incident_comments',
          filter: `incident_id=eq.${incident.id}`
        },
        (payload) => {
          setComments(prev => [...prev, payload.new as IncidentComment]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [incident?.id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!incident) return;
    
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('incidents')
        .update({ 
          status: newStatus,
          oppdatert_dato: new Date().toISOString()
        })
        .eq('id', incident.id);

      if (error) throw error;

      toast.success("Status oppdatert");
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Kunne ikke oppdatere status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddComment = async () => {
    if (!incident || !newComment.trim()) return;
    
    setSubmittingComment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('incident_comments')
        .insert({
          incident_id: incident.id,
          user_id: user.id,
          comment_text: newComment.trim(),
          created_by_name: currentUserName
        });

      if (error) throw error;

      setNewComment("");
      toast.success("Kommentar lagt til");
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Kunne ikke legge til kommentar");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleResponsibleChange = async (userId: string) => {
    if (!incident) return;
    
    setUpdatingResponsible(true);
    try {
      const newUserId = userId === "ingen" ? null : userId;
      
      const { error } = await supabase
        .from('incidents')
        .update({ 
          oppfolgingsansvarlig_id: newUserId,
          oppdatert_dato: new Date().toISOString()
        })
        .eq('id', incident.id);

      if (error) throw error;

      // Send e-post til ny ansvarlig hvis en bruker er valgt
      if (newUserId) {
        await sendNotificationEmail({
          recipientId: newUserId,
          notificationType: 'email_followup_assigned',
          subject: `Du er satt som oppfølgingsansvarlig: ${incident.tittel}`,
          htmlContent: generateIncidentNotificationHTML({
            tittel: incident.tittel,
            beskrivelse: incident.beskrivelse,
            alvorlighetsgrad: incident.alvorlighetsgrad,
            lokasjon: incident.lokasjon,
          }),
          companyId: incident.company_id,
        });
      }

      // Optimistisk UI-oppdatering
      setSelectedResponsibleId(newUserId);
      
      if (newUserId) {
        const user = users.find(u => u.id === newUserId);
        if (user) {
          setOppfolgingsansvarlig(user);
        }
      } else {
        setOppfolgingsansvarlig(null);
      }

      toast.success("Oppfølgingsansvarlig oppdatert");
    } catch (error) {
      console.error("Error updating responsible:", error);
      toast.error("Kunne ikke oppdatere ansvarlig");
    } finally {
      setUpdatingResponsible(false);
    }
  };

  const handleExportPDF = async () => {
    if (!incident || !companyId || !user) return;
    
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 20;

      // Header
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("HENDELSESRAPPORT", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text(incident.tittel, pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Eksportert: ${format(new Date(), "dd.MM.yyyy 'kl.' HH:mm", { locale: nb })}`, pageWidth / 2, yPos, { align: "center" });
      doc.setTextColor(0);
      yPos += 15;

      // Detaljer
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("DETALJER", 14, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");

      const details = [
        ["Status", incident.status],
        ["Alvorlighetsgrad", incident.alvorlighetsgrad],
        ["Kategori", incident.kategori || "Ikke spesifisert"],
        ["Hovedårsak", incident.hovedaarsak || "Ikke spesifisert"],
        ["Medvirkende årsak", incident.medvirkende_aarsak || "Ikke spesifisert"],
        ["Hendelsestidspunkt", format(new Date(incident.hendelsestidspunkt), "dd.MM.yyyy HH:mm", { locale: nb })],
        ["Lokasjon", incident.lokasjon || "Ikke spesifisert"],
        ["Rapportert av", incident.rapportert_av || "Ikke spesifisert"],
        ["Oppfølgingsansvarlig", oppfolgingsansvarlig?.full_name || "Ikke tildelt"],
      ];

      if (relatedMission) {
        details.push(["Knyttet oppdrag", relatedMission.tittel]);
      }

      details.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, 14, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(value, 60, yPos);
        yPos += 6;
      });

      yPos += 10;

      // Beskrivelse
      if (incident.beskrivelse) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("BESKRIVELSE", 14, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const splitDescription = doc.splitTextToSize(incident.beskrivelse, pageWidth - 28);
        doc.text(splitDescription, 14, yPos);
        yPos += splitDescription.length * 5 + 10;
      }

      // Kommentarer
      if (comments.length > 0) {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("KOMMENTARER", 14, yPos);
        yPos += 8;

        autoTable(doc, {
          startY: yPos,
          head: [["Dato", "Av", "Kommentar"]],
          body: comments.map(c => [
            format(new Date(c.created_at), "dd.MM.yyyy HH:mm", { locale: nb }),
            c.created_by_name,
            c.comment_text
          ]),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 35 },
            2: { cellWidth: 'auto' }
          }
        });
      }

      // Generer filnavn og blob
      const dateStr = format(new Date(), "yyyy-MM-dd");
      const safeTitle = incident.tittel.replace(/[^a-zA-Z0-9æøåÆØÅ\s-]/g, '').substring(0, 30);
      const fileName = `hendelsesrapport-${safeTitle}-${dateStr}.pdf`;
      
      const pdfBlob = doc.output('blob');
      const filePath = `${companyId}/${fileName}`;

      // Last opp til Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Opprett dokumentoppføring
      const { error: docError } = await supabase
        .from('documents')
        .insert({
          tittel: `Hendelsesrapport - ${incident.tittel} - ${format(new Date(), "dd.MM.yyyy", { locale: nb })}`,
          kategori: 'rapporter',
          fil_url: filePath,
          fil_navn: fileName,
          company_id: companyId,
          user_id: user.id,
          beskrivelse: `Automatisk generert rapport for hendelse: ${incident.tittel}`
        });

      if (docError) throw docError;

      toast.success("Hendelsesrapport lagret i dokumenter");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("Kunne ikke eksportere rapport");
    } finally {
      setExporting(false);
    }
  };

  if (!incident) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="flex flex-row items-start justify-between gap-2">
          <DialogTitle className="text-lg sm:text-xl flex-1">{incident.tittel}</DialogTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            disabled={exporting}
            className="shrink-0"
          >
            <FileText className="w-4 h-4 mr-2" />
            {exporting ? "Eksporterer..." : "Eksporter PDF"}
          </Button>
        </DialogHeader>
        
        <div className="space-y-4">
          {isAdmin && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status-select">Endre status (Admin)</Label>
                <Select 
                  value={incident.status} 
                  onValueChange={handleStatusChange}
                  disabled={updatingStatus}
                >
                  <SelectTrigger id="status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Åpen">Åpen</SelectItem>
                    <SelectItem value="Under behandling">Under behandling</SelectItem>
                    <SelectItem value="Ferdigbehandlet">Ferdigbehandlet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="responsible-select">Oppfølgingsansvarlig (Admin)</Label>
                <Select 
                  value={selectedResponsibleId || "ingen"} 
                  onValueChange={handleResponsibleChange}
                  disabled={updatingResponsible}
                >
                  <SelectTrigger id="responsible-select">
                    <SelectValue placeholder="Velg ansvarlig..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="ingen">Ingen ansvarlig</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name || 'Ukjent bruker'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Badge className={`${statusColors[incident.status as keyof typeof statusColors] || 'bg-gray-500/20'} border`}>
              {incident.status}
            </Badge>
            <Badge className={`${severityColors[incident.alvorlighetsgrad as keyof typeof severityColors] || 'bg-gray-500/20'} border`}>
              Alvorlighetsgrad: {incident.alvorlighetsgrad}
            </Badge>
            {incident.kategori && (
              <Badge variant="outline">
                {incident.kategori}
              </Badge>
            )}
            {incident.hovedaarsak && (
              <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30">
                Hovedårsak: {incident.hovedaarsak}
              </Badge>
            )}
            {incident.medvirkende_aarsak && (
              <Badge variant="outline" className="bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/30">
                Medvirkende: {incident.medvirkende_aarsak}
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            {relatedMission && (
              <div className="p-3 bg-muted rounded-md border">
                <p className="text-sm font-medium text-muted-foreground mb-1">Knyttet til oppdrag</p>
                <p className="font-medium">{relatedMission.tittel}</p>
                <p className="text-sm text-muted-foreground">
                  {relatedMission.lokasjon} • {relatedMission.status}
                </p>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Hendelsestidspunkt</p>
                <p className="text-base">
                  {format(new Date(incident.hendelsestidspunkt), "dd. MMMM yyyy, HH:mm", { locale: nb })}
                </p>
              </div>
            </div>

            {incident.lokasjon && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Lokasjon</p>
                  <p className="text-base">{incident.lokasjon}</p>
                </div>
              </div>
            )}

            {incident.rapportert_av && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Rapportert av</p>
                  <p className="text-base">{incident.rapportert_av}</p>
                </div>
              </div>
            )}

            {incident.opprettet_dato && (
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Rapportert dato</p>
                  <p className="text-base">
                    {format(new Date(incident.opprettet_dato), "dd. MMMM yyyy, HH:mm", { locale: nb })}
                  </p>
                </div>
              </div>
            )}

            {oppfolgingsansvarlig && (
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Oppfølgingsansvarlig</p>
                  <p className="text-base">{oppfolgingsansvarlig.full_name || 'Ukjent bruker'}</p>
                </div>
              </div>
            )}
          </div>

          {incident.beskrivelse && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Beskrivelse</p>
              <p className="text-base leading-relaxed whitespace-pre-wrap">{incident.beskrivelse}</p>
            </div>
          )}

          {(incident.alvorlighetsgrad === "Høy" || incident.alvorlighetsgrad === "Kritisk") && incident.status === "Åpen" && (
            <div className="border border-destructive/30 bg-destructive/10 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    {incident.alvorlighetsgrad === "Kritisk" ? "Kritisk hendelse" : "Høy alvorlighetsgrad"}
                  </p>
                  <p className="text-sm mt-1 text-destructive/90">
                    Denne hendelsen krever umiddelbar oppmerksomhet og oppfølging.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Kommentarer-seksjon */}
        <div className="border-t border-border pt-4 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-base font-medium">
              Kommentarer {comments.length > 0 && `(${comments.length})`}
            </h3>
          </div>

          {/* Eksisterende kommentarer */}
          <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Ingen kommentarer ennå
              </p>
            ) : (
              comments.map((comment) => (
                <div 
                  key={comment.id} 
                  className="bg-muted/50 rounded-lg p-3 border border-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {comment.created_by_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(comment.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">
                    {comment.comment_text}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Legg til ny kommentar */}
          <div className="space-y-2">
            <Textarea
              placeholder="Skriv en kommentar..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={submittingComment}
              className="min-h-[80px] resize-none"
            />
            <Button
              onClick={handleAddComment}
              disabled={!newComment.trim() || submittingComment}
              className="w-full gap-2"
              size="sm"
            >
              <Send className="w-4 h-4" />
              {submittingComment ? "Legger til..." : "Legg til kommentar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};