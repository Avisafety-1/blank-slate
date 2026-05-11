## Migrasjon 1 — FK-indekser (kun `CREATE INDEX IF NOT EXISTS`)

Ingen RLS, ingen drop, ingen policy-endringer. Idempotent: kan kjøres flere ganger uten effekt.

### SQL

```sql
-- active_flights
CREATE INDEX IF NOT EXISTS idx_active_flights_company_id ON public.active_flights(company_id);
CREATE INDEX IF NOT EXISTS idx_active_flights_drone_id ON public.active_flights(drone_id);
CREATE INDEX IF NOT EXISTS idx_active_flights_dronetag_device_id ON public.active_flights(dronetag_device_id);
CREATE INDEX IF NOT EXISTS idx_active_flights_mission_id ON public.active_flights(mission_id);

-- bulk_email_campaigns
CREATE INDEX IF NOT EXISTS idx_bulk_email_campaigns_sent_by ON public.bulk_email_campaigns(sent_by);

-- calendar_events
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON public.calendar_events(user_id);

-- calendar_subscriptions
CREATE INDEX IF NOT EXISTS idx_calendar_subscriptions_company_id ON public.calendar_subscriptions(company_id);

-- companies
CREATE INDEX IF NOT EXISTS idx_companies_before_takeoff_checklist_id ON public.companies(before_takeoff_checklist_id);
CREATE INDEX IF NOT EXISTS idx_companies_billing_user_id ON public.companies(billing_user_id);
CREATE INDEX IF NOT EXISTS idx_companies_parent_company_id ON public.companies(parent_company_id);

-- company_subscriptions
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_billing_user_id ON public.company_subscriptions(billing_user_id);

-- customers
CREATE INDEX IF NOT EXISTS idx_customers_intern_poc_id ON public.customers(intern_poc_id);

-- deviation_report_categories
CREATE INDEX IF NOT EXISTS idx_deviation_report_categories_parent_id ON public.deviation_report_categories(parent_id);

-- document_folder_items
CREATE INDEX IF NOT EXISTS idx_document_folder_items_document_id ON public.document_folder_items(document_id);
CREATE INDEX IF NOT EXISTS idx_document_folder_items_tab_id ON public.document_folder_items(tab_id);

-- document_folder_tabs
CREATE INDEX IF NOT EXISTS idx_document_folder_tabs_folder_id ON public.document_folder_tabs(folder_id);

-- document_folders
CREATE INDEX IF NOT EXISTS idx_document_folders_company_id ON public.document_folders(company_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_created_by ON public.document_folders(created_by);

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);

-- drone_accessories
CREATE INDEX IF NOT EXISTS idx_drone_accessories_company_id ON public.drone_accessories(company_id);
CREATE INDEX IF NOT EXISTS idx_drone_accessories_drone_id ON public.drone_accessories(drone_id);

-- drone_department_visibility
CREATE INDEX IF NOT EXISTS idx_drone_department_visibility_company_id ON public.drone_department_visibility(company_id);

-- drone_documents
CREATE INDEX IF NOT EXISTS idx_drone_documents_company_id ON public.drone_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_drone_documents_document_id ON public.drone_documents(document_id);

-- drone_equipment_history
CREATE INDEX IF NOT EXISTS idx_drone_equipment_history_company_id ON public.drone_equipment_history(company_id);
CREATE INDEX IF NOT EXISTS idx_drone_equipment_history_drone_id ON public.drone_equipment_history(drone_id);

-- drone_inspections
CREATE INDEX IF NOT EXISTS idx_drone_inspections_company_id ON public.drone_inspections(company_id);
CREATE INDEX IF NOT EXISTS idx_drone_inspections_drone_id ON public.drone_inspections(drone_id);

-- drone_log_entries
CREATE INDEX IF NOT EXISTS idx_drone_log_entries_company_id ON public.drone_log_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_drone_log_entries_drone_id ON public.drone_log_entries(drone_id);

-- drone_personnel
CREATE INDEX IF NOT EXISTS idx_drone_personnel_profile_id ON public.drone_personnel(profile_id);

-- drones
CREATE INDEX IF NOT EXISTS idx_drones_operations_checklist_id ON public.drones(operations_checklist_id);
CREATE INDEX IF NOT EXISTS idx_drones_post_flight_checklist_id ON public.drones(post_flight_checklist_id);
CREATE INDEX IF NOT EXISTS idx_drones_technical_responsible_id ON public.drones(technical_responsible_id);

-- dronetag_devices
CREATE INDEX IF NOT EXISTS idx_dronetag_devices_company_id ON public.dronetag_devices(company_id);

-- email_template_attachments
CREATE INDEX IF NOT EXISTS idx_email_template_attachments_document_id ON public.email_template_attachments(document_id);

-- equipment_department_visibility
CREATE INDEX IF NOT EXISTS idx_equipment_department_visibility_company_id ON public.equipment_department_visibility(company_id);

-- equipment_log_entries
CREATE INDEX IF NOT EXISTS idx_equipment_log_entries_company_id ON public.equipment_log_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_log_entries_equipment_id ON public.equipment_log_entries(equipment_id);

-- fh2_credential_audit
CREATE INDEX IF NOT EXISTS idx_fh2_credential_audit_user_id ON public.fh2_credential_audit(user_id);

-- flight_events
CREATE INDEX IF NOT EXISTS idx_flight_events_company_id ON public.flight_events(company_id);
CREATE INDEX IF NOT EXISTS idx_flight_events_flight_log_id ON public.flight_events(flight_log_id);

-- flight_log_equipment
CREATE INDEX IF NOT EXISTS idx_flight_log_equipment_equipment_id ON public.flight_log_equipment(equipment_id);

-- flight_log_personnel
CREATE INDEX IF NOT EXISTS idx_flight_log_personnel_profile_id ON public.flight_log_personnel(profile_id);

-- flight_logs
CREATE INDEX IF NOT EXISTS idx_flight_logs_drone_id ON public.flight_logs(drone_id);
CREATE INDEX IF NOT EXISTS idx_flight_logs_dronetag_device_id ON public.flight_logs(dronetag_device_id);
CREATE INDEX IF NOT EXISTS idx_flight_logs_mission_id ON public.flight_logs(mission_id);

-- incident_comments
CREATE INDEX IF NOT EXISTS idx_incident_comments_user_id ON public.incident_comments(user_id);

-- incidents
CREATE INDEX IF NOT EXISTS idx_incidents_drone_id ON public.incidents(drone_id);
CREATE INDEX IF NOT EXISTS idx_incidents_oppfolgingsansvarlig_id ON public.incidents(oppfolgingsansvarlig_id);
CREATE INDEX IF NOT EXISTS idx_incidents_pilot_id ON public.incidents(pilot_id);
CREATE INDEX IF NOT EXISTS idx_incidents_user_id ON public.incidents(user_id);

-- map_viewer_heartbeats
CREATE INDEX IF NOT EXISTS idx_map_viewer_heartbeats_user_id ON public.map_viewer_heartbeats(user_id);

-- marketing_content_ideas
CREATE INDEX IF NOT EXISTS idx_marketing_content_ideas_company_id ON public.marketing_content_ideas(company_id);
CREATE INDEX IF NOT EXISTS idx_marketing_content_ideas_created_by ON public.marketing_content_ideas(created_by);

-- marketing_drafts
CREATE INDEX IF NOT EXISTS idx_marketing_drafts_company_id ON public.marketing_drafts(company_id);
CREATE INDEX IF NOT EXISTS idx_marketing_drafts_created_by ON public.marketing_drafts(created_by);
CREATE INDEX IF NOT EXISTS idx_marketing_drafts_idea_id ON public.marketing_drafts(idea_id);

-- marketing_media
CREATE INDEX IF NOT EXISTS idx_marketing_media_company_id ON public.marketing_media(company_id);
CREATE INDEX IF NOT EXISTS idx_marketing_media_created_by ON public.marketing_media(created_by);
CREATE INDEX IF NOT EXISTS idx_marketing_media_draft_id ON public.marketing_media(draft_id);

-- mission_deviation_reports
CREATE INDEX IF NOT EXISTS idx_mission_deviation_reports_reported_by ON public.mission_deviation_reports(reported_by);

-- mission_documents
CREATE INDEX IF NOT EXISTS idx_mission_documents_document_id ON public.mission_documents(document_id);

-- mission_equipment
CREATE INDEX IF NOT EXISTS idx_mission_equipment_equipment_id ON public.mission_equipment(equipment_id);

-- mission_personnel
CREATE INDEX IF NOT EXISTS idx_mission_personnel_profile_id ON public.mission_personnel(profile_id);
CREATE INDEX IF NOT EXISTS idx_mission_personnel_role_id ON public.mission_personnel(role_id);

-- mission_risk_assessments
CREATE INDEX IF NOT EXISTS idx_mission_risk_assessments_pilot_id ON public.mission_risk_assessments(pilot_id);

-- mission_sora
CREATE INDEX IF NOT EXISTS idx_mission_sora_approved_by ON public.mission_sora(approved_by);
CREATE INDEX IF NOT EXISTS idx_mission_sora_prepared_by ON public.mission_sora(prepared_by);

-- missions
CREATE INDEX IF NOT EXISTS idx_missions_approved_by ON public.missions(approved_by);
CREATE INDEX IF NOT EXISTS idx_missions_customer_id ON public.missions(customer_id);

-- newsletter_broadcasts
CREATE INDEX IF NOT EXISTS idx_newsletter_broadcasts_created_by ON public.newsletter_broadcasts(created_by);

-- newsletter_templates
CREATE INDEX IF NOT EXISTS idx_newsletter_templates_created_by ON public.newsletter_templates(created_by);

-- pending_dji_logs
CREATE INDEX IF NOT EXISTS idx_pending_dji_logs_matched_battery_id ON public.pending_dji_logs(matched_battery_id);
CREATE INDEX IF NOT EXISTS idx_pending_dji_logs_matched_drone_id ON public.pending_dji_logs(matched_drone_id);
CREATE INDEX IF NOT EXISTS idx_pending_dji_logs_user_id ON public.pending_dji_logs(user_id);

-- personnel_competencies
CREATE INDEX IF NOT EXISTS idx_personnel_competencies_profile_id ON public.personnel_competencies(profile_id);

-- personnel_log_entries
CREATE INDEX IF NOT EXISTS idx_personnel_log_entries_company_id ON public.personnel_log_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_personnel_log_entries_profile_id ON public.personnel_log_entries(profile_id);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_approved_by ON public.profiles(approved_by);

-- revenue_calculator_scenarios
CREATE INDEX IF NOT EXISTS idx_revenue_calculator_scenarios_company_id ON public.revenue_calculator_scenarios(company_id);
CREATE INDEX IF NOT EXISTS idx_revenue_calculator_scenarios_updated_by ON public.revenue_calculator_scenarios(updated_by);

-- training_assignments
CREATE INDEX IF NOT EXISTS idx_training_assignments_company_id ON public.training_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_training_assignments_competency_id ON public.training_assignments(competency_id);
CREATE INDEX IF NOT EXISTS idx_training_assignments_profile_id ON public.training_assignments(profile_id);

-- training_course_folders
CREATE INDEX IF NOT EXISTS idx_training_course_folders_company_id ON public.training_course_folders(company_id);
CREATE INDEX IF NOT EXISTS idx_training_course_folders_created_by ON public.training_course_folders(created_by);

-- training_courses
CREATE INDEX IF NOT EXISTS idx_training_courses_company_id ON public.training_courses(company_id);
CREATE INDEX IF NOT EXISTS idx_training_courses_created_by ON public.training_courses(created_by);
CREATE INDEX IF NOT EXISTS idx_training_courses_folder_id ON public.training_courses(folder_id);
CREATE INDEX IF NOT EXISTS idx_training_courses_source_manual_id ON public.training_courses(source_manual_id);

-- training_question_options
CREATE INDEX IF NOT EXISTS idx_training_question_options_question_id ON public.training_question_options(question_id);

-- training_questions
CREATE INDEX IF NOT EXISTS idx_training_questions_course_id ON public.training_questions(course_id);

-- user_invitations
CREATE INDEX IF NOT EXISTS idx_user_invitations_accepted_user_id ON public.user_invitations(accepted_user_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_inviter_company_id ON public.user_invitations(inviter_company_id);
```

### Oppsummering
- **95 indekser** dekker alle FK-kolonner i public uten eksisterende indeks (verifisert mot `pg_constraint` + `pg_index`).
- Kun `CREATE INDEX IF NOT EXISTS` — ingen `DROP`, ingen `ALTER`, ingen RLS- eller policy-endringer.
- Idempotent og reversibel (kan dropes individuelt senere).
- Ingen funksjonelle endringer — appen og edge functions er uberørt.

Si fra om du vil at jeg kjører dette via migration-tool, eller om du vil endre/fjerne noen indekser fra listen først.