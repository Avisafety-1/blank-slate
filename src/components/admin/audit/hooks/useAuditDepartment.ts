import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ALL_DEPARTMENTS } from "../lib/complianceView";

/** Selected department, remembered in the URL as ?dept=<company id>. null = all departments. */
export function useAuditDepartment() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("dept");
  const dept = raw && raw !== ALL_DEPARTMENTS ? raw : null;
  const setDept = useCallback(
    (id: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!id || id === ALL_DEPARTMENTS) next.delete("dept");
          else next.set("dept", id);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return { dept, setDept };
}
