
-- Add array column for multiple operations checklists
ALTER TABLE public.drones
ADD COLUMN IF NOT EXISTS operations_checklist_ids text[] DEFAULT '{}';

-- Migrate existing single checklist to array
UPDATE public.drones
SET operations_checklist_ids = ARRAY[operations_checklist_id]
WHERE operations_checklist_id IS NOT NULL
  AND (operations_checklist_ids IS NULL OR operations_checklist_ids = '{}');
