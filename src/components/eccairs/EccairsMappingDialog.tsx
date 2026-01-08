import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EccairsTaxonomySelect } from "./EccairsTaxonomySelect";
import { useIncidentEccairsAttributes, AttributeData } from "@/hooks/useIncidentEccairsAttributes";
import { ECCAIRS_FIELDS, EccairsFieldConfig } from "@/config/eccairsFields";
import { suggestEccairsMapping, OCCURRENCE_CLASS_LABELS } from "@/lib/eccairsAutoMapping";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Incident {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  alvorlighetsgrad: string;
  lokasjon: string | null;
  kategori: string | null;
  company_id: string;
  hendelsestidspunkt?: string;
}

interface EccairsMappingDialogProps {
  incident: Incident;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EccairsMappingDialog({
  incident,
  open,
  onOpenChange,
  onSaved,
}: EccairsMappingDialogProps) {
  const { attributes, getAttribute, isLoading, saveAllAttributes, isSaving } = 
    useIncidentEccairsAttributes(incident.id, open);
  
  // Generic state: Record<`${code}_${taxonomyCode}`, value>
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const makeFieldKey = (field: EccairsFieldConfig) => `${field.code}_${field.taxonomyCode}`;

  const setFieldValue = (field: EccairsFieldConfig, value: string | null) => {
    const key = makeFieldKey(field);
    setFieldValues(prev => ({ ...prev, [key]: value ?? '' }));
  };

  const getFieldValue = (field: EccairsFieldConfig): string => {
    const key = makeFieldKey(field);
    return fieldValues[key] ?? field.defaultValue ?? '';
  };

  // Get occurrence class for display (code 431)
  const occurrenceClassValue = getFieldValue(ECCAIRS_FIELDS.find(f => f.code === 431)!);

  // Reset local state when opening/changing incident to avoid stale values
  useEffect(() => {
    if (!open) return;
    setFieldValues({});
  }, [open, incident.id]);

  // Load existing attributes or apply auto-suggestions
  useEffect(() => {
    if (!open) return;

    const hasExistingData = Object.keys(attributes).length > 0;
    
    if (hasExistingData) {
      // Load from database, then merge in defaults for missing fields
      const newValues: Record<string, string> = {};
      
      // First, apply defaults for all fields
      ECCAIRS_FIELDS.forEach(field => {
        if (field.defaultValue) {
          newValues[makeFieldKey(field)] = field.defaultValue;
        }
      });
      
      // Then override with saved values
      ECCAIRS_FIELDS.forEach(field => {
        const attr = getAttribute(field.code, field.taxonomyCode);
        if (attr) {
          const value = field.type === 'select' ? attr.value_id : attr.text_value;
          if (value) {
            newValues[makeFieldKey(field)] = value;
          }
        }
      });
      setFieldValues(newValues);
    } else if (!isLoading) {
      // Apply auto-suggestions for new mappings
      applyAutoSuggestions();
    }
  }, [attributes, isLoading, open, incident]);

  const applyAutoSuggestions = () => {
    const suggestions = suggestEccairsMapping(incident);
    const newValues: Record<string, string> = {};
    
    // Map suggestions to field values
    ECCAIRS_FIELDS.forEach(field => {
      if (field.code === 433 && suggestions.occurrence_date) {
        newValues[makeFieldKey(field)] = suggestions.occurrence_date;
      } else if (field.code === 431 && suggestions.occurrence_class) {
        newValues[makeFieldKey(field)] = suggestions.occurrence_class;
      } else if (field.code === 17 && suggestions.aircraft_category) {
        newValues[makeFieldKey(field)] = suggestions.aircraft_category;
      } else if (field.code === 390 && suggestions.headline) {
        newValues[makeFieldKey(field)] = suggestions.headline;
      } else if (field.code === 391 && suggestions.narrative) {
        newValues[makeFieldKey(field)] = suggestions.narrative;
      } else if (field.defaultValue) {
        newValues[makeFieldKey(field)] = field.defaultValue;
      }
    });
    
    // Also set location if available
    if (suggestions.location_name) {
      // Location is not in ECCAIRS_FIELDS currently, but could be added
    }
    
    setFieldValues(newValues);
  };

  const handleApplySuggestions = () => {
    applyAutoSuggestions();
    toast.success("Forslag anvendt");
  };

  const handleSave = async () => {
    try {
      const attributesToSave: Array<{ code: number; data: AttributeData }> = [];
      
      ECCAIRS_FIELDS.forEach(field => {
        const value = getFieldValue(field);
        if (!value) return;
        
        attributesToSave.push({
          code: field.code,
          data: {
            taxonomy_code: field.taxonomyCode,
            format: field.format,
            value_id: field.type === 'select' ? value : null,
            text_value: field.type !== 'select' ? value : null,
          }
        });
      });

      await saveAllAttributes(attributesToSave);
      toast.success("Klassifisering lagret");
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save mapping:", error);
      toast.error("Kunne ikke lagre klassifisering");
    }
  };

  // Check if required fields are filled
  const requiredFieldsFilled = ECCAIRS_FIELDS
    .filter(f => f.required)
    .every(f => !!getFieldValue(f));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ECCAIRS Klassifisering</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* AviSafe data summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">AviSafe-data</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Tittel: </span>
                  <span className="font-medium">{incident.tittel}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Alvorlighet: </span>
                  <Badge variant="outline">{incident.alvorlighetsgrad}</Badge>
                  {occurrenceClassValue && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      → {OCCURRENCE_CLASS_LABELS[occurrenceClassValue] || occurrenceClassValue}
                    </span>
                  )}
                </div>
                {incident.kategori && (
                  <div>
                    <span className="text-muted-foreground">Kategori: </span>
                    <span>{incident.kategori}</span>
                  </div>
                )}
                {incident.lokasjon && (
                  <div>
                    <span className="text-muted-foreground">Lokasjon: </span>
                    <span>{incident.lokasjon}</span>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplySuggestions}
                className="mt-2"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Bruk automatiske forslag
              </Button>
            </div>

            {/* ECCAIRS classification fields - dynamically rendered */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">ECCAIRS-klassifisering</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ECCAIRS_FIELDS.filter(f => f.type === 'select').map(field => (
                  <div key={makeFieldKey(field)} className="space-y-2">
                    <Label>
                      {field.label} (VL{field.code})
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground">{field.helpText}</p>
                    )}
                    <EccairsTaxonomySelect
                      valueListKey={`VL${field.code}`}
                      value={getFieldValue(field) || null}
                      onChange={(val) => setFieldValue(field, val)}
                      placeholder={`Velg ${field.label.toLowerCase()}...`}
                    />
                  </div>
                ))}
              </div>

              {/* Datetime fields */}
              {ECCAIRS_FIELDS.filter(f => f.type === 'datetime').map(field => {
                const isoValue = getFieldValue(field);
                // Convert ISO to datetime-local format (YYYY-MM-DDTHH:mm)
                const localValue = isoValue ? isoValue.slice(0, 16) : '';
                return (
                  <div key={makeFieldKey(field)} className="space-y-2">
                    <Label>
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground">{field.helpText}</p>
                    )}
                    <Input
                      type="datetime-local"
                      value={localValue}
                      onChange={(e) => {
                        // Convert datetime-local back to ISO UTC
                        const dateVal = e.target.value;
                        if (dateVal) {
                          setFieldValue(field, new Date(dateVal).toISOString());
                        } else {
                          setFieldValue(field, null);
                        }
                      }}
                      className="max-w-xs"
                    />
                  </div>
                );
              })}

              {/* Text fields */}
              {ECCAIRS_FIELDS.filter(f => f.type === 'text').map(field => (
                <div key={makeFieldKey(field)} className="space-y-2">
                  <Label>
                    {field.label}
                    {field.maxLength && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {getFieldValue(field).length}/{field.maxLength}
                      </span>
                    )}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  )}
                  <Input
                    value={getFieldValue(field)}
                    onChange={(e) => setFieldValue(field, field.maxLength 
                      ? e.target.value.slice(0, field.maxLength) 
                      : e.target.value
                    )}
                    placeholder={`Skriv ${field.label.toLowerCase()}...`}
                  />
                </div>
              ))}

              {/* Textarea fields */}
              {ECCAIRS_FIELDS.filter(f => f.type === 'textarea').map(field => (
                <div key={makeFieldKey(field)} className="space-y-2">
                  <Label>
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.helpText && (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  )}
                  <Textarea
                    value={getFieldValue(field)}
                    onChange={(e) => setFieldValue(field, e.target.value)}
                    placeholder={`Skriv ${field.label.toLowerCase()}...`}
                    rows={4}
                  />
                </div>
              ))}
            </div>

            {!requiredFieldsFilled && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Hendelsesklasse er påkrevd for ECCAIRS-eksport</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !requiredFieldsFilled}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Lagre klassifisering
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
