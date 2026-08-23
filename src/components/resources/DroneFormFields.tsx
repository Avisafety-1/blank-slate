import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, ChevronDown, Info } from "lucide-react";

export interface DroneFormValues {
  modell: string;
  dji_aircraft_name: string;
  internal_serial: string;
  serienummer: string;
  registration_number: string;
  klasse: string;
  kjøpsdato: string;
  vekt: string;
  payload: string;
  merknader: string;
  status: string;
  flyvetimer: string | number;
  sjekkliste_id: string;
  operations_checklist_ids: string[];
  post_flight_checklist_id: string;
  sist_inspeksjon: string;
  neste_inspeksjon: string;
  inspection_start_date: string;
  inspection_interval_days: string;
  inspection_interval_hours: string;
  inspection_interval_missions: string;
  varsel_dager: string;
  varsel_timer: string;
  varsel_oppdrag: string;
}

export const emptyDroneFormValues: DroneFormValues = {
  modell: "",
  dji_aircraft_name: "",
  internal_serial: "",
  serienummer: "",
  registration_number: "",
  klasse: "",
  kjøpsdato: "",
  vekt: "",
  payload: "",
  merknader: "",
  status: "Grønn",
  flyvetimer: "0",
  sjekkliste_id: "none",
  operations_checklist_ids: [],
  post_flight_checklist_id: "none",
  sist_inspeksjon: "",
  neste_inspeksjon: "",
  inspection_start_date: "",
  inspection_interval_days: "",
  inspection_interval_hours: "",
  inspection_interval_missions: "",
  varsel_dager: "",
  varsel_timer: "",
  varsel_oppdrag: "",
};

interface CatalogModel {
  id: string;
  name: string;
  eu_class: string;
}

interface ChecklistOption {
  id: string;
  tittel: string;
}

interface DroneFormFieldsProps {
  values: DroneFormValues;
  onChange: (patch: Partial<DroneFormValues>) => void;
  mode: "create" | "edit";
  droneModels: CatalogModel[];
  selectedModelId: string;
  onModelSelect: (modelId: string) => void;
  checklists: ChecklistOption[];
  isMobile: boolean;
  /** Replaces the flight hours input (edit mode uses a read-only field + "Change" button) */
  flightHoursControl?: ReactNode;
  /** Rendered under the status row (e.g. StatusReasonList) */
  statusReasonsSlot?: ReactNode;
  /** Rendered at the bottom of the left column (e.g. technical responsible select) */
  technicalResponsibleSlot?: ReactNode;
  /** Rendered at the bottom of the right column (administration section) */
  adminSlot?: ReactNode;
}

export const DroneFormFields = ({
  values,
  onChange,
  mode,
  droneModels,
  selectedModelId,
  onModelSelect,
  checklists,
  isMobile,
  flightHoursControl,
  statusReasonsSlot,
  technicalResponsibleSlot,
  adminSlot,
}: DroneFormFieldsProps) => {
  const { t } = useTranslation();
  const tt = (k: string, opts?: any) => t(`resourceDialogs.droneDetail.${k}`, opts) as string;

  const selectedOps = values.operations_checklist_ids || [];

  const opsList = (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {checklists.map((checklist) => (
        <label key={checklist.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
          <Checkbox
            checked={selectedOps.includes(checklist.id)}
            onCheckedChange={(checked) => {
              onChange({
                operations_checklist_ids: checked
                  ? [...selectedOps, checklist.id]
                  : selectedOps.filter((id) => id !== checklist.id),
              });
            }}
          />
          <span className="min-w-0 flex-1 break-words">{checklist.tittel}</span>
        </label>
      ))}
    </div>
  );

  const opsTriggerLabel = selectedOps.length > 0
    ? tt("checklists.operationsSelected", { count: selectedOps.length })
    : tt("checklists.operationsPlaceholder");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
      {/* Left column: core data */}
      <div className="space-y-4 min-w-0">
        {/* Drone catalog selector */}
        <div className="border-b pb-4 mb-4">
          <Label>{tt("catalogSelector.label")}</Label>
          <Select value={selectedModelId} onValueChange={onModelSelect}>
            <SelectTrigger>
              <SelectValue placeholder={tt("catalogSelector.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">{tt("catalogSelector.manual")}</SelectItem>
              {droneModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name} ({model.eu_class})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">{tt("catalogSelector.autofillHint")}</p>
        </div>

        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("resourceEditLayout.general")}</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="modell">{tt("labels.model")}</Label>
            <Input
              id="modell"
              value={values.modell}
              onChange={(e) => onChange({ modell: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="dji_aircraft_name" className="flex items-center gap-1.5">
              {tt("labels.droneName")}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start" avoidCollisions collisionPadding={16} className="max-w-[260px] text-xs break-words z-50">
                    {tt("labels.droneNameInfo")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              id="dji_aircraft_name"
              value={values.dji_aircraft_name}
              onChange={(e) => onChange({ dji_aircraft_name: e.target.value })}
              placeholder={tt("form.internalSerialPlaceholder")}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="internal_serial">{tt("labels.internalSerial")}</Label>
          <Input
            id="internal_serial"
            value={values.internal_serial}
            onChange={(e) => onChange({ internal_serial: e.target.value })}
            placeholder={tt("form.internalSerialPlaceholder")}
          />
        </div>
        <div>
          <Label htmlFor="serienummer">{tt("labels.serial")}</Label>
          <Input
            id="serienummer"
            value={values.serienummer}
            onChange={(e) => onChange({ serienummer: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="registration_number">{tt("labels.registrationNumber")}</Label>
          <Input
            id="registration_number"
            value={values.registration_number}
            onChange={(e) => onChange({ registration_number: e.target.value })}
            placeholder={tt("form.registrationNumberPlaceholder")}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="klasse">{tt("labels.class")}</Label>
            <Select value={values.klasse || ""} onValueChange={(value) => onChange({ klasse: value })}>
              <SelectTrigger>
                <SelectValue placeholder={tt("form.chooseClass")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="C0">C0</SelectItem>
                <SelectItem value="C1">C1</SelectItem>
                <SelectItem value="C2">C2</SelectItem>
                <SelectItem value="C3">C3</SelectItem>
                <SelectItem value="C4">C4</SelectItem>
                <SelectItem value="C5">C5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="kjøpsdato">{tt("labels.purchaseDate")}</Label>
            <Input
              id="kjøpsdato"
              type="date"
              value={values.kjøpsdato}
              onChange={(e) => onChange({ kjøpsdato: e.target.value })}
            />
          </div>
        </div>

        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-2">{t("resourceEditLayout.technical")}</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vekt">{tt("labels.weightMTOM")} ({tt("kgSuffix")})</Label>
            <Input
              id="vekt"
              type="number"
              step="0.01"
              value={values.vekt}
              onChange={(e) => onChange({ vekt: e.target.value })}
              placeholder={tt("form.weightPlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="payload">{tt("labels.payload")} ({tt("kgSuffix")})</Label>
            <Input
              id="payload"
              type="number"
              step="0.01"
              value={values.payload}
              onChange={(e) => onChange({ payload: e.target.value })}
              placeholder={tt("form.payloadPlaceholder")}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="merknader">{tt("labels.notes")}</Label>
          <Textarea
            id="merknader"
            value={values.merknader}
            onChange={(e) => onChange({ merknader: e.target.value })}
            rows={3}
          />
        </div>

        {checklists.length > 0 && (
          <>
            <div className="border-t pt-4">
              <Label>{tt("checklists.operationsLabel")}</Label>
              {isMobile ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="mt-1 flex w-full min-w-0 max-w-full justify-between overflow-hidden font-normal">
                      <span className="min-w-0 flex-1 truncate text-left">{opsTriggerLabel}</span>
                      <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[95vw] max-w-md p-0 gap-0">
                    <DialogHeader className="px-4 py-3 border-b">
                      <DialogTitle className="text-base">{tt("checklists.operationsLabel")}</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto overscroll-contain px-2 py-2" style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}>
                      {opsList}
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="mt-1 flex w-full min-w-0 max-w-full justify-between overflow-hidden font-normal">
                      <span className="min-w-0 flex-1 truncate text-left">{opsTriggerLabel}</span>
                      <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[min(var(--radix-popover-trigger-width),calc(100vw-2rem))] p-2" align="start">
                    {opsList}
                  </PopoverContent>
                </Popover>
              )}
              <p className="text-xs text-muted-foreground mt-1">{tt("checklists.operationsHint")}</p>
            </div>
            <div className="border-t pt-4">
              <Label htmlFor="post_flight_checklist">{tt("checklists.postFlightLabel")}</Label>
              <Select value={values.post_flight_checklist_id} onValueChange={(value) => onChange({ post_flight_checklist_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder={tt("checklists.postFlightPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tt("checklists.none")}</SelectItem>
                  {checklists.map((checklist) => (
                    <SelectItem key={checklist.id} value={checklist.id}>
                      {checklist.tittel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{tt("checklists.postFlightHint")}</p>
            </div>
          </>
        )}

        {technicalResponsibleSlot}
      </div>

      {/* Right column: status, maintenance, admin */}
      <div className="space-y-5 rounded-xl border bg-muted/30 p-4 min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("resourceEditLayout.operationalStatus")}</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="flyvetimer">{tt("labels.flightHours")}</Label>
            {flightHoursControl ?? (
              <Input
                id="flyvetimer"
                type="number"
                step="0.01"
                value={values.flyvetimer}
                onChange={(e) => onChange({ flyvetimer: e.target.value })}
              />
            )}
          </div>

          <div>
            <Label htmlFor="status">{tt("labels.status")}</Label>
            <Select value={values.status} onValueChange={(value) => onChange({ status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Grønn">Grønn</SelectItem>
                <SelectItem value="Gul">Gul</SelectItem>
                <SelectItem value="Rød">Rød</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {statusReasonsSlot}

        {/* Inspection & maintenance intervals */}
        <div className="rounded-lg border bg-background/60 p-3 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Calendar className="w-4 h-4 text-primary" />
            {tt("inspectionForm.sectionTitle")}
          </div>

          {checklists.length > 0 && (
            <div>
              <Label htmlFor="sjekkliste">{tt("checklists.inspectionLabel")}</Label>
              <Select value={values.sjekkliste_id} onValueChange={(value) => onChange({ sjekkliste_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder={tt("checklists.inspectionPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tt("checklists.none")}</SelectItem>
                  {checklists.map((checklist) => (
                    <SelectItem key={checklist.id} value={checklist.id}>
                      {checklist.tittel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{tt("checklists.inspectionHint")}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sist_inspeksjon">{tt("inspection.lastInspection")}</Label>
              <Input
                id="sist_inspeksjon"
                type="date"
                value={values.sist_inspeksjon}
                onChange={(e) => onChange({ sist_inspeksjon: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="neste_inspeksjon">{tt("inspection.nextInspection")}</Label>
              <Input
                id="neste_inspeksjon"
                type="date"
                value={values.neste_inspeksjon}
                onChange={(e) => onChange({ neste_inspeksjon: e.target.value })}
                disabled={!!values.inspection_interval_days}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inspection_start_date">{tt("inspectionForm.startDate")}</Label>
              <Input
                id="inspection_start_date"
                type="date"
                value={values.inspection_start_date}
                onChange={(e) => onChange({ inspection_start_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="inspection_interval_days">{tt("inspectionForm.intervalDays")}</Label>
              <Input
                id="inspection_interval_days"
                type="number"
                placeholder={tt("inspectionForm.intervalDaysPlaceholder")}
                value={values.inspection_interval_days}
                onChange={(e) => onChange({ inspection_interval_days: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inspection_interval_hours">{tt("inspectionForm.intervalHours")}</Label>
              <Input
                id="inspection_interval_hours"
                type="number"
                step="0.1"
                placeholder={tt("inspectionForm.intervalHoursPlaceholder")}
                value={values.inspection_interval_hours}
                onChange={(e) => onChange({ inspection_interval_hours: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="inspection_interval_missions">{tt("inspectionForm.intervalMissions")}</Label>
              <Input
                id="inspection_interval_missions"
                type="number"
                placeholder={tt("inspectionForm.intervalMissionsPlaceholder")}
                value={values.inspection_interval_missions}
                onChange={(e) => onChange({ inspection_interval_missions: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="varsel_dager">{tt("inspectionForm.warnDays")}</Label>
              <Input
                id="varsel_dager"
                type="number"
                placeholder={tt("inspectionForm.warnDaysPlaceholder")}
                value={values.varsel_dager}
                onChange={(e) => onChange({ varsel_dager: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="varsel_timer">{tt("inspectionForm.warnHours")}</Label>
              <Input
                id="varsel_timer"
                type="number"
                step="0.1"
                placeholder={tt("inspectionForm.warnHoursPlaceholder")}
                value={values.varsel_timer}
                onChange={(e) => onChange({ varsel_timer: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="varsel_oppdrag">{tt("inspectionForm.warnMissions")}</Label>
              <Input
                id="varsel_oppdrag"
                type="number"
                placeholder={tt("inspectionForm.warnMissionsPlaceholder")}
                value={values.varsel_oppdrag}
                onChange={(e) => onChange({ varsel_oppdrag: e.target.value })}
              />
            </div>
          </div>
          {values.inspection_start_date && values.inspection_interval_days && (
            <p className="text-sm text-muted-foreground">{tt("inspectionForm.autoCalcHint")}</p>
          )}
          <p className="text-xs text-muted-foreground">{tt("inspectionForm.statusTriggerHint")}</p>
        </div>

        {adminSlot}
      </div>
    </div>
  );
};
