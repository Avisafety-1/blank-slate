import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuditTaskDialog } from "./AuditTaskDialog";

/** Opens AuditTaskDialog for `?auditFinding=<id>` on any page; removes the parameter on close. */
export const AuditTaskHost = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const id = params.get("auditFinding");
  if (!user || !id) return null;
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("auditFinding");
    setParams(next, { replace: true });
  };
  return <AuditTaskDialog key={id} findingId={id} onClose={close} />;
};
