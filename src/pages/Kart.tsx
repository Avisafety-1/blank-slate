import { OpenAIPMap } from "@/components/OpenAIPMap";
import { MissionDetailDialog } from "@/components/dashboard/MissionDetailDialog";
import { Header } from "@/components/Header";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function KartPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  const handleMissionClick = (mission: any) => {
    setSelectedMission(mission);
    setMissionDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground">Laster...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col w-full overflow-hidden">
      <Header />

      {/* Map Content */}
      <div className="flex-1 relative overflow-hidden z-0">
        <OpenAIPMap onMissionClick={handleMissionClick} />
      </div>

      {/* Mission Detail Dialog */}
      <MissionDetailDialog
        open={missionDialogOpen}
        onOpenChange={setMissionDialogOpen}
        mission={selectedMission}
      />
    </div>
  );
}
