import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Checklist {
  id: string;
  tittel: string;
}

export const useChecklists = () => {
  const { companyId } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchChecklists = async () => {
      if (!companyId) {
        setChecklists([]);
        setIsLoading(false);
        return;
      }

      try {
        // Fetch checklists from own company OR globally visible checklists
        const { data, error } = await supabase
          .from("documents")
          .select("id, tittel, global_visibility")
          .eq("kategori", "sjekklister")
          .or(`company_id.eq.${companyId},global_visibility.eq.true`)
          .order("tittel");

        if (error) throw error;
        setChecklists(data || []);
      } catch (error) {
        console.error("Error fetching checklists:", error);
        setChecklists([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChecklists();
  }, [companyId]);

  return { checklists, isLoading };
};
