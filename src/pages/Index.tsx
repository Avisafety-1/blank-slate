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
import { Shield, Clock, Play, Square, Radio } from "lucide-react";
import { LogFlightTimeDialog } from "@/components/LogFlightTimeDialog";
import { Header } from "@/components/Header";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
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
import { useFlightTimer } from "@/hooks/useFlightTimer";
import { StartFlightDialog } from "@/components/StartFlightDialog";

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
  const { t } = useTranslation();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(defaultLayout);
  const [isApproved, setIsApproved] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(true);
  const [logFlightDialogOpen, setLogFlightDialogOpen] = useState(false);
  const [prefilledDuration, setPrefilledDuration] = useState<number | undefined>(undefined);
  const [startFlightConfirmOpen, setStartFlightConfirmOpen] = useState(false);
  
  const { isActive, elapsedSeconds, publishMode, completedChecklistIds, startFlight, endFlight, formatElapsedTime } = useFlightTimer();

  const handleStartFlight = () => {
    setStartFlightConfirmOpen(true);
  };

  const confirmStartFlight = async (missionId?: string, selectedPublishMode?: 'none' | 'advisory' | 'live_uav', checklistIds?: string[]) => {
    setStartFlightConfirmOpen(false);
    const success = await startFlight(missionId, selectedPublishMode || 'none', checklistIds || []);
    if (success) {
      const modeMessages = {
        none: t('flight.flightStarted'),
        advisory: t('flight.flightStartedAdvisory'),
        live_uav: t('flight.flightStartedLiveUav'),
      };
      toast.success(modeMessages[selectedPublishMode || 'none']);
    }
  };

  const handleEndFlight = () => {
    if (!isActive) {
      toast.error(t('flight.noActiveFlightError'));
      return;
    }
    // Calculate current elapsed minutes (round up)
    const minutes = Math.ceil(elapsedSeconds / 60);
    setPrefilledDuration(minutes);
    setLogFlightDialogOpen(true);
  };

  const handleFlightLogged = async () => {
    // Stop the timer only when flight is successfully logged
    await endFlight();
    setPrefilledDuration(undefined);
  };

  const handleLogFlightDialogClose = (open: boolean) => {
    setLogFlightDialogOpen(open);
    if (!open && prefilledDuration === undefined) {
      // Only clear if not from timer (timer clears via handleFlightLogged)
    }
  };

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
        toast.success(t('common.layoutUpdated'));

        return newLayout;
      });
    }
  };

  if (loading || checkingApproval) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Shield className="w-16 h-16 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-lg">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user || !isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <Shield className="w-16 h-16 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">{t('auth.pendingApproval')}</h2>
          <p className="text-muted-foreground mb-6">
            {t('auth.pendingDescription')}
          </p>
          <Button onClick={() => navigate("/auth")}>{t('auth.backToLogin')}</Button>
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
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.3)), url(${droneBackground})`,
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
          {/* Mobile-only flight buttons */}
          <div className="flex flex-col gap-2 mb-3 lg:hidden">
            <Button 
              onClick={() => setLogFlightDialogOpen(true)}
              className="w-full gap-2"
              variant="secondary"
            >
              <Clock className="w-4 h-4" />
              {t('actions.logFlightTime')}
            </Button>
            
            {/* Active flight timer indicator */}
            {isActive && (
              <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg border border-green-300 dark:border-green-700 text-center flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-foreground" />
                <span className="text-foreground font-mono text-sm">
                  {t('flight.activeFlight')}: {formatElapsedTime(elapsedSeconds)}
                </span>
                {publishMode !== 'none' && (
                  <Radio className="w-4 h-4 text-primary animate-pulse" />
                )}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button 
                onClick={handleStartFlight}
                disabled={isActive}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                <Play className="w-4 h-4 mr-1" />
                {t('actions.startFlight')}
              </Button>
              <Button 
                onClick={handleEndFlight}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                <Square className="w-4 h-4 mr-1" />
                {t('actions.endFlight')}
              </Button>
            </div>
          </div>

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
                    {/* AI Search Bar and Flight Log buttons */}
                    <div className="flex flex-col gap-2">
                      <AISearchBar />
                      <Button 
                        onClick={() => setLogFlightDialogOpen(true)}
                        className="w-full gap-2 hidden lg:flex"
                        variant="secondary"
                      >
                        <Clock className="w-4 h-4" />
                        {t('actions.logFlightTime')}
                      </Button>
                      
                      {/* Active flight timer indicator - Desktop */}
                      {isActive && (
                        <div className="hidden lg:flex p-2 bg-green-100 dark:bg-green-900/50 rounded-lg border border-green-300 dark:border-green-700 items-center justify-center gap-2">
                          <Clock className="w-4 h-4 text-foreground" />
                          <span className="text-foreground font-mono text-sm">
                            {t('flight.activeFlight')}: {formatElapsedTime(elapsedSeconds)}
                          </span>
                          {publishMode !== 'none' && (
                            <Radio className="w-4 h-4 text-primary animate-pulse" />
                          )}
                        </div>
                      )}
                      
                      {/* Start/End flight buttons - Desktop */}
                      <div className="hidden lg:flex gap-2">
                        <Button 
                          onClick={handleStartFlight}
                          disabled={isActive}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                        >
                          <Play className="w-4 h-4 mr-1" />
                          {t('actions.startFlight')}
                        </Button>
                        <Button 
                          onClick={handleEndFlight}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                        >
                          <Square className="w-4 h-4 mr-1" />
                          {t('actions.endFlight')}
                        </Button>
                      </div>
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
        onOpenChange={handleLogFlightDialogClose}
        prefilledDuration={prefilledDuration}
        safeskyMode={publishMode}
        completedChecklistIds={completedChecklistIds}
        onFlightLogged={handleFlightLogged}
        onStopTimer={() => {
          endFlight();
          setPrefilledDuration(undefined);
        }}
      />

      {/* Start Flight Dialog */}
      <StartFlightDialog 
        open={startFlightConfirmOpen} 
        onOpenChange={setStartFlightConfirmOpen}
        onStartFlight={confirmStartFlight}
      />
    </div>
  );
};

export default Index;
