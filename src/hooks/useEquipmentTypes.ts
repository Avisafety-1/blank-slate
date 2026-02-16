import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useEquipmentTypes = (companyId: string, open: boolean) => {
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!companyId || !open) return;

    const fetchTypes = async () => {
      const { data } = await supabase
        .from("equipment")
        .select("type")
        .eq("company_id", companyId);

      if (data) {
        const unique = [...new Set(data.map((e) => e.type).filter(Boolean))].sort();
        setEquipmentTypes(unique);
      }
    };

    fetchTypes();
  }, [companyId, open]);

  return equipmentTypes;
};
