import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Search, Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addToQueue } from "@/lib/offlineQueue";
import { translateDeviationCategory } from "@/lib/i18nHelpers";
import { invokeEmailFunction } from "@/lib/emailInvoke";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface Category {
  id: string;
  parent_id: string | null;
  label: string;
  sort_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionId: string | null;
  flightLogId: string | null;
  onDone?: () => void;
}

type FlightPhase = "takeoff" | "in_flight" | "landing";

type Step = "select_mission" | "prompt" | "select";

interface MissionOption {
  id: string;
  tittel: string;
  status: string;
  tidspunkt: string;
  lokasjon: string | null;
}

const PHASE_LABELS: Record<FlightPhase, string> = {
  takeoff: "Takeoff",
  in_flight: "In flight",
  landing: "Landing",
};

export const DeviationReportDialog = ({ open, onOpenChange, missionId, flightLogId, onDone }: Props) => {
  const { t } = useTranslation();
  const { user, companyId } = useAuth();
  const [step, setStep] = useState<Step>(missionId ? "prompt" : "select_mission");
  const [categories, setCategories] = useState<Category[]>([]);
  const [path, setPath] = useState<Category[]>([]); // selected path from root
  const [comment, setComment] = useState("");
  const [search, setSearch] = useState("");
  const [flightPhase, setFlightPhase] = useState<FlightPhase | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [missions, setMissions] = useState<MissionOption[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(missionId);
  const [missionPopoverOpen, setMissionPopoverOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(missionId ? "prompt" : "select_mission");
    setSelectedMissionId(missionId);
    setPath([]);
    setComment("");
    setSearch("");
    setFlightPhase(null);
    if (companyId) {
      (async () => {
        // Use RPC to fetch effective categories (handles parent inheritance via SECURITY DEFINER)
        const { data } = await (supabase as any).rpc("get_effective_deviation_categories", {
          _company_id: companyId,
        });
        setCategories(data || []);
      })();
    }
  }, [open, companyId, missionId]);

  // Fetch missions when the dialog is opened without a pre-selected mission
  useEffect(() => {
    if (!open || missionId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("missions")
          .select("id, tittel, status, tidspunkt, lokasjon")
          .order("tidspunkt", { ascending: false })
          .limit(200);
        if (error) throw error;
        setMissions((data as MissionOption[]) || []);
      } catch (e) {
        console.error("[DeviationReportDialog] failed to fetch missions", e);
      }
    })();
  }, [open, missionId]);

  const catById = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const buildPathFor = (cat: Category): Category[] => {
    const result: Category[] = [];
    let current: Category | undefined = cat;
    while (current) {
      result.unshift(current);
      current = current.parent_id ? catById.get(current.parent_id) : undefined;
    }
    return result;
  };

  const currentParentId = path.length > 0 ? path[path.length - 1].id : null;
  const visibleOptions = categories
    .filter((c) => c.parent_id === currentParentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as { cat: Category; path: Category[] }[];
    return categories
      .filter((c) => c.label.toLowerCase().includes(q))
      .slice(0, 30)
      .map((c) => ({ cat: c, path: buildPathFor(c) }))
      .sort((a, b) => a.path.map((p) => p.label).join(" › ").localeCompare(b.path.map((p) => p.label).join(" › ")));
  }, [search, categories, catById]);

  const handleClose = () => {
    onOpenChange(false);
    onDone?.();
  };

  const handleSubmit = async () => {
    if (!selectedMissionId || !companyId || !user || path.length === 0) {
      handleClose();
      return;
    }
    setSubmitting(true);
    const payload = {
      mission_id: selectedMissionId,
      flight_log_id: flightLogId,
      company_id: companyId,
      reported_by: user.id,
      category_path: path.map((p) => p.label),
      category_ids: path.map((p) => p.id),
      flight_phase: flightPhase,
      comment: comment.trim() || null,
    };

    if (!navigator.onLine) {
      addToQueue({
        table: "mission_deviation_reports",
        operation: "insert",
        data: payload,
        description: "Avviksrapport (offline)",
      });
      toast.success("Avviksrapport lagret lokalt – synkroniseres senere");
      setSubmitting(false);
      handleClose();
      return;
    }

    const { error } = await (supabase as any).from("mission_deviation_reports").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error(`Kunne ikke lagre rapport: ${error.message}`);
    } else {
      toast.success("Avviksrapport lagret");
      void notifyResponsibles();
      handleClose();
    }
  };

  const notifyResponsibles = async () => {
    if (!selectedMissionId || !companyId || !user) return;
    try {
      const [{ data: mission }, { data: profile }] = await Promise.all([
        supabase.from("missions").select("tittel, lokasjon").eq("id", selectedMissionId).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);
      await invokeEmailFunction("send-notification-email", {
        body: {
          type: "notify_new_deviation",
          companyId,
          
          deviation: {
            categoryPath: path.map((p) => translateDeviationCategory(p.label)),
            comment: comment.trim() || null,
            flightPhase: flightPhase,
            missionTitle: (mission as any)?.tittel ?? null,
            missionLocation: (mission as any)?.lokasjon ?? null,
            reporterName: (profile as any)?.full_name ?? null,
            reportedAt: new Date().toLocaleString("nb-NO"),
          },
        },
      });
    } catch (e) {
      console.error("[DeviationReport] notification failed", e);
    }
  };

  const selectedMission = useMemo(
    () => missions.find((m) => m.id === selectedMissionId) || null,
    [missions, selectedMissionId]
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "select_mission"
              ? t("deviations.reportDialog.selectMission", "Velg oppdrag")
              : step === "prompt"
                ? t("deviations.title", "Avviksrapport")
                : t("deviations.edit.category", "Velg kategori")}
          </DialogTitle>
        </DialogHeader>

        {step === "select_mission" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("deviations.reportDialog.selectMission", "Velg oppdrag")}</Label>
              <Popover open={missionPopoverOpen} onOpenChange={setMissionPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                    disabled={missions.length === 0}
                  >
                    {selectedMission
                      ? selectedMission.tittel
                      : t("deviations.reportDialog.selectMission", "Velg oppdrag")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("deviations.reportDialog.searchMissions", "Søk etter oppdrag...")} />
                    <CommandList>
                      <CommandEmpty>{t("deviations.reportDialog.noMissionsFound", "Ingen oppdrag funnet")}</CommandEmpty>
                      <CommandGroup>
                        {missions.map((mission) => (
                          <CommandItem
                            key={mission.id}
                            value={`${mission.tittel} ${mission.status} ${mission.lokasjon || ""}`}
                            onSelect={() => {
                              setSelectedMissionId(mission.id);
                              setMissionPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedMissionId === mission.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col items-start">
                              <span>{mission.tittel}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(mission.tidspunkt).toLocaleDateString("nb-NO")}
                                {mission.lokasjon ? ` · ${mission.lokasjon}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={handleClose}>
                {t("actions.cancel", "Avbryt")}
              </Button>
              <Button
                onClick={() => setStep("select")}
                disabled={!selectedMissionId}
              >
                {t("actions.next", "Neste")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "prompt" && (
          <>
            <p className="text-sm">{t("deviations.reportDialog.prompt", "Ønsker du å rapportere noe fra flyturen?")}</p>
            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={handleClose}>
                {t("actions.no", "Nei")}
              </Button>
              <Button onClick={() => setStep("select")}>{t("actions.yes", "Ja")}</Button>
            </DialogFooter>
          </>
        )}

        {step === "select" && (
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("deviations.edit.searchCategories", "Søk i kategorier…")}
                className="pl-8 h-9"
              />
            </div>

            {search.trim() ? (
              <div className="space-y-1 max-h-60 overflow-y-auto border rounded-md p-1">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-2 py-3">{t("deviations.edit.noMatches", "Ingen treff")}</p>
                ) : (
                  searchResults.map(({ cat, path: p }) => (
                    <button
                      key={cat.id}
                      type="button"
                      className="w-full px-3 py-2 text-sm rounded hover:bg-muted/50 text-left"
                      onClick={() => {
                        setPath(p);
                        setSearch("");
                      }}
                    >
                      <div className="font-medium">{translateDeviationCategory(cat.label)}</div>
                      {p.length > 1 && (
                        <div className="text-xs text-muted-foreground">
                          {p.slice(0, -1).map((s) => translateDeviationCategory(s.label)).join(" › ")}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <>
                {/* Breadcrumb */}
                {path.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {path.map((p, i) => (
                      <span key={p.id} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight className="w-3 h-3" />}
                        <span className="font-medium text-foreground">{translateDeviationCategory(p.label)}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Back */}
                {(path.length > 0 || !missionId) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (path.length > 0) {
                        setPath((p) => p.slice(0, -1));
                      } else {
                        setStep("select_mission");
                      }
                    }}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    {t("actions.back", "Tilbake")}
                  </Button>
                )}

                {/* Options */}
                {visibleOptions.length > 0 ? (
                  <div className="space-y-1 max-h-60 overflow-y-auto border rounded-md p-1">
                    {visibleOptions.map((opt) => {
                      const hasChildren = categories.some((c) => c.parent_id === opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded hover:bg-muted/50 text-left"
                          onClick={() => setPath((p) => [...p, opt])}
                        >
                          <span>{translateDeviationCategory(opt.label)}</span>
                          {hasChildren && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic px-1">
                    {t("deviations.edit.noMatches", "Ingen treff")}
                  </p>
                )}
              </>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("deviations.edit.comment", "Kommentar")} ({t("common.optional", "valgfritt")})</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("deviations.message.requestBody", "Beskriv hendelsen…")}
                rows={3}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t("deviations.edit.phase", "Kritisk fase")} ({t("common.optional", "valgfritt")})
              </label>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(PHASE_LABELS) as FlightPhase[]).map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={flightPhase === p ? "default" : "outline"}
                    onClick={() => setFlightPhase((cur) => (cur === p ? null : p))}
                  >
                    {PHASE_LABELS[p]}
                  </Button>
                ))}
              </div>
            </div>

            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                {t("actions.cancel", "Avbryt")}
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || path.length === 0}>
                {submitting ? t("common.saving", "Lagrer…") : t("actions.report", "Lagre rapport")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
