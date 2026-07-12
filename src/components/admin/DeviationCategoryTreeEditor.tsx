import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Check, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { translateDeviationCategory } from "@/lib/i18nHelpers";

const AVISAFE_PRESET: { label: string; children?: string[] }[] = [
  
  { label: "Klima", children: ["Ising (propell/kontrollflater)", "Nedbør (regn/yr/vått vær)", "Vind og vindkast"] },
  { label: "Teknisk svikt", children: ["Kompassforstyrrelse", "GNSS (forstyrrelse/tap av signal)", "Programvare", "Radiokontakt (C2)", "Batteri", "Flysensor", "Strukturell", "Kommunikasjon (Multi-CREW)", "Montering"] },
  { label: "Nærhet (separasjon)", children: ["Annen drone (UA)", "Småfly (GA)", "Trafikkfly"] },
  { label: "Overskridelse", children: ["Autorisasjon", "Avstandsbegrensning (horisontal)", "Energireserve", "Høydebegrensning (vertikal)", "Luftromsavgrensning (Airspace Infringement)", "MTOM", "Radiorekkevidde (BRLOS)", "VLOS (BLOS)"] },
  { label: "Pilot (PIC)", children: ["Forstyrrelse under operasjon", "Ukvalifisert", "Udyktig (IMSAFE)"] },
  { label: "Mangelfull lysføring" },
  { label: "(N)MAC fugl (kollisjon/nær kollisjon med fugl)" },
  { label: "Annet (beskriv i kommentarfelt)" },
];

interface CategoryNode {
  id: string;
  parent_id: string | null;
  label: string;
  sort_order: number;
  children: CategoryNode[];
}

interface DbCategory {
  id: string;
  parent_id: string | null;
  label: string;
  sort_order: number;
  company_id: string;
}

interface Props {
  companyId: string;
  readOnly?: boolean;
}

function buildTree(rows: DbCategory[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
  const roots: CategoryNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export const DeviationCategoryTreeEditor = ({ companyId, readOnly = false }: Props) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addingUnder, setAddingUnder] = useState<string | "root" | null>(null);
  const [newLabel, setNewLabel] = useState("");

  const fetchRows = async () => {
    setLoading(true);
    if (readOnly) {
      // Use RPC to bypass RLS for inherited categories from parent company
      const { data, error } = await (supabase as any).rpc("get_effective_deviation_categories", {
        _company_id: companyId,
      });
      if (error) {
        toast.error(t("admin.deviationCategory.errorLoading"));
      } else {
        setRows(data || []);
      }
    } else {
      const { data, error } = await (supabase as any)
        .from("deviation_report_categories")
        .select("id, parent_id, label, sort_order, company_id")
        .eq("company_id", companyId);
      if (error) {
        toast.error(t("admin.deviationCategory.errorLoading"));
      } else {
        setRows(data || []);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (companyId) fetchRows();
  }, [companyId]);

  const tree = buildTree(rows);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addCategory = async (parentId: string | null) => {
    if (!newLabel.trim()) return;
    const siblings = rows.filter((r) => r.parent_id === parentId);
    const sortOrder = siblings.length;
    const { error } = await (supabase as any).from("deviation_report_categories").insert({
      company_id: companyId,
      parent_id: parentId,
      label: newLabel.trim(),
      sort_order: sortOrder,
    });
    if (error) {
      toast.error(t("admin.deviationCategory.errorAdding"));
    } else {
      toast.success(t("admin.deviationCategory.categoryAdded"));
      setNewLabel("");
      setAddingUnder(null);
      if (parentId) setExpanded((p) => new Set(p).add(parentId));
      fetchRows();
    }
  };

  const saveEdit = async (id: string) => {
    if (!editValue.trim()) return;
    const { error } = await (supabase as any)
      .from("deviation_report_categories")
      .update({ label: editValue.trim() })
      .eq("id", id);
    if (error) {
      toast.error(t("admin.deviationCategory.errorSaving"));
    } else {
      setEditingId(null);
      fetchRows();
    }
  };

  const deleteNode = async (id: string) => {
    if (!confirm(t("admin.deviationCategory.confirmDelete"))) return;
    const { error } = await (supabase as any)
      .from("deviation_report_categories")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(t("admin.deviationCategory.errorDeleting"));
    } else {
      toast.success(t("admin.deviationCategory.deleted"));
      fetchRows();
    }
  };

  const move = async (node: CategoryNode, direction: -1 | 1) => {
    const siblings = rows
      .filter((r) => r.parent_id === node.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((s) => s.id === node.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const a = siblings[idx];
    const b = siblings[swapIdx];
    await (supabase as any)
      .from("deviation_report_categories")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);
    await (supabase as any)
      .from("deviation_report_categories")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);
    fetchRows();
  };

  const applyAviSafePreset = async () => {
    if (rows.length > 0) {
      if (!confirm(t("admin.deviationCategory.confirmApplyPreset"))) return;
    }
    const existingRoots = rows.filter((r) => r.parent_id === null).length;
    const rootRows = AVISAFE_PRESET.map((p, i) => ({
      company_id: companyId,
      parent_id: null as string | null,
      label: p.label,
      sort_order: existingRoots + i,
    }));
    const { data: insertedRoots, error: rootErr } = await (supabase as any)
      .from("deviation_report_categories")
      .insert(rootRows)
      .select("id, label, sort_order");
    if (rootErr || !insertedRoots) {
      toast.error(t("admin.deviationCategory.errorAddingPreset"));
      return;
    }
    const childRows: any[] = [];
    AVISAFE_PRESET.forEach((p, i) => {
      if (!p.children?.length) return;
      const parent = insertedRoots.find((r: any) => r.label === p.label && r.sort_order === existingRoots + i);
      if (!parent) return;
      p.children.forEach((c, ci) => {
        childRows.push({ company_id: companyId, parent_id: parent.id, label: c, sort_order: ci });
      });
    });
    if (childRows.length) {
      const { error: childErr } = await (supabase as any).from("deviation_report_categories").insert(childRows);
      if (childErr) {
        toast.error(t("admin.deviationCategory.rootAddedChildFailed"));
        fetchRows();
        return;
      }
    }
    toast.success(t("admin.deviationCategory.presetAdded"));
    fetchRows();
  };

  const renderNode = (node: CategoryNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 py-1 hover:bg-muted/50 rounded px-1"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          <button
            type="button"
            className="w-5 h-5 flex items-center justify-center text-muted-foreground"
            onClick={() => hasChildren && toggle(node.id)}
          >
            {hasChildren ? (
              isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            ) : (
              <span className="w-4 h-4" />
            )}
          </button>

          {editingId === node.id ? (
            <>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-7 text-sm flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(node.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(node.id)}>
                <Check className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                <X className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm">{translateDeviationCategory(node.label)}</span>
              {!readOnly && (
                <>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(node, -1)} title={t("admin.deviationCategory.moveUp")}>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(node, 1)} title={t("admin.deviationCategory.moveDown")}>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setAddingUnder(node.id)}
                    title={t("admin.deviationCategory.addSubcategory")}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditingId(node.id);
                      setEditValue(node.label);
                    }}
                    title={t("admin.common.edit")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => deleteNode(node.id)}
                    title={t("admin.common.delete")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        {addingUnder === node.id && (
          <div className="flex items-center gap-1 py-1" style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("admin.deviationCategory.newSubcategory")}
              className="h-7 text-sm flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory(node.id);
                if (e.key === "Escape") {
                  setAddingUnder(null);
                  setNewLabel("");
                }
              }}
            />
            <Button size="sm" className="h-7" onClick={() => addCategory(node.id)}>
              {t("admin.common.add")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setAddingUnder(null);
                setNewLabel("");
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {hasChildren && isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  if (loading) return <p className="text-xs text-muted-foreground">{t("admin.common.loadingEllipsis")}</p>;

  return (
    <div className="space-y-2">
      {tree.length === 0 && addingUnder !== "root" && (
        <p className="text-xs text-muted-foreground">
          {t("admin.deviationCategory.noCategoriesDefined")}
        </p>
      )}
      <div className="border rounded-md p-2 bg-background/50 max-h-80 overflow-y-auto">
        {tree.map((node) => renderNode(node, 0))}
        {addingUnder === "root" && (
          <div className="flex items-center gap-1 py-1 px-1">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("admin.deviationCategory.newRootCategory")}
              className="h-7 text-sm flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory(null);
                if (e.key === "Escape") {
                  setAddingUnder(null);
                  setNewLabel("");
                }
              }}
            />
            <Button size="sm" className="h-7" onClick={() => addCategory(null)}>
              {t("admin.common.add")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setAddingUnder(null);
                setNewLabel("");
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
      {!readOnly && addingUnder !== "root" && (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setAddingUnder("root")}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t("admin.deviationCategory.addRootCategory")}
          </Button>
          <Button size="sm" variant="outline" onClick={applyAviSafePreset}>
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            {t("admin.deviationCategory.useAvisafePreset")}
          </Button>
        </div>
      )}
    </div>
  );
};
