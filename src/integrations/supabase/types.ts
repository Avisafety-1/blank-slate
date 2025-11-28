export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      calendar_events: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          event_date: string
          event_time: string | null
          id: string
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          title: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          adresse: string | null
          aktiv: boolean
          created_at: string
          id: string
          kontakt_epost: string | null
          kontakt_telefon: string | null
          navn: string
          org_nummer: string | null
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          aktiv?: boolean
          created_at?: string
          id?: string
          kontakt_epost?: string | null
          kontakt_telefon?: string | null
          navn: string
          org_nummer?: string | null
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          aktiv?: boolean
          created_at?: string
          id?: string
          kontakt_epost?: string | null
          kontakt_telefon?: string | null
          navn?: string
          org_nummer?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          adresse: string | null
          aktiv: boolean
          company_id: string
          epost: string | null
          id: string
          kontaktperson: string | null
          merknader: string | null
          navn: string
          oppdatert_dato: string
          opprettet_dato: string
          telefon: string | null
          user_id: string
        }
        Insert: {
          adresse?: string | null
          aktiv?: boolean
          company_id: string
          epost?: string | null
          id?: string
          kontaktperson?: string | null
          merknader?: string | null
          navn: string
          oppdatert_dato?: string
          opprettet_dato?: string
          telefon?: string | null
          user_id: string
        }
        Update: {
          adresse?: string | null
          aktiv?: boolean
          company_id?: string
          epost?: string | null
          id?: string
          kontaktperson?: string | null
          merknader?: string | null
          navn?: string
          oppdatert_dato?: string
          opprettet_dato?: string
          telefon?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          beskrivelse: string | null
          company_id: string
          fil_navn: string | null
          fil_storrelse: number | null
          fil_url: string | null
          gyldig_til: string | null
          id: string
          kategori: string
          nettside_url: string | null
          oppdatert_dato: string | null
          opprettet_av: string | null
          opprettet_dato: string | null
          tittel: string
          user_id: string | null
          varsel_dager_for_utløp: number | null
          versjon: string | null
        }
        Insert: {
          beskrivelse?: string | null
          company_id: string
          fil_navn?: string | null
          fil_storrelse?: number | null
          fil_url?: string | null
          gyldig_til?: string | null
          id?: string
          kategori: string
          nettside_url?: string | null
          oppdatert_dato?: string | null
          opprettet_av?: string | null
          opprettet_dato?: string | null
          tittel: string
          user_id?: string | null
          varsel_dager_for_utløp?: number | null
          versjon?: string | null
        }
        Update: {
          beskrivelse?: string | null
          company_id?: string
          fil_navn?: string | null
          fil_storrelse?: number | null
          fil_url?: string | null
          gyldig_til?: string | null
          id?: string
          kategori?: string
          nettside_url?: string | null
          oppdatert_dato?: string | null
          opprettet_av?: string | null
          opprettet_dato?: string | null
          tittel?: string
          user_id?: string | null
          varsel_dager_for_utløp?: number | null
          versjon?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_equipment: {
        Row: {
          created_at: string | null
          drone_id: string
          equipment_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          drone_id: string
          equipment_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          drone_id?: string
          equipment_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drone_equipment_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      drones: {
        Row: {
          aktiv: boolean
          company_id: string
          flyvetimer: number
          id: string
          merknader: string | null
          modell: string
          neste_inspeksjon: string | null
          oppdatert_dato: string
          opprettet_dato: string
          registrering: string
          sist_inspeksjon: string | null
          status: string
          tilgjengelig: boolean
          user_id: string
        }
        Insert: {
          aktiv?: boolean
          company_id: string
          flyvetimer?: number
          id?: string
          merknader?: string | null
          modell: string
          neste_inspeksjon?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          registrering: string
          sist_inspeksjon?: string | null
          status?: string
          tilgjengelig?: boolean
          user_id: string
        }
        Update: {
          aktiv?: boolean
          company_id?: string
          flyvetimer?: number
          id?: string
          merknader?: string | null
          modell?: string
          neste_inspeksjon?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          registrering?: string
          sist_inspeksjon?: string | null
          status?: string
          tilgjengelig?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          subject: string
          template_type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          subject: string
          template_type: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          subject?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          aktiv: boolean
          company_id: string
          id: string
          merknader: string | null
          navn: string
          neste_vedlikehold: string | null
          oppdatert_dato: string
          opprettet_dato: string
          serienummer: string
          sist_vedlikeholdt: string | null
          status: string
          tilgjengelig: boolean
          type: string
          user_id: string
        }
        Insert: {
          aktiv?: boolean
          company_id: string
          id?: string
          merknader?: string | null
          navn: string
          neste_vedlikehold?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          serienummer: string
          sist_vedlikeholdt?: string | null
          status?: string
          tilgjengelig?: boolean
          type: string
          user_id: string
        }
        Update: {
          aktiv?: boolean
          company_id?: string
          id?: string
          merknader?: string | null
          navn?: string
          neste_vedlikehold?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          serienummer?: string
          sist_vedlikeholdt?: string | null
          status?: string
          tilgjengelig?: boolean
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_comments: {
        Row: {
          comment_text: string
          created_at: string
          created_by_name: string
          id: string
          incident_id: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          created_by_name: string
          id?: string
          incident_id: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          created_by_name?: string
          id?: string
          incident_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_comments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          alvorlighetsgrad: string
          beskrivelse: string | null
          company_id: string
          hendelsestidspunkt: string
          id: string
          kategori: string | null
          lokasjon: string | null
          mission_id: string | null
          oppdatert_dato: string | null
          oppfolgingsansvarlig_id: string | null
          opprettet_dato: string | null
          rapportert_av: string | null
          status: string
          tittel: string
          user_id: string | null
        }
        Insert: {
          alvorlighetsgrad: string
          beskrivelse?: string | null
          company_id: string
          hendelsestidspunkt: string
          id?: string
          kategori?: string | null
          lokasjon?: string | null
          mission_id?: string | null
          oppdatert_dato?: string | null
          oppfolgingsansvarlig_id?: string | null
          opprettet_dato?: string | null
          rapportert_av?: string | null
          status?: string
          tittel: string
          user_id?: string | null
        }
        Update: {
          alvorlighetsgrad?: string
          beskrivelse?: string | null
          company_id?: string
          hendelsestidspunkt?: string
          id?: string
          kategori?: string | null
          lokasjon?: string | null
          mission_id?: string | null
          oppdatert_dato?: string | null
          oppfolgingsansvarlig_id?: string | null
          opprettet_dato?: string | null
          rapportert_av?: string | null
          status?: string
          tittel?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_oppfolgingsansvarlig_id_fkey"
            columns: ["oppfolgingsansvarlig_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_drones: {
        Row: {
          created_at: string | null
          drone_id: string
          id: string
          mission_id: string
        }
        Insert: {
          created_at?: string | null
          drone_id: string
          id?: string
          mission_id: string
        }
        Update: {
          created_at?: string | null
          drone_id?: string
          id?: string
          mission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_drones_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_drones_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_equipment: {
        Row: {
          equipment_id: string
          id: string
          mission_id: string
        }
        Insert: {
          equipment_id: string
          id?: string
          mission_id: string
        }
        Update: {
          equipment_id?: string
          id?: string
          mission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_equipment_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_personnel: {
        Row: {
          id: string
          mission_id: string
          profile_id: string
        }
        Insert: {
          id?: string
          mission_id: string
          profile_id: string
        }
        Update: {
          id?: string
          mission_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_personnel_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_personnel_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_sora: {
        Row: {
          airspace_mitigations: string | null
          approved_at: string | null
          approved_by: string | null
          arc_initial: string | null
          arc_residual: string | null
          company_id: string
          conops_summary: string | null
          created_at: string
          environment: string | null
          fgrc: number | null
          ground_mitigations: string | null
          id: string
          igrc: number | null
          mission_id: string
          operational_limits: string | null
          prepared_at: string | null
          prepared_by: string | null
          residual_risk_comment: string | null
          residual_risk_level: string | null
          sail: string | null
          sora_status: string
          updated_at: string
        }
        Insert: {
          airspace_mitigations?: string | null
          approved_at?: string | null
          approved_by?: string | null
          arc_initial?: string | null
          arc_residual?: string | null
          company_id: string
          conops_summary?: string | null
          created_at?: string
          environment?: string | null
          fgrc?: number | null
          ground_mitigations?: string | null
          id?: string
          igrc?: number | null
          mission_id: string
          operational_limits?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          residual_risk_comment?: string | null
          residual_risk_level?: string | null
          sail?: string | null
          sora_status?: string
          updated_at?: string
        }
        Update: {
          airspace_mitigations?: string | null
          approved_at?: string | null
          approved_by?: string | null
          arc_initial?: string | null
          arc_residual?: string | null
          company_id?: string
          conops_summary?: string | null
          created_at?: string
          environment?: string | null
          fgrc?: number | null
          ground_mitigations?: string | null
          id?: string
          igrc?: number | null
          mission_id?: string
          operational_limits?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          residual_risk_comment?: string | null
          residual_risk_level?: string | null
          sail?: string | null
          sora_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_sora_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_sora_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          beskrivelse: string | null
          company_id: string
          customer_id: string | null
          id: string
          latitude: number | null
          lokasjon: string
          longitude: number | null
          merknader: string | null
          oppdatert_dato: string
          opprettet_dato: string
          risk_nivå: string
          slutt_tidspunkt: string | null
          status: string
          tidspunkt: string
          tittel: string
          user_id: string
        }
        Insert: {
          beskrivelse?: string | null
          company_id: string
          customer_id?: string | null
          id?: string
          latitude?: number | null
          lokasjon: string
          longitude?: number | null
          merknader?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          risk_nivå?: string
          slutt_tidspunkt?: string | null
          status?: string
          tidspunkt: string
          tittel: string
          user_id: string
        }
        Update: {
          beskrivelse?: string | null
          company_id?: string
          customer_id?: string | null
          id?: string
          latitude?: number | null
          lokasjon?: string
          longitude?: number | null
          merknader?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          risk_nivå?: string
          slutt_tidspunkt?: string | null
          status?: string
          tidspunkt?: string
          tittel?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      news: {
        Row: {
          company_id: string
          forfatter: string
          id: string
          innhold: string
          oppdatert_dato: string
          opprettet_dato: string
          pin_on_top: boolean
          publisert: string
          synlighet: string
          tittel: string
          user_id: string
        }
        Insert: {
          company_id: string
          forfatter: string
          id?: string
          innhold: string
          oppdatert_dato?: string
          opprettet_dato?: string
          pin_on_top?: boolean
          publisert?: string
          synlighet?: string
          tittel: string
          user_id: string
        }
        Update: {
          company_id?: string
          forfatter?: string
          id?: string
          innhold?: string
          oppdatert_dato?: string
          opprettet_dato?: string
          pin_on_top?: boolean
          publisert?: string
          synlighet?: string
          tittel?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_document_expiry: boolean
          email_followup_assigned: boolean
          email_new_incident: boolean
          email_new_mission: boolean
          email_new_user_pending: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_document_expiry?: boolean
          email_followup_assigned?: boolean
          email_new_incident?: boolean
          email_new_mission?: boolean
          email_new_user_pending?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_document_expiry?: boolean
          email_followup_assigned?: boolean
          email_new_incident?: boolean
          email_new_mission?: boolean
          email_new_user_pending?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      personnel_competencies: {
        Row: {
          beskrivelse: string | null
          id: string
          navn: string
          oppdatert_dato: string
          opprettet_dato: string
          profile_id: string
          type: string
          utloper_dato: string | null
          utstedt_dato: string | null
        }
        Insert: {
          beskrivelse?: string | null
          id?: string
          navn: string
          oppdatert_dato?: string
          opprettet_dato?: string
          profile_id: string
          type: string
          utloper_dato?: string | null
          utstedt_dato?: string | null
        }
        Update: {
          beskrivelse?: string | null
          id?: string
          navn?: string
          oppdatert_dato?: string
          opprettet_dato?: string
          profile_id?: string
          type?: string
          utloper_dato?: string | null
          utstedt_dato?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_competencies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          company_id: string
          created_at: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          company_id: string
          created_at?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          company_id?: string
          created_at?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "operativ_leder"
        | "pilot"
        | "tekniker"
        | "lesetilgang"
        | "superadmin"
        | "operatør"
        | "saksbehandler"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "operativ_leder",
        "pilot",
        "tekniker",
        "lesetilgang",
        "superadmin",
        "operatør",
        "saksbehandler",
      ],
    },
  },
} as const
