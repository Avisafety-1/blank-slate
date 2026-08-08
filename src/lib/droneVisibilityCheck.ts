import { supabase } from "@/integrations/supabase/client";

export type ResourceKind = "document" | "equipment" | "personnel";

export interface MissingVisibility {
  resourceType: ResourceKind;
  resourceId: string;
  resourceName: string;
  /** company_id for the resource owner (used for equipment_department_visibility insert) */
  resourceCompanyId: string | null;
  /** Department company_ids that the resource is NOT visible to */
  missingDeptIds: string[];
}

export interface DepartmentInfo {
  id: string;
  navn: string;
}

/**
 * Check whether all resources linked to a drone are visible to the given target departments.
 * Returns one entry per (resource, missing-dept) gap.
 *
 * Exception: a personnel link is ignored if the person is the drone's technical responsible
 * AND belongs to the drone's owner company (i.e. the company sharing the drone downward).
 */
/** Fetch parent_company_id for each department, so we can evaluate visible_to_children correctly. */
async function fetchDeptParents(deptIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (deptIds.length === 0) return map;
  const { data } = await supabase
    .from("companies")
    .select("id, parent_company_id")
    .in("id", deptIds);
  for (const row of data || []) map.set(row.id, row.parent_company_id ?? null);
  return map;
}

interface DocVisibilityRow {
  id: string;
  tittel: string | null;
  company_id: string | null;
  visible_to_children: boolean | null;
  global_visibility: boolean | null;
}

/** Fetch explicit per-department sharing rows for the given documents. */
async function fetchDocShares(docIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (docIds.length === 0) return map;
  const { data } = await (supabase as any)
    .from("document_department_visibility")
    .select("document_id, company_id")
    .in("document_id", docIds);
  for (const row of data || []) {
    if (!map.has(row.document_id)) map.set(row.document_id, new Set());
    map.get(row.document_id)!.add(row.company_id);
  }
  return map;
}

/** Mirrors the runtime visibility rules used when listing documents/checklists. */
function docMissingDepts(
  doc: DocVisibilityRow,
  targetDeptIds: string[],
  deptParents: Map<string, string | null>,
  sharedWith?: Set<string>,
): string[] {
  if (doc.global_visibility) return [];
  return targetDeptIds.filter((deptId) => {
    if (deptId === doc.company_id) return false;
    if (sharedWith?.has(deptId)) return false;
    if (doc.visible_to_children && doc.company_id && deptParents.get(deptId) === doc.company_id) return false;
    return true;
  });
}


export async function checkDroneResourceVisibility(
  droneId: string,
  targetDeptIds: string[],
  options?: { droneCompanyId?: string | null; technicalResponsibleId?: string | null },
): Promise<MissingVisibility[]> {
  if (!droneId || targetDeptIds.length === 0) return [];
  const droneCompanyId = options?.droneCompanyId ?? null;
  const technicalResponsibleId = options?.technicalResponsibleId ?? null;

  const missing: MissingVisibility[] = [];
  const deptParents = await fetchDeptParents(targetDeptIds);

  // 0. Checklist columns directly on the drone (sjekkliste_id, operations_checklist_ids, post_flight_checklist_id)
  const { data: droneRow } = await (supabase as any)
    .from("drones")
    .select("sjekkliste_id, operations_checklist_ids, post_flight_checklist_id")
    .eq("id", droneId)
    .maybeSingle();

  const checklistIds = new Set<string>();
  if (droneRow?.sjekkliste_id) checklistIds.add(droneRow.sjekkliste_id);
  if (droneRow?.post_flight_checklist_id) checklistIds.add(droneRow.post_flight_checklist_id);
  for (const id of droneRow?.operations_checklist_ids || []) {
    if (id) checklistIds.add(id);
  }

  const checklistDocs: DocVisibilityRow[] = checklistIds.size > 0
    ? (((await (supabase as any)
        .from("documents")
        .select("id, tittel, company_id, visible_to_children, global_visibility")
        .in("id", Array.from(checklistIds))).data) || [])
    : [];

  // 1. Documents
  const { data: docLinks } = await (supabase as any)
    .from("drone_documents")
    .select("document:document_id(id, tittel, company_id, visible_to_children, global_visibility)")
    .eq("drone_id", droneId);

  const linkedDocs = (docLinks || [])
    .map((l: any) => l.document as DocVisibilityRow | null)
    .filter(Boolean) as DocVisibilityRow[];

  const allDocs: DocVisibilityRow[] = [];
  for (const doc of [...checklistDocs, ...linkedDocs]) {
    if (!allDocs.some((d) => d.id === doc.id)) allDocs.push(doc);
  }

  const docShares = await fetchDocShares(allDocs.map((d) => d.id));

  for (const doc of allDocs) {
    const missingFor = docMissingDepts(doc, targetDeptIds, deptParents, docShares.get(doc.id));
    if (missingFor.length > 0) {
      missing.push({
        resourceType: "document",
        resourceId: doc.id,
        resourceName: doc.tittel || "Uten tittel",
        resourceCompanyId: doc.company_id,
        missingDeptIds: missingFor,
      });
    }
  }



  // 2. Equipment
  const { data: eqLinks } = await supabase
    .from("drone_equipment")
    .select("equipment:equipment_id(id, navn, company_id)")
    .eq("drone_id", droneId);

  const equipmentList = (eqLinks || [])
    .map((l: any) => l.equipment)
    .filter(Boolean);

  if (equipmentList.length > 0) {
    const eqIds = equipmentList.map((e: any) => e.id);
    const { data: visRows } = await (supabase as any)
      .from("equipment_department_visibility")
      .select("equipment_id, company_id")
      .in("equipment_id", eqIds);

    const visMap = new Map<string, Set<string>>();
    for (const row of visRows || []) {
      if (!visMap.has(row.equipment_id)) visMap.set(row.equipment_id, new Set());
      visMap.get(row.equipment_id)!.add(row.company_id);
    }

    for (const eq of equipmentList) {
      const visibleSet = visMap.get(eq.id);
      const missingFor = targetDeptIds.filter((d) => {
        if (d === eq.company_id) return false;
        // If no visibility rows exist at all, equipment is owner-only → missing
        // If some rows exist, check membership
        if (!visibleSet) return true;
        return !visibleSet.has(d);
      });
      if (missingFor.length > 0) {
        missing.push({
          resourceType: "equipment",
          resourceId: eq.id,
          resourceName: eq.navn || "Uten navn",
          resourceCompanyId: eq.company_id,
          missingDeptIds: missingFor,
        });
      }
    }
  }

  // 3. Personnel — info-only (cannot auto-grant visibility)
  const { data: persLinks } = await (supabase as any)
    .from("drone_personnel")
    .select("profile:profile_id(id, full_name, company_id)")
    .eq("drone_id", droneId);

  for (const link of persLinks || []) {
    const p = link.profile;
    if (!p) continue;
    // Exception: technical responsible belonging to the drone's owner company is OK
    if (
      technicalResponsibleId &&
      p.id === technicalResponsibleId &&
      droneCompanyId &&
      p.company_id === droneCompanyId
    ) {
      continue;
    }
    const missingFor = targetDeptIds.filter((d) => d !== p.company_id);
    if (missingFor.length > 0) {
      missing.push({
        resourceType: "personnel",
        resourceId: p.id,
        resourceName: p.full_name || "Ukjent",
        resourceCompanyId: p.company_id,
        missingDeptIds: missingFor,
      });
    }
  }

  return missing;
}

/**
 * Check whether the checklist document linked to an equipment is visible to the given
 * target departments. Equipment links only a single checklist document today
 * (equipment.sjekkliste_id), so the result will contain at most one entry.
 */
export async function checkEquipmentResourceVisibility(
  equipmentId: string,
  targetDeptIds: string[],
): Promise<MissingVisibility[]> {
  if (!equipmentId || targetDeptIds.length === 0) return [];

  const { data: eq } = await (supabase as any)
    .from("equipment")
    .select("sjekkliste_id")
    .eq("id", equipmentId)
    .maybeSingle();

  const checklistId = eq?.sjekkliste_id;
  if (!checklistId) return [];

  const { data: doc } = await (supabase as any)
    .from("documents")
    .select("id, tittel, company_id, visible_to_children, global_visibility")
    .eq("id", checklistId)
    .maybeSingle();

  if (!doc) return [];

  const deptParents = await fetchDeptParents(targetDeptIds);
  const shares = await fetchDocShares([doc.id]);
  const missingFor = docMissingDepts(doc as DocVisibilityRow, targetDeptIds, deptParents, shares.get(doc.id));


  if (missingFor.length === 0) return [];

  return [
    {
      resourceType: "document",
      resourceId: doc.id,
      resourceName: doc.tittel || "Uten tittel",
      resourceCompanyId: doc.company_id,
      missingDeptIds: missingFor,
    },
  ];
}

/**
 * Auto-grant visibility for documents and equipment. Personnel cannot be auto-fixed.
 *
 * Documents are shared explicitly per department via `document_department_visibility`.
 * Ownership and global visibility are never changed here — sharing a document with a
 * department must not make it visible to every company in the system.
 */
export async function grantMissingVisibility(missing: MissingVisibility[]): Promise<void> {
  const docRows: { document_id: string; company_id: string }[] = [];
  for (const m of missing) {
    if (m.resourceType !== "document") continue;
    for (const dept of m.missingDeptIds) {
      docRows.push({ document_id: m.resourceId, company_id: dept });
    }
  }
  if (docRows.length > 0) {
    const { error } = await (supabase as any)
      .from("document_department_visibility")
      .upsert(docRows, { onConflict: "document_id,company_id", ignoreDuplicates: true });
    if (error) throw error;
  }


  // Equipment: insert visibility rows for each (equipment, missing dept)
  const eqRows: { equipment_id: string; company_id: string }[] = [];
  for (const m of missing) {
    if (m.resourceType !== "equipment") continue;
    for (const dept of m.missingDeptIds) {
      eqRows.push({ equipment_id: m.resourceId, company_id: dept });
    }
  }
  if (eqRows.length > 0) {
    // Upsert-style: ignore conflicts on duplicate
    const { error } = await (supabase as any)
      .from("equipment_department_visibility")
      .upsert(eqRows, { onConflict: "equipment_id,company_id", ignoreDuplicates: true });
    if (error) throw error;
  }
}

