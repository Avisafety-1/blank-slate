import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./_shared";

export interface AuditInput {
  toolName: string;
  missionId?: string | null;
  companyId?: string | null;
  inputSummary: Record<string, unknown>;
  resultStatus: "ok" | "error";
  errorMessage?: string | null;
}

/**
 * Best-effort audit logger for MCP write tools. Never throws — audit
 * failures must not break the tool response the model relies on.
 */
export async function writeAudit(ctx: ToolContext, entry: AuditInput): Promise<void> {
  try {
    const userId = ctx.getUserId();
    if (!userId) return;
    // Cap input summary size to avoid runaway rows.
    const summary = truncateJson(entry.inputSummary, 2000);
    await supabaseForUser(ctx).from("mcp_write_audit").insert({
      user_id: userId,
      company_id: entry.companyId ?? null,
      tool_name: entry.toolName,
      mission_id: entry.missionId ?? null,
      input_summary: summary,
      result_status: entry.resultStatus,
      error_message: entry.errorMessage ?? null,
    });
  } catch (e) {
    console.error("[mcp_write_audit] failed", e);
  }
}

function truncateJson(obj: Record<string, unknown>, max: number): Record<string, unknown> {
  try {
    const s = JSON.stringify(obj);
    if (s.length <= max) return obj;
    return { _truncated: true, preview: s.slice(0, max) };
  } catch {
    return { _unserializable: true };
  }
}
