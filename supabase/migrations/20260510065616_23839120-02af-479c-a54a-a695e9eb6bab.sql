ALTER TABLE personnel_competencies DROP CONSTRAINT personnel_competencies_type_check;
ALTER TABLE personnel_competencies ADD CONSTRAINT personnel_competencies_type_check
  CHECK (type = ANY (ARRAY['Kurs'::text, 'Sertifikat'::text, 'Lisens'::text, 'Utdanning'::text, 'Godkjenning'::text, 'Kompetanse'::text, 'Annet'::text, 'Veiledet tour'::text]));

UPDATE personnel_competencies pc
SET type = 'Veiledet tour', påvirker_status = false
FROM training_assignments ta
JOIN training_courses tc ON tc.id = ta.course_id
WHERE ta.competency_id = pc.id
  AND tc.display_mode = 'guided_tour'
  AND pc.type <> 'Veiledet tour';