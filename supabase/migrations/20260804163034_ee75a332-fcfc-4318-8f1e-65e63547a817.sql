ALTER TABLE public.evaluation_responses
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS comments JSONB NOT NULL DEFAULT '{}'::jsonb;