CREATE TABLE public.mcp_write_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  tool_name text NOT NULL,
  mission_id uuid,
  input_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_status text NOT NULL DEFAULT 'ok',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.mcp_write_audit TO authenticated;
GRANT ALL ON public.mcp_write_audit TO service_role;

ALTER TABLE public.mcp_write_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own MCP audit"
  ON public.mcp_write_audit FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read visible-company MCP audit"
  ON public.mcp_write_audit FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superadmin')
    )
    AND company_id = ANY (public.get_user_visible_company_ids(auth.uid()))
  );

CREATE POLICY "Users insert own MCP audit"
  ON public.mcp_write_audit FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_mcp_write_audit_user ON public.mcp_write_audit(user_id, created_at DESC);
CREATE INDEX idx_mcp_write_audit_mission ON public.mcp_write_audit(mission_id);
CREATE INDEX idx_mcp_write_audit_company ON public.mcp_write_audit(company_id, created_at DESC);