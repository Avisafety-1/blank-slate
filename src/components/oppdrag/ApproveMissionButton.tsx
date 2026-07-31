import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { invokeEmailFunction } from "@/lib/emailInvoke";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";

interface ApproveMissionButtonProps {
  missionId: string;
  missionTitle?: string;
  missionCompanyId?: string | null;
  approvalStatus?: string | null;
  /** Optional pre-known assigned personnel profile ids (self-approval check) */
  personnelProfileIds?: string[];
  onApproved?: () => void;
  className?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}

export const ApproveMissionButton = ({
  missionId,
  missionTitle,
  missionCompanyId,
  approvalStatus,
  personnelProfileIds,
  onApproved,
  className,
  size = "sm",
  variant = "default",
}: ApproveMissionButtonProps) => {
  const { t } = useTranslation();
  const { user, companyId, canApproveMissions, approvalCompanyIds } = useAuth();
  const companySettings = useCompanySettings();

  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [assignedIds, setAssignedIds] = useState<string[]>(personnelProfileIds ?? []);
  const [childCompanyIds, setChildCompanyIds] = useState<string[] | null>(null);

  const isPending = approvalStatus === "pending_approval";
  const scopeIsAll = Array.isArray(approvalCompanyIds) && approvalCompanyIds.includes("all");

  // Resolve child companies when scope is "all"
  useEffect(() => {
    if (!canApproveMissions || !isPending || !scopeIsAll || !companyId || childCompanyIds) return;
    let cancelled = false;
    supabase
      .from("companies")
      .select("id")
      .eq("parent_company_id", companyId)
      .then(({ data }) => {
        if (!cancelled) setChildCompanyIds((data || []).map((c: any) => c.id));
      });
    return () => {
      cancelled = true;
    };
  }, [canApproveMissions, isPending, scopeIsAll, companyId, childCompanyIds]);

  const inScope = (() => {
    if (!canApproveMissions) return false;
    const target = missionCompanyId || companyId;
    if (!target) return false;
    if (scopeIsAll) {
      return target === companyId || (childCompanyIds || []).includes(target);
    }
    if (Array.isArray(approvalCompanyIds) && approvalCompanyIds.length > 0) {
      return approvalCompanyIds.includes(target);
    }
    return target === companyId;
  })();

  const visible = isPending && inScope;

  // Fetch assigned personnel for self-approval check when needed
  useEffect(() => {
    if (!visible || !companySettings.prevent_self_approval || personnelProfileIds) return;
    let cancelled = false;
    supabase
      .from("mission_personnel")
      .select("profile_id")
      .eq("mission_id", missionId)
      .then(({ data }) => {
        if (!cancelled) {
          setAssignedIds((data || []).map((p: any) => p.profile_id).filter(Boolean));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, companySettings.prevent_self_approval, personnelProfileIds, missionId]);

  const selfBlocked =
    companySettings.prevent_self_approval && !!user && assignedIds.includes(user.id);

  const handleApprove = async () => {
    if (!user || selfBlocked) return;
    setSaving(true);
    try {
      const { data: missionRow } = await supabase
        .from("missions")
        .select("approver_comments, company_id")
        .eq("id", missionId)
        .maybeSingle();

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("navn")
        .eq("id", user.id)
        .maybeSingle();

      const existing = Array.isArray((missionRow as any)?.approver_comments)
        ? (missionRow as any).approver_comments
        : [];
      const updatedComments = comment.trim()
        ? [
            ...existing,
            {
              author_id: user.id,
              author_name: (profileRow as any)?.navn || user.email || "",
              comment: comment.trim(),
              created_at: new Date().toISOString(),
            },
          ]
        : existing;

      const { error } = await supabase
        .from("missions")
        .update({
          approval_status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          approval_comment: comment.trim() || null,
          approver_comments: updatedComments,
        } as any)
        .eq("id", missionId);

      if (error) throw error;

      try {
        await invokeEmailFunction("send-notification-email", {
          body: {
            type: "notify_mission_approved",
            missionId,
            companyId: (missionRow as any)?.company_id || missionCompanyId || companyId,
          },
        });
      } catch (emailError) {
        console.error("Error sending approval email:", emailError);
      }

      toast.success(t("pages.missions.card.approveSuccess"));
      setOpen(false);
      setComment("");
      onApproved?.();
    } catch (err) {
      console.error("Error approving mission:", err);
      toast.error(t("pages.missions.card.approveError"));
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <Button
        size={size}
        variant="default"
        className={className}
        disabled={selfBlocked}
        title={selfBlocked ? t("profile.approval.selfBlocked") : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <CheckCircle2 className="h-4 w-4 mr-1" />
        {t("pages.missions.card.approveNow")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t("pages.missions.card.approveNow")}</DialogTitle>
            <DialogDescription>
              {t("pages.missions.card.approveConfirmDescription", {
                title: missionTitle || "",
              })}
            </DialogDescription>
          </DialogHeader>

          {selfBlocked ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t("profile.approval.selfBlocked")}
            </div>
          ) : (
            <Textarea
              placeholder={t("profile.approval.commentOptional")}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {t("profile.approval.cancel")}
            </Button>
            <Button onClick={handleApprove} disabled={saving || selfBlocked}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              {t("profile.approval.approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
