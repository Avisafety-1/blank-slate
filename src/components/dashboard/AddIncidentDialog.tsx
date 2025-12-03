import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sendNotificationEmail, generateIncidentNotificationHTML } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";

interface AddIncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
}

export const AddIncidentDialog = ({ open, onOpenChange, defaultDate }: AddIncidentDialogProps) => {
  const { companyId } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [missions, setMissions] = useState<Array<{ id: string; tittel: string; status: string; tidspunkt: string; lokasjon: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [causeTypes, setCauseTypes] = useState<Array<{ id: string; navn: string }>>([]);
  const [contributingCauses, setContributingCauses] = useState<Array<{ id: string; navn: string }>>([]);
  const [formData, setFormData] = useState({
    tittel: "",
    beskrivelse: "",
    hendelsestidspunkt: "",
    alvorlighetsgrad: "Middels",
    status: "Åpen",
    kategori: "",
    lokasjon: "",
    mission_id: "",
    oppfolgingsansvarlig_id: "",
    hovedaarsak: "",
    medvirkende_aarsak: "",
  });

  useEffect(() => {
    if (open) {
      fetchMissions();
      fetchUsers();
      fetchCauseTypes();
      if (defaultDate) {
        // Format date to datetime-local format
        const year = defaultDate.getFullYear();
        const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
        const day = String(defaultDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}T09:00`;
        setFormData(prev => ({ ...prev, hendelsestidspunkt: dateStr }));
      }
    } else {
      // Reset form when dialog closes
      setFormData({
        tittel: "",
        beskrivelse: "",
        hendelsestidspunkt: "",
        alvorlighetsgrad: "Middels",
        status: "Åpen",
        kategori: "",
        lokasjon: "",
        mission_id: "",
        oppfolgingsansvarlig_id: "",
        hovedaarsak: "",
        medvirkende_aarsak: "",
      });
    }
  }, [open, defaultDate]);

  const fetchMissions = async () => {
    try {
      const { data, error } = await supabase
        .from('missions')
        .select('id, tittel, status, tidspunkt, lokasjon')
        .in('status', ['Planlagt', 'Tildelt', 'Pågår'])
        .order('tidspunkt', { ascending: true });

      if (error) throw error;
      setMissions(data || []);
    } catch (error) {
      console.error('Error fetching missions:', error);
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

  const fetchCauseTypes = async () => {
    try {
      const { data: causes, error: causesError } = await supabase
        .from('incident_cause_types')
        .select('id, navn')
        .eq('aktiv', true)
        .order('rekkefolge');

      if (causesError) throw causesError;
      setCauseTypes(causes || []);

      const { data: contributing, error: contributingError } = await supabase
        .from('incident_contributing_causes')
        .select('id, navn')
        .eq('aktiv', true)
        .order('rekkefolge');

      if (contributingError) throw contributingError;
      setContributingCauses(contributing || []);
    } catch (error) {
      console.error('Error fetching cause types:', error);
    }
  };

  const handleMissionSelect = (missionId: string) => {
    const selectedMission = missions.find(m => m.id === missionId);
    
    if (selectedMission) {
      const missionDate = new Date(selectedMission.tidspunkt);
      const year = missionDate.getFullYear();
      const month = String(missionDate.getMonth() + 1).padStart(2, '0');
      const day = String(missionDate.getDate()).padStart(2, '0');
      const hours = String(missionDate.getHours()).padStart(2, '0');
      const minutes = String(missionDate.getMinutes()).padStart(2, '0');
      const dateTimeStr = `${year}-${month}-${day}T${hours}:${minutes}`;
      
      setFormData(prev => ({
        ...prev,
        mission_id: missionId,
        hendelsestidspunkt: dateTimeStr,
        lokasjon: selectedMission.lokasjon,
      }));
    } else {
      setFormData(prev => ({ ...prev, mission_id: missionId }));
    }
  };

  const handleSubmit = async () => {
    if (!formData.tittel || !formData.hendelsestidspunkt) {
      toast.error("Vennligst fyll ut alle påkrevde felt");
      return;
    }

    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !companyId) {
        toast.error("Du må være logget inn for å rapportere hendelser");
        setSubmitting(false);
        return;
      }

      const { error } = await supabase
        .from('incidents')
        .insert({
          company_id: companyId,
          user_id: user.id,
          tittel: formData.tittel,
          beskrivelse: formData.beskrivelse,
          hendelsestidspunkt: new Date(formData.hendelsestidspunkt).toISOString(),
          alvorlighetsgrad: formData.alvorlighetsgrad,
          status: formData.status,
          kategori: formData.kategori || null,
          lokasjon: formData.lokasjon || null,
          rapportert_av: user.email || 'Ukjent',
          mission_id: formData.mission_id || null,
          oppfolgingsansvarlig_id: formData.oppfolgingsansvarlig_id || null,
          hovedaarsak: formData.hovedaarsak || null,
          medvirkende_aarsak: formData.medvirkende_aarsak || null,
        });

      if (error) throw error;

      // Send email notification for new incident
      try {
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'notify_new_incident',
            companyId: companyId,
            incident: {
              tittel: formData.tittel,
              beskrivelse: formData.beskrivelse,
              alvorlighetsgrad: formData.alvorlighetsgrad,
              lokasjon: formData.lokasjon
            }
          }
        });
      } catch (emailError) {
        console.error('Error sending new incident notification:', emailError);
      }

      // Send email notification to follow-up responsible
      if (formData.oppfolgingsansvarlig_id) {
        await sendNotificationEmail({
          recipientId: formData.oppfolgingsansvarlig_id,
          notificationType: 'email_followup_assigned',
          subject: `Du er satt som oppfølgingsansvarlig: ${formData.tittel}`,
          htmlContent: generateIncidentNotificationHTML({
            tittel: formData.tittel,
            beskrivelse: formData.beskrivelse,
            alvorlighetsgrad: formData.alvorlighetsgrad,
            lokasjon: formData.lokasjon,
          }),
          companyId: companyId,
        });
      }

      toast.success("Hendelse rapportert!");
      onOpenChange(false);
      
    } catch (error: any) {
      console.error('Submit error:', error);
      toast.error(`Feil ved rapportering: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Rapporter hendelse</DialogTitle>
          <DialogDescription>
            Fyll ut informasjon om hendelsen
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mission">Knytt til oppdrag (valgfritt)</Label>
            <Select
              value={formData.mission_id}
              onValueChange={handleMissionSelect}
            >
              <SelectTrigger id="mission">
                <SelectValue placeholder="Velg oppdrag..." />
              </SelectTrigger>
              <SelectContent>
                {missions.map((mission) => (
                  <SelectItem key={mission.id} value={mission.id}>
                    {mission.tittel} ({mission.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tittel">Tittel *</Label>
            <Input
              id="tittel"
              value={formData.tittel}
              onChange={(e) => setFormData({ ...formData, tittel: e.target.value })}
              placeholder="Kort beskrivelse av hendelsen"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="beskrivelse">Beskrivelse</Label>
            <Textarea
              id="beskrivelse"
              value={formData.beskrivelse}
              onChange={(e) => setFormData({ ...formData, beskrivelse: e.target.value })}
              placeholder="Detaljert beskrivelse av hendelsen..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hendelsestidspunkt">Hendelsestidspunkt *</Label>
            <Input
              id="hendelsestidspunkt"
              type="datetime-local"
              value={formData.hendelsestidspunkt}
              onChange={(e) => setFormData({ ...formData, hendelsestidspunkt: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="alvorlighetsgrad">Alvorlighetsgrad</Label>
            <Select
              value={formData.alvorlighetsgrad}
              onValueChange={(value) => setFormData({ ...formData, alvorlighetsgrad: value })}
            >
              <SelectTrigger id="alvorlighetsgrad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Lav">Lav</SelectItem>
                <SelectItem value="Middels">Middels</SelectItem>
                <SelectItem value="Høy">Høy</SelectItem>
                <SelectItem value="Kritisk">Kritisk</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Åpen">Åpen</SelectItem>
                <SelectItem value="Under behandling">Under behandling</SelectItem>
                <SelectItem value="Ferdigbehandlet">Ferdigbehandlet</SelectItem>
                <SelectItem value="Lukket">Lukket</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="kategori">Kategori (valgfritt)</Label>
            <Input
              id="kategori"
              value={formData.kategori}
              onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
              placeholder="F.eks. Teknisk, Operasjonell, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hovedaarsak">Hovedårsak (valgfritt)</Label>
            <Select
              value={formData.hovedaarsak}
              onValueChange={(value) => setFormData({ ...formData, hovedaarsak: value })}
            >
              <SelectTrigger id="hovedaarsak">
                <SelectValue placeholder="Velg hovedårsak..." />
              </SelectTrigger>
              <SelectContent>
                {causeTypes.map((cause) => (
                  <SelectItem key={cause.id} value={cause.navn}>
                    {cause.navn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="medvirkende_aarsak">Medvirkende årsak (valgfritt)</Label>
            <Select
              value={formData.medvirkende_aarsak}
              onValueChange={(value) => setFormData({ ...formData, medvirkende_aarsak: value })}
            >
              <SelectTrigger id="medvirkende_aarsak">
                <SelectValue placeholder="Velg medvirkende årsak..." />
              </SelectTrigger>
              <SelectContent>
                {contributingCauses.map((cause) => (
                  <SelectItem key={cause.id} value={cause.navn}>
                    {cause.navn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lokasjon">Lokasjon (valgfritt)</Label>
            <Input
              id="lokasjon"
              value={formData.lokasjon}
              onChange={(e) => setFormData({ ...formData, lokasjon: e.target.value })}
              placeholder="F.eks. Oslo, Hangar A, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="oppfolgingsansvarlig">Oppfølgingsansvarlig (valgfritt)</Label>
            <Select
              value={formData.oppfolgingsansvarlig_id}
              onValueChange={(value) => setFormData({ ...formData, oppfolgingsansvarlig_id: value })}
            >
              <SelectTrigger id="oppfolgingsansvarlig">
                <SelectValue placeholder="Velg ansvarlig..." />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name || 'Ukjent bruker'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Avbryt
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !formData.tittel || !formData.hendelsestidspunkt}
              className="flex-1"
            >
              {submitting ? "Rapporterer..." : "Rapporter"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
