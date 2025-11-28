import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface PendingApprovalsBadgeProps {
  isAdmin: boolean;
}

export const PendingApprovalsBadge = ({ isAdmin }: PendingApprovalsBadgeProps) => {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchPendingCount = async () => {
      try {
        // @ts-ignore - Approved column might not be in types yet
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("approved", false);
        
        if (data) {
          setPendingCount(data.length);
        }
      } catch (error) {
        console.error("Error fetching pending count:", error);
      }
    };

    fetchPendingCount();

    // Set up realtime subscription for profile changes
    const channel = supabase
      .channel("pending-approvals")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
        },
        () => {
          fetchPendingCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  if (!isAdmin || pendingCount === 0) return null;

  return (
    <Badge 
      variant="destructive" 
      className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full"
    >
      {pendingCount}
    </Badge>
  );
};
