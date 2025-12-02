import droneBackground from "@/assets/drone-background.png";
import { DocumentSection } from "@/components/dashboard/DocumentSection";
import { AISearchBar } from "@/components/dashboard/AISearchBar";
import { StatusPanel } from "@/components/dashboard/StatusPanel";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { IncidentsSection } from "@/components/dashboard/IncidentsSection";
import { MissionsSection } from "@/components/dashboard/MissionsSection";
import { KPIChart } from "@/components/dashboard/KPIChart";
import { NewsSection } from "@/components/dashboard/NewsSection";
import { DraggableSection } from "@/components/dashboard/DraggableSection";
import { Shield, Clock } from "lucide-react";
import { LogFlightTimeDialog } from "@/components/LogFlightTimeDialog";
import { Header } from "@/components/Header";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STORAGE_KEY = "dashboard-layout";

const defaultLayout = [
  { id: "documents", component: "documents" },
  { id: "news", component: "news" },
  { id: "calendar", component: "calendar" },
  { id: "status", component: "status" },
  { id: "missions", component: "missions" },
  { id: "incidents", component: "incidents" },
  { id: "kpi", component: "kpi" },
];

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(defaultLayout);
  const [isApproved, setIsApproved] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(true);
  const [logFlightDialogOpen, setLogFlightDialogOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      checkUserApproval();
    }
  }, [user]);

  const checkUserApproval = async () => {
    setCheckingApproval(true);
    try {
      const { data: profileData } = await supabase.from("profiles").select("approved").eq("id", user?.id).maybeSingle();

      if (profileData) {
        setIsApproved((profileData as any).approved);

        if (!(profileData as any).approved) {
          // User is not approved, sign them out
          await signOut();
        }
      }
    } catch (error) {
      console.error("Error checking approval:", error);
    } finally {
      setCheckingApproval(false);
    }
  };

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  useEffect(() => {
    const savedLayout = localStorage.getItem(STORAGE_KEY);
    if (savedLayout) {
      try {
        setLayout(JSON.parse(savedLayout));
      } catch (e) {
        console.error("Failed to parse saved layout:", e);
      }
    }
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLayout((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newLayout = [...items];
        const [movedItem] = newLayout.splice(oldIndex, 1);
        newLayout.splice(newIndex, 0, movedItem);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(newLayout));
        toast.success("Layout oppdatert");

        return newLayout;
      });
    }
  };

  if (loading || checkingApproval) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Shield className="w-16 h-16 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-lg">Laster...</p>
        </div>
      </div>
    );
  }

  if (!user || !isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <Shield className="w-16 h-16 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Avventer godkjenning</h2>
          <p className="text-muted-foreground mb-6">
            Din konto venter på godkjenning fra administrator. Du vil motta tilgang så snart kontoen er godkjent.
          </p>
          <Button onClick={() => navigate("/auth")}>Tilbake til innlogging</Button>
        </div>
      </div>
    );
  }

  const renderSection = (component: string) => {
    switch (component) {
      case "documents":
        return <DocumentSection />;
      case "news":
        return <NewsSection />;
      case "status":
        return <StatusPanel />;
      case "missions":
        return <MissionsSection />;
      case "calendar":
        return <CalendarWidget />;
      case "incidents":
        return <IncidentsSection />;
      case "kpi":
        return <KPIChart />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden">
      {/* Background with gradient overlay */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(${droneBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full">
        <Header />

        {/* Main Content */}
        <main className="w-full px-3 sm:px-4 py-3 sm:py-5">
          {/* Mobile-only Log Flight Time button */}
          <Button 
            onClick={() => setLogFlightDialogOpen(true)}
            className="w-full gap-2 mb-3 lg:hidden"
            variant="secondary"
          >
            <Clock className="w-4 h-4" />
            Logg flytid
          </Button>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={layout.map((item) => item.id)} strategy={rectSortingStrategy}>
              <div className="space-y-3 sm:space-y-4">
                {/* Top Row - News and Status */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
                  <div className="lg:col-span-9">
                    {layout
                      .filter((item) => item.component === "news")
                      .map((item) => (
                        <DraggableSection key={item.id} id={item.id}>
                          {renderSection(item.component)}
                        </DraggableSection>
                      ))}
                  </div>
                  <div className="lg:col-span-3">
                    {layout
                      .filter((item) => item.component === "status")
                      .map((item) => (
                        <DraggableSection key={item.id} id={item.id}>
                          {renderSection(item.component)}
                        </DraggableSection>
                      ))}
                  </div>
                </div>

                {/* Main Row - Sidebars with center content */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
                  {/* Left Column */}
                  <div className="lg:col-span-3 flex flex-col gap-3 sm:gap-4">
                    {layout
                      .filter((item) => ["documents", "calendar"].includes(item.component))
                      .map((item) => (
                        <DraggableSection key={item.id} id={item.id}>
                          {renderSection(item.component)}
                        </DraggableSection>
                      ))}
                  </div>

                  {/* Center Column - Drone space and missions */}
                  <div className="lg:col-span-6 flex flex-col gap-3 sm:gap-4 h-full">
                    {/* AI Search Bar and Flight Log button */}
                    <div className="flex gap-2 items-center">
                      <div className="flex-1">
                        <AISearchBar />
                      </div>
                      <Button 
                        onClick={() => setLogFlightDialogOpen(true)}
                        className="gap-2 shrink-0 hidden lg:flex"
                        variant="secondary"
                      >
                        <Clock className="w-4 h-4" />
                        Logg flytid
                      </Button>
                    </div>

                    {/* Missions - pushed to bottom with mt-auto */}
                    <div className="mt-auto">
                      {layout &&
                        layout.length > 0 &&
                        layout
                          .filter((item) => item.component === "missions")
                          .map((item) => (
                            <DraggableSection key={item.id} id={item.id}>
                              {renderSection(item.component)}
                            </DraggableSection>
                          ))}
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="lg:col-span-3 flex flex-col gap-3 sm:gap-4">
                    {layout
                      .filter((item) => item.component === "incidents")
                      .map((item) => (
                        <DraggableSection key={item.id} id={item.id} className="flex-1">
                          {renderSection(item.component)}
                        </DraggableSection>
                      ))}
                    {layout
                      .filter((item) => item.component === "kpi")
                      .map((item) => (
                        <DraggableSection key={item.id} id={item.id}>
                          {renderSection(item.component)}
                        </DraggableSection>
                      ))}
                  </div>
                </div>
              </div>
            </SortableContext>
          </DndContext>
        </main>
      </div>

      {/* Log Flight Time Dialog */}
      <LogFlightTimeDialog 
        open={logFlightDialogOpen} 
        onOpenChange={setLogFlightDialogOpen} 
      />
    </div>
  );
};

export default Index;
