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
import { ActiveFlightsSection } from "@/components/dashboard/ActiveFlightsSection";
import { Shield, Clock, Play, Square, Radio, MapPin, AlertTriangle } from "lucide-react";
import { LogFlightTimeDialog } from "@/components/LogFlightTimeDialog";
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
  const { user, loading, isApproved } = useAuth();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(defaultLayout);
  const [logFlightDialogOpen, setLogFlightDialogOpen] = useState(false);
  const [prefilledDuration, setPrefilledDuration] = useState<number | undefined>(undefined);
  const [startFlightConfirmOpen, setStartFlightConfirmOpen] = useState(false);
  const [pendingFlightData, setPendingFlightData] = useState<{
    missionId: string | null;
    flightTrack: Array<{ lat: number; lng: number; alt: number; timestamp: string }>;
    dronetagDeviceId: string | null;
    startPosition: { lat: number; lng: number } | null;
    pilotName: string | null;
    startTime: Date | null;
    publishMode: 'none' | 'advisory' | 'live_uav';
    completedChecklistIds: string[];
  } | null>(null);
  
  const { isActive, startTime, elapsedSeconds, missionId: activeMissionId, publishMode, completedChecklistIds, dronetagDeviceId: activeFlightDronetagId, startFlight, prepareEndFlight, endFlight, formatElapsedTime } = useFlightTimer();
  
  // Track if DroneTag positions are being recorded
  const [trackingStatus, setTrackingStatus] = useState<'checking' | 'recording' | 'not_recording'>('checking');
  const [hasActiveFlights, setHasActiveFlights] = useState(false);
  // Check for recent DroneTag positions when flight is active with real-time updates
  useEffect(() => {
    if (!isActive || !activeFlightDronetagId || !startTime) {
      setTrackingStatus('checking');
      return;
    }

    let deviceId: string | null = null;

    const checkTrackingStatus = async () => {
      try {
        // Get the device_id from dronetag_devices
        const { data: device } = await supabase
          .from('dronetag_devices')
          .select('device_id')
          .eq('id', activeFlightDronetagId)
          .single();

        if (!device) {
          setTrackingStatus('not_recording');
          return null;
        }

        deviceId = device.device_id;

        // Check for positions since flight start
        const { data: positions, error } = await supabase
          .from('dronetag_positions')
          .select('id')
          .eq('device_id', device.device_id)
          .gte('timestamp', startTime.toISOString())
          .limit(1);

        if (error) {
          console.error('Error checking tracking status:', error);
          setTrackingStatus('not_recording');
          return device.device_id;
        }

        setTrackingStatus(positions && positions.length > 0 ? 'recording' : 'not_recording');
        return device.device_id;
      } catch (err) {
        console.error('Error checking tracking status:', err);
        setTrackingStatus('not_recording');
        return null;
      }
    };

    // Check immediately, then set up real-time subscription
    checkTrackingStatus().then((resolvedDeviceId) => {
      if (resolvedDeviceId) {
        // Subscribe to real-time updates for this device
        const channel = supabase
          .channel(`dronetag-tracking-${resolvedDeviceId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'dronetag_positions',
              filter: `device_id=eq.${resolvedDeviceId}`
            },
            () => {
              setTrackingStatus('recording');
            }
          )
          .subscribe();

        // Store channel reference for cleanup
        (window as any).__dronetagTrackingChannel = channel;
      }
    });

    return () => {
      const channel = (window as any).__dronetagTrackingChannel;
      if (channel) {
        supabase.removeChannel(channel);
        delete (window as any).__dronetagTrackingChannel;
      }
    };
  }, [isActive, activeFlightDronetagId, startTime]);

  const handleStartFlight = () => {
    setStartFlightConfirmOpen(true);
  };

  const confirmStartFlight = async (
    missionId?: string, 
    selectedPublishMode?: 'none' | 'advisory' | 'live_uav', 
    checklistIds?: string[],
    startPosition?: { lat: number; lng: number },
    pilotName?: string,
    dronetagDeviceId?: string
  ) => {
    setStartFlightConfirmOpen(false);
    const success = await startFlight(missionId, selectedPublishMode || 'none', checklistIds || [], startPosition, pilotName, dronetagDeviceId);
    if (success) {
      const modeMessages = {
        none: t('flight.flightStarted'),
        advisory: t('flight.flightStartedAdvisory'),
        live_uav: t('flight.flightStartedLiveUav'),
      };
      toast.success(modeMessages[selectedPublishMode || 'none']);
    }
  };

  const handleEndFlight = async () => {
    if (!isActive) {
      toast.error(t('flight.noActiveFlightError'));
      return;
    }
    
    // Prepare data WITHOUT ending the flight - flight continues running
    const result = await prepareEndFlight();
    if (result) {
      setPrefilledDuration(result.elapsedMinutes);
      setPendingFlightData({
        missionId: result.missionId,
        flightTrack: result.flightTrack,
        dronetagDeviceId: result.dronetagDeviceId,
        startPosition: result.startPosition,
        pilotName: result.pilotName,
        startTime: result.startTime,
        publishMode: result.publishMode,
        completedChecklistIds: result.completedChecklistIds,
      });
      setLogFlightDialogOpen(true);
    }
  };

  const handleFlightLogged = async () => {
    // NOW actually end the flight when user confirms logging
    await endFlight();
    setPrefilledDuration(undefined);
    setPendingFlightData(null);
    toast.success(t('flight.flightEnded'));
  };

  const handleLogFlightDialogClose = (open: boolean) => {
    setLogFlightDialogOpen(open);
    if (!open && !isActive) {
      // Only clear pending data if flight has been ended (user confirmed logging)
      setPrefilledDuration(undefined);
      setPendingFlightData(null);
    }
    // If flight is still active (user cancelled dialog), keep pending data for next attempt
  };

  useEffect(() => {
    if (!loading && !user && navigator.onLine) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <img 
            src="/avisafe-logo-text.png" 
            alt="AviSafe" 
            className="h-20 w-auto mx-auto mb-4 animate-pulse" 
          />
          <p className="text-lg">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const isOfflineWithCachedSession = !navigator.onLine && user;

  if (!user || (!isApproved && !isOfflineWithCachedSession)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <img 
            src="/avisafe-logo-text.png" 
            alt="AviSafe" 
            className="h-20 w-auto mx-auto mb-4" 
          />
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
              <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg border border-green-300 dark:border-green-700 text-center flex flex-col gap-1">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4 text-foreground" />
                  <span className="text-foreground font-mono text-sm">
                    {t('flight.activeFlight')}: {formatElapsedTime(elapsedSeconds)}
                  </span>
                  {publishMode !== 'none' && (
                    <Radio className="w-4 h-4 text-primary animate-pulse" />
                  )}
                </div>
                {/* DroneTag tracking status */}
                {activeFlightDronetagId && (
                  <div className={`flex items-center justify-center gap-1 text-xs ${
                    trackingStatus === 'recording' 
                      ? 'text-green-700 dark:text-green-400' 
                      : trackingStatus === 'not_recording'
                      ? 'text-yellow-700 dark:text-yellow-400'
                      : 'text-muted-foreground'
                  }`}>
                    {trackingStatus === 'recording' ? (
                      <>
                        <MapPin className="w-3 h-3" />
                        <span>{t('flight.trackRecording', 'Spor registreres')}</span>
                      </>
                    ) : trackingStatus === 'not_recording' ? (
                      <>
                        <AlertTriangle className="w-3 h-3" />
                        <span>{t('flight.trackNotRecording', 'Ingen DroneTag-data')}</span>
                      </>
                    ) : (
                      <span>{t('common.checking', 'Sjekker...')}</span>
                    )}
                  </div>
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

            {/* Mobile: Active flights (only shown if there are active flights) */}
            {hasActiveFlights && (
              <div className="lg:hidden mt-3 sm:mt-4">
                <ActiveFlightsSection />
              </div>
            )}
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
                    {/* Mobile: AI Search Bar between News and Status */}
                    <div className="lg:hidden mt-3 sm:mt-4">
                      <AISearchBar />
                    </div>
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

                {/* Mobile/Tablet: Missions right after Status */}
                <div className="lg:hidden">
                  {layout
                    .filter((item) => item.component === "missions")
                    .map((item) => (
                      <DraggableSection key={`mobile-${item.id}`} id={item.id}>
                        {renderSection(item.component)}
                      </DraggableSection>
                    ))}
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
                    {/* Flight Log buttons */}
                    <div className="flex flex-col gap-2">
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
                        <div className="hidden lg:flex flex-col p-2 bg-green-100 dark:bg-green-900/50 rounded-lg border border-green-300 dark:border-green-700 gap-1">
                          <div className="flex items-center justify-center gap-2">
                            <Clock className="w-4 h-4 text-foreground" />
                            <span className="text-foreground font-mono text-sm">
                              {t('flight.activeFlight')}: {formatElapsedTime(elapsedSeconds)}
                            </span>
                            {publishMode !== 'none' && (
                              <Radio className="w-4 h-4 text-primary animate-pulse" />
                            )}
                          </div>
                          {/* DroneTag tracking status */}
                          {activeFlightDronetagId && (
                            <div className={`flex items-center justify-center gap-1 text-xs ${
                              trackingStatus === 'recording' 
                                ? 'text-green-700 dark:text-green-400' 
                                : trackingStatus === 'not_recording'
                                ? 'text-yellow-700 dark:text-yellow-400'
                                : 'text-muted-foreground'
                            }`}>
                              {trackingStatus === 'recording' ? (
                                <>
                                  <MapPin className="w-3 h-3" />
                                  <span>{t('flight.trackRecording', 'Spor registreres')}</span>
                                </>
                              ) : trackingStatus === 'not_recording' ? (
                                <>
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>{t('flight.trackNotRecording', 'Ingen DroneTag-data')}</span>
                                </>
                              ) : (
                                <span>{t('common.checking', 'Sjekker...')}</span>
                              )}
                            </div>
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

                    {/* Active flights - Desktop */}
                    <div className="hidden lg:block">
                      <ActiveFlightsSection onHasFlightsChange={setHasActiveFlights} />
                    </div>

                    {/* Missions - Desktop only (mobile shows after status) */}
                    <div className="mt-auto hidden lg:block">
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
        safeskyMode={pendingFlightData?.publishMode || publishMode}
        completedChecklistIds={pendingFlightData?.completedChecklistIds || completedChecklistIds}
        prefilledMissionId={pendingFlightData?.missionId || activeMissionId || undefined}
        flightTrack={pendingFlightData?.flightTrack}
        dronetagDeviceId={pendingFlightData?.dronetagDeviceId || undefined}
        startPosition={pendingFlightData?.startPosition || undefined}
        pilotName={pendingFlightData?.pilotName || undefined}
        flightStartTime={pendingFlightData?.startTime || undefined}
        onFlightLogged={handleFlightLogged}
        onStopTimer={async () => {
          // End flight without logging - user cancelled
          await endFlight();
          setPrefilledDuration(undefined);
          setPendingFlightData(null);
          toast.info(t('flight.flightEndedWithoutLog', 'Flytur avsluttet uten logging'));
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
