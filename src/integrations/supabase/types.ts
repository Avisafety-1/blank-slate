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
      active_flights: {
        Row: {
          company_id: string
          created_at: string
          drone_id: string | null
          dronetag_device_id: string | null
          id: string
          mission_id: string | null
          pilot_name: string | null
          profile_id: string
          publish_mode: string | null
          route_data: Json | null
          safesky_published: boolean | null
          start_lat: number | null
          start_lng: number | null
          start_time: string
        }
        Insert: {
          company_id: string
          created_at?: string
          drone_id?: string | null
          dronetag_device_id?: string | null
          id?: string
          mission_id?: string | null
          pilot_name?: string | null
          profile_id: string
          publish_mode?: string | null
          route_data?: Json | null
          safesky_published?: boolean | null
          start_lat?: number | null
          start_lng?: number | null
          start_time?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          drone_id?: string | null
          dronetag_device_id?: string | null
          id?: string
          mission_id?: string | null
          pilot_name?: string | null
          profile_id?: string
          publish_mode?: string | null
          route_data?: Json | null
          safesky_published?: boolean | null
          start_lat?: number | null
          start_lng?: number | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_flights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_flights_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_flights_dronetag_device_id_fkey"
            columns: ["dronetag_device_id"]
            isOneToOne: false
            referencedRelation: "dronetag_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_flights_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_flights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          before_takeoff_checklist_id: string | null
          before_takeoff_checklist_ids: string[] | null
          created_at: string
          id: string
          kontakt_epost: string | null
          kontakt_telefon: string | null
          navn: string
          org_nummer: string | null
          registration_code: string
          selskapstype: string | null
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          aktiv?: boolean
          before_takeoff_checklist_id?: string | null
          before_takeoff_checklist_ids?: string[] | null
          created_at?: string
          id?: string
          kontakt_epost?: string | null
          kontakt_telefon?: string | null
          navn: string
          org_nummer?: string | null
          registration_code: string
          selskapstype?: string | null
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          aktiv?: boolean
          before_takeoff_checklist_id?: string | null
          before_takeoff_checklist_ids?: string[] | null
          created_at?: string
          id?: string
          kontakt_epost?: string | null
          kontakt_telefon?: string | null
          navn?: string
          org_nummer?: string | null
          registration_code?: string
          selskapstype?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_before_takeoff_checklist_id_fkey"
            columns: ["before_takeoff_checklist_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
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
          global_visibility: boolean | null
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
          global_visibility?: boolean | null
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
          global_visibility?: boolean | null
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
      drone_accessories: {
        Row: {
          company_id: string
          created_at: string | null
          drone_id: string
          id: string
          navn: string
          neste_vedlikehold: string | null
          sist_vedlikehold: string | null
          updated_at: string | null
          user_id: string
          varsel_dager: number | null
          vedlikeholdsintervall_dager: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          drone_id: string
          id?: string
          navn: string
          neste_vedlikehold?: string | null
          sist_vedlikehold?: string | null
          updated_at?: string | null
          user_id: string
          varsel_dager?: number | null
          vedlikeholdsintervall_dager?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          drone_id?: string
          id?: string
          navn?: string
          neste_vedlikehold?: string | null
          sist_vedlikehold?: string | null
          updated_at?: string | null
          user_id?: string
          varsel_dager?: number | null
          vedlikeholdsintervall_dager?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drone_accessories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_accessories_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
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
      drone_equipment_history: {
        Row: {
          action: string
          company_id: string
          created_at: string | null
          drone_id: string
          id: string
          item_id: string | null
          item_name: string
          item_type: string
          user_id: string
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string | null
          drone_id: string
          id?: string
          item_id?: string | null
          item_name: string
          item_type: string
          user_id: string
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string | null
          drone_id?: string
          id?: string
          item_id?: string | null
          item_name?: string
          item_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drone_equipment_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_equipment_history_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_inspections: {
        Row: {
          company_id: string
          created_at: string | null
          drone_id: string
          id: string
          inspection_date: string
          inspection_type: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          drone_id: string
          id?: string
          inspection_date: string
          inspection_type?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          drone_id?: string
          id?: string
          inspection_date?: string
          inspection_type?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drone_inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_inspections_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_log_entries: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          drone_id: string
          entry_date: string
          entry_type: string | null
          id: string
          title: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          drone_id: string
          entry_date: string
          entry_type?: string | null
          id?: string
          title: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          drone_id?: string
          entry_date?: string
          entry_type?: string | null
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drone_log_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_log_entries_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_personnel: {
        Row: {
          created_at: string | null
          drone_id: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          drone_id: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          drone_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drone_personnel_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_personnel_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_telemetry: {
        Row: {
          alt: number | null
          created_at: string | null
          drone_id: string | null
          id: string
          lat: number | null
          lon: number | null
          raw: Json | null
        }
        Insert: {
          alt?: number | null
          created_at?: string | null
          drone_id?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          raw?: Json | null
        }
        Update: {
          alt?: number | null
          created_at?: string | null
          drone_id?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          raw?: Json | null
        }
        Relationships: []
      }
      drones: {
        Row: {
          aktiv: boolean
          company_id: string
          flyvetimer: number
          id: string
          inspection_interval_days: number | null
          inspection_start_date: string | null
          kjøpsdato: string | null
          klasse: string | null
          merknader: string | null
          modell: string
          neste_inspeksjon: string | null
          oppdatert_dato: string
          opprettet_dato: string
          payload: number | null
          serienummer: string
          sist_inspeksjon: string | null
          sjekkliste_id: string | null
          status: string
          tilgjengelig: boolean
          user_id: string
          varsel_dager: number | null
          vekt: number | null
        }
        Insert: {
          aktiv?: boolean
          company_id: string
          flyvetimer?: number
          id?: string
          inspection_interval_days?: number | null
          inspection_start_date?: string | null
          kjøpsdato?: string | null
          klasse?: string | null
          merknader?: string | null
          modell: string
          neste_inspeksjon?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          payload?: number | null
          serienummer: string
          sist_inspeksjon?: string | null
          sjekkliste_id?: string | null
          status?: string
          tilgjengelig?: boolean
          user_id: string
          varsel_dager?: number | null
          vekt?: number | null
        }
        Update: {
          aktiv?: boolean
          company_id?: string
          flyvetimer?: number
          id?: string
          inspection_interval_days?: number | null
          inspection_start_date?: string | null
          kjøpsdato?: string | null
          klasse?: string | null
          merknader?: string | null
          modell?: string
          neste_inspeksjon?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          payload?: number | null
          serienummer?: string
          sist_inspeksjon?: string | null
          sjekkliste_id?: string | null
          status?: string
          tilgjengelig?: boolean
          user_id?: string
          varsel_dager?: number | null
          vekt?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drones_sjekkliste_id_fkey"
            columns: ["sjekkliste_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dronetag_devices: {
        Row: {
          callsign: string | null
          company_id: string | null
          created_at: string
          description: string | null
          device_id: string
          drone_id: string | null
          id: string
          kjopsdato: string | null
          name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          callsign?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          device_id: string
          drone_id?: string | null
          id?: string
          kjopsdato?: string | null
          name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          callsign?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          device_id?: string
          drone_id?: string | null
          id?: string
          kjopsdato?: string | null
          name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dronetag_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dronetag_devices_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      dronetag_positions: {
        Row: {
          alt_agl: number | null
          alt_msl: number | null
          battery: number | null
          company_id: string | null
          created_at: string
          device_id: string
          heading: number | null
          id: string
          lat: number | null
          lng: number | null
          speed: number | null
          status: Json | null
          timestamp: string
          vert_speed: number | null
        }
        Insert: {
          alt_agl?: number | null
          alt_msl?: number | null
          battery?: number | null
          company_id?: string | null
          created_at?: string
          device_id: string
          heading?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          speed?: number | null
          status?: Json | null
          timestamp: string
          vert_speed?: number | null
        }
        Update: {
          alt_agl?: number | null
          alt_msl?: number | null
          battery?: number | null
          company_id?: string | null
          created_at?: string
          device_id?: string
          heading?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          speed?: number | null
          status?: Json | null
          timestamp?: string
          vert_speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dronetag_positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dronetag_positions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "dronetag_devices"
            referencedColumns: ["device_id"]
          },
        ]
      }
      email_settings: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean | null
          from_email: string | null
          from_name: string | null
          id: string
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_secure: boolean | null
          smtp_user: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
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
          flyvetimer: number
          id: string
          merknader: string | null
          navn: string
          neste_vedlikehold: string | null
          oppdatert_dato: string
          opprettet_dato: string
          serienummer: string
          sist_vedlikeholdt: string | null
          sjekkliste_id: string | null
          status: string
          tilgjengelig: boolean
          type: string
          user_id: string
          varsel_dager: number | null
          vedlikehold_startdato: string | null
          vedlikeholdsintervall_dager: number | null
          vekt: number | null
        }
        Insert: {
          aktiv?: boolean
          company_id: string
          flyvetimer?: number
          id?: string
          merknader?: string | null
          navn: string
          neste_vedlikehold?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          serienummer: string
          sist_vedlikeholdt?: string | null
          sjekkliste_id?: string | null
          status?: string
          tilgjengelig?: boolean
          type: string
          user_id: string
          varsel_dager?: number | null
          vedlikehold_startdato?: string | null
          vedlikeholdsintervall_dager?: number | null
          vekt?: number | null
        }
        Update: {
          aktiv?: boolean
          company_id?: string
          flyvetimer?: number
          id?: string
          merknader?: string | null
          navn?: string
          neste_vedlikehold?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          serienummer?: string
          sist_vedlikeholdt?: string | null
          sjekkliste_id?: string | null
          status?: string
          tilgjengelig?: boolean
          type?: string
          user_id?: string
          varsel_dager?: number | null
          vedlikehold_startdato?: string | null
          vedlikeholdsintervall_dager?: number | null
          vekt?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_sjekkliste_id_fkey"
            columns: ["sjekkliste_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_log_entries: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          entry_date: string
          entry_type: string | null
          equipment_id: string
          id: string
          title: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          entry_date: string
          entry_type?: string | null
          equipment_id: string
          id?: string
          title: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          entry_date?: string
          entry_type?: string | null
          equipment_id?: string
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_log_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_log_entries_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_log_equipment: {
        Row: {
          equipment_id: string
          flight_log_id: string
          id: string
        }
        Insert: {
          equipment_id: string
          flight_log_id: string
          id?: string
        }
        Update: {
          equipment_id?: string
          flight_log_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_log_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_log_equipment_flight_log_id_fkey"
            columns: ["flight_log_id"]
            isOneToOne: false
            referencedRelation: "flight_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_log_personnel: {
        Row: {
          flight_log_id: string
          id: string
          profile_id: string
        }
        Insert: {
          flight_log_id: string
          id?: string
          profile_id: string
        }
        Update: {
          flight_log_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_log_personnel_flight_log_id_fkey"
            columns: ["flight_log_id"]
            isOneToOne: false
            referencedRelation: "flight_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_log_personnel_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_logs: {
        Row: {
          company_id: string
          completed_checklists: string[] | null
          created_at: string | null
          departure_location: string
          drone_id: string | null
          dronetag_device_id: string | null
          flight_date: string
          flight_duration_minutes: number
          flight_track: Json | null
          id: string
          landing_location: string
          mission_id: string | null
          movements: number
          notes: string | null
          safesky_mode: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          completed_checklists?: string[] | null
          created_at?: string | null
          departure_location: string
          drone_id?: string | null
          dronetag_device_id?: string | null
          flight_date?: string
          flight_duration_minutes: number
          flight_track?: Json | null
          id?: string
          landing_location: string
          mission_id?: string | null
          movements?: number
          notes?: string | null
          safesky_mode?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          completed_checklists?: string[] | null
          created_at?: string | null
          departure_location?: string
          drone_id?: string | null
          dronetag_device_id?: string | null
          flight_date?: string
          flight_duration_minutes?: number
          flight_track?: Json | null
          id?: string
          landing_location?: string
          mission_id?: string | null
          movements?: number
          notes?: string | null
          safesky_mode?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_logs_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_logs_dronetag_device_id_fkey"
            columns: ["dronetag_device_id"]
            isOneToOne: false
            referencedRelation: "dronetag_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_logs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_cause_types: {
        Row: {
          aktiv: boolean
          beskrivelse: string | null
          created_at: string | null
          id: string
          navn: string
          rekkefolge: number
        }
        Insert: {
          aktiv?: boolean
          beskrivelse?: string | null
          created_at?: string | null
          id?: string
          navn: string
          rekkefolge?: number
        }
        Update: {
          aktiv?: boolean
          beskrivelse?: string | null
          created_at?: string | null
          id?: string
          navn?: string
          rekkefolge?: number
        }
        Relationships: []
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
      incident_contributing_causes: {
        Row: {
          aktiv: boolean
          beskrivelse: string | null
          created_at: string | null
          id: string
          navn: string
          rekkefolge: number
        }
        Insert: {
          aktiv?: boolean
          beskrivelse?: string | null
          created_at?: string | null
          id?: string
          navn: string
          rekkefolge?: number
        }
        Update: {
          aktiv?: boolean
          beskrivelse?: string | null
          created_at?: string | null
          id?: string
          navn?: string
          rekkefolge?: number
        }
        Relationships: []
      }
      incidents: {
        Row: {
          alvorlighetsgrad: string
          beskrivelse: string | null
          company_id: string
          hendelsestidspunkt: string
          hovedaarsak: string | null
          id: string
          kategori: string | null
          lokasjon: string | null
          medvirkende_aarsak: string | null
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
          hovedaarsak?: string | null
          id?: string
          kategori?: string | null
          lokasjon?: string | null
          medvirkende_aarsak?: string | null
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
          hovedaarsak?: string | null
          id?: string
          kategori?: string | null
          lokasjon?: string | null
          medvirkende_aarsak?: string | null
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
      mission_documents: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          mission_id: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          mission_id: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          mission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_documents_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
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
          route: Json | null
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
          route?: Json | null
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
          route?: Json | null
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
          email_inspection_reminder: boolean
          email_new_incident: boolean
          email_new_mission: boolean
          email_new_user_pending: boolean
          id: string
          inspection_reminder_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_document_expiry?: boolean
          email_followup_assigned?: boolean
          email_inspection_reminder?: boolean
          email_new_incident?: boolean
          email_new_mission?: boolean
          email_new_user_pending?: boolean
          id?: string
          inspection_reminder_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_document_expiry?: boolean
          email_followup_assigned?: boolean
          email_inspection_reminder?: boolean
          email_new_incident?: boolean
          email_new_mission?: boolean
          email_new_user_pending?: boolean
          id?: string
          inspection_reminder_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nsm_restriction_zones: {
        Row: {
          created_at: string | null
          description: string | null
          external_id: string | null
          geometry: unknown
          id: string
          name: string | null
          properties: Json | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry?: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
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
          påvirker_status: boolean
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
          påvirker_status?: boolean
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
          påvirker_status?: boolean
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
          adresse: string | null
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          company_id: string
          created_at: string | null
          email: string | null
          flyvetimer: number | null
          full_name: string | null
          id: string
          nødkontakt_navn: string | null
          nødkontakt_telefon: string | null
          telefon: string | null
          tittel: string | null
          updated_at: string | null
        }
        Insert: {
          adresse?: string | null
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          company_id: string
          created_at?: string | null
          email?: string | null
          flyvetimer?: number | null
          full_name?: string | null
          id: string
          nødkontakt_navn?: string | null
          nødkontakt_telefon?: string | null
          telefon?: string | null
          tittel?: string | null
          updated_at?: string | null
        }
        Update: {
          adresse?: string | null
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          company_id?: string
          created_at?: string | null
          email?: string | null
          flyvetimer?: number | null
          full_name?: string | null
          id?: string
          nødkontakt_navn?: string | null
          nødkontakt_telefon?: string | null
          telefon?: string | null
          tittel?: string | null
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
      rpas_5km_zones: {
        Row: {
          created_at: string | null
          description: string | null
          external_id: string | null
          geometry: unknown
          id: string
          name: string | null
          properties: Json | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry?: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rpas_ctr_tiz: {
        Row: {
          created_at: string | null
          description: string | null
          external_id: string | null
          geometry: unknown
          id: string
          name: string | null
          properties: Json | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry?: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      safesky_beacons: {
        Row: {
          altitude: number | null
          beacon_type: string | null
          callsign: string | null
          course: number | null
          ground_speed: number | null
          id: string
          latitude: number
          longitude: number
          updated_at: string | null
          vertical_speed: number | null
        }
        Insert: {
          altitude?: number | null
          beacon_type?: string | null
          callsign?: string | null
          course?: number | null
          ground_speed?: number | null
          id: string
          latitude: number
          longitude: number
          updated_at?: string | null
          vertical_speed?: number | null
        }
        Update: {
          altitude?: number | null
          beacon_type?: string | null
          callsign?: string | null
          course?: number | null
          ground_speed?: number | null
          id?: string
          latitude?: number
          longitude?: number
          updated_at?: string | null
          vertical_speed?: number | null
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
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
      email_settings_safe: {
        Row: {
          company_id: string | null
          created_at: string | null
          enabled: boolean | null
          from_email: string | null
          from_name: string | null
          id: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_secure: boolean | null
          smtp_user: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          id?: string | null
          smtp_host?: string | null
          smtp_pass?: never
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          id?: string | null
          smtp_host?: string | null
          smtp_pass?: never
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      add_drone_flight_hours: {
        Args: { p_drone_id: string; p_minutes: number }
        Returns: undefined
      }
      add_equipment_flight_hours: {
        Args: { p_equipment_id: string; p_minutes: number }
        Returns: undefined
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      check_mission_airspace: {
        Args: { p_lat: number; p_lon: number; p_route_points?: Json }
        Returns: Json
      }
      check_mission_zone_conflicts: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: {
          distance_meters: number
          is_inside: boolean
          zone_id: string
          zone_name: string
          zone_type: string
        }[]
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_company_by_registration_code: {
        Args: { p_code: string }
        Returns: {
          company_id: string
          company_name: string
        }[]
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      gettransactionid: { Args: never; Returns: unknown }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_email_settings: {
        Args: {
          p_company_id: string
          p_enabled: boolean
          p_from_email: string
          p_from_name: string
          p_smtp_host: string
          p_smtp_pass: string
          p_smtp_port: number
          p_smtp_secure: boolean
          p_smtp_user: string
        }
        Returns: undefined
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_geojson_feature: {
        Args: {
          p_description: string
          p_external_id: string
          p_geometry_geojson: string
          p_name: string
          p_properties: Json
          p_table_name: string
        }
        Returns: string
      }
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
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
