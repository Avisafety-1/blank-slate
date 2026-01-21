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
import { EccairsMultiSelect } from "./EccairsMultiSelect";
import { EccairsEventTypeSelect } from "./EccairsEventTypeSelect";
import { useIncidentEccairsAttributes, AttributeData } from "@/hooks/useIncidentEccairsAttributes";
import { 
  ECCAIRS_FIELDS, 
  EccairsFieldConfig, 
  EccairsFieldGroup,
  ECCAIRS_FIELD_GROUP_LABELS,
  getOrderedGroups,
  getFieldsByGroup
} from "@/config/eccairsFields";
import { suggestEccairsMapping, OCCURRENCE_CLASS_LABELS } from "@/lib/eccairsAutoMapping";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface IncidentComment {
  id: string;
  comment_text: string;
  created_by_name: string;
  created_at: string;
}

interface Incident {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  alvorlighetsgrad: string;
  lokasjon: string | null;
  kategori: string | null;
  company_id: string;
  hendelsestidspunkt?: string;
  incident_number?: string | null;
  mission_id?: string | null;
  drone_serial_number?: string | null;
  comments?: IncidentComment[];
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
  
  // Generic state: Record<`${code}_${taxonomyCode}_${entityPath}`, value>
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const makeFieldKey = (field: EccairsFieldConfig) => 
    `${field.code}_${field.taxonomyCode}_${field.entityPath ?? 'top'}`;

  const setFieldValue = (field: EccairsFieldConfig, value: string | null) => {
    const key = makeFieldKey(field);
    setFieldValues(prev => ({ ...prev, [key]: value ?? '' }));
  };

  const getFieldValue = (field: EccairsFieldConfig): string => {
    const key = makeFieldKey(field);
    return fieldValues[key] ?? field.defaultValue ?? '';
  };

  // Parse multi-select value from JSON string to array
  const parseMultiSelectValue = (value: string): string[] | null => {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // If not valid JSON, treat as single value
      return value ? [value] : null;
    }
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
        const attr = getAttribute(field.code, field.taxonomyCode, field.entityPath ?? null);
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
      } else if (field.code === 457 && incident.hendelsestidspunkt) {
        // Auto-fill local time from hendelsestidspunkt
        try {
          const time = new Date(incident.hendelsestidspunkt).toLocaleTimeString('no-NO', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          });
          newValues[makeFieldKey(field)] = time;
        } catch {
          // Ignore parse errors
        }
      } else if (field.code === 601 && incident.tittel) {
        // Auto-fill headline from incident title
        newValues[makeFieldKey(field)] = incident.tittel;
      } else if (field.code === 440 && incident.lokasjon) {
        // Auto-fill location name from lokasjon
        newValues[makeFieldKey(field)] = incident.lokasjon;
      } else if (field.code === 431 && suggestions.occurrence_class) {
        newValues[makeFieldKey(field)] = suggestions.occurrence_class;
      } else if (field.code === 32 && suggestions.aircraft_category) {
        newValues[makeFieldKey(field)] = suggestions.aircraft_category;
      } else if (field.code === 454 && suggestions.state_area) {
        // Auto-fill state/area based on postcode from lokasjon
        // Store as JSON array string for content_object_array format
        newValues[makeFieldKey(field)] = JSON.stringify(suggestions.state_area);
      } else if (field.code === 438 && incident.incident_number) {
        // Auto-fill file number from incident_number
        newValues[makeFieldKey(field)] = incident.incident_number;
      } else if (field.code === 424) {
        // Default narrative language to Norwegian (43)
        newValues[makeFieldKey(field)] = '43';
      } else if (field.code === 425) {
        // Auto-fill narrative text from incident description + comments
        let narrativeText = incident.beskrivelse || '';
        
        // Append comments if available
        if (incident.comments && incident.comments.length > 0) {
          const commentsText = incident.comments
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map(c => {
              const date = new Date(c.created_at).toLocaleDateString('no-NO', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              return `[${date} - ${c.created_by_name}]: ${c.comment_text}`;
            })
            .join('\n');
          
          if (narrativeText) {
            narrativeText += '\n\n--- Kommentarer ---\n' + commentsText;
          } else {
            narrativeText = commentsText;
          }
        }
        
        if (narrativeText) {
          newValues[makeFieldKey(field)] = narrativeText;
        }
      } else if (field.code === 244 && incident.drone_serial_number) {
        // Auto-fill aircraft serial number from drone
        newValues[makeFieldKey(field)] = incident.drone_serial_number;
      } else if (field.defaultValue) {
        newValues[makeFieldKey(field)] = field.defaultValue;
      }
    });
    
    setFieldValues(newValues);
  };

  const handleApplySuggestions = () => {
    applyAutoSuggestions();
    toast.success("Forslag anvendt");
  };

  const handleSave = async () => {
    try {
      // First, derive hidden fields from their source fields
      const derivedValues = { ...fieldValues };
      ECCAIRS_FIELDS.filter(f => f.type === 'hidden' && f.deriveFrom).forEach(field => {
        const sourceField = ECCAIRS_FIELDS.find(f => f.code === field.deriveFrom);
        if (sourceField) {
          const sourceValue = derivedValues[makeFieldKey(sourceField)] ?? sourceField.defaultValue ?? '';
          if (sourceValue) {
            derivedValues[makeFieldKey(field)] = sourceValue;
          }
        }
      });

      const attributesToSave: Array<{ code: number; data: AttributeData }> = [];
      
      ECCAIRS_FIELDS.forEach(field => {
        const value = derivedValues[makeFieldKey(field)] ?? field.defaultValue ?? '';
        if (!value) return;
        
        attributesToSave.push({
          code: field.code,
          data: {
            taxonomy_code: field.taxonomyCode,
            entity_path: field.entityPath ?? null,
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

  // Helper to get the VL key for a field
  const getVLKey = (field: EccairsFieldConfig): string => {
    return `VL${field.code}`;
  };

  // Render a single field based on its type
  const renderField = (field: EccairsFieldConfig) => {
    if (field.type === 'hidden') return null;

    const isMultiSelect = field.format === 'content_object_array';
    const fieldKey = makeFieldKey(field);

    if (field.type === 'select') {
      // Use special component for Event Type (VL390) - only main categories
      const isEventType = field.code === 390;
      
      return (
        <div key={fieldKey} className="space-y-2">
          <Label>
            {field.label} ({getVLKey(field)})
            {field.entityPath && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Entity {field.entityPath}
              </Badge>
            )}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
          {isEventType ? (
            <EccairsEventTypeSelect
              value={getFieldValue(field) || null}
              onChange={(val) => setFieldValue(field, val)}
              placeholder={`Velg ${field.label.toLowerCase()}...`}
            />
          ) : isMultiSelect ? (
            <EccairsMultiSelect
              valueListKey={getVLKey(field)}
              value={parseMultiSelectValue(getFieldValue(field))}
              onChange={(vals) => setFieldValue(field, JSON.stringify(vals))}
              placeholder={`Velg ${field.label.toLowerCase()}...`}
            />
          ) : (
            <EccairsTaxonomySelect
              valueListKey={getVLKey(field)}
              value={getFieldValue(field) || null}
              onChange={(val) => setFieldValue(field, val)}
              placeholder={`Velg ${field.label.toLowerCase()}...`}
            />
          )}
        </div>
      );
    }

    if (field.type === 'date') {
      return (
        <div key={fieldKey} className="space-y-2">
          <Label>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
          <Input
            type="date"
            value={getFieldValue(field)}
            onChange={(e) => setFieldValue(field, e.target.value || null)}
            className="max-w-xs"
          />
        </div>
      );
    }

    if (field.type === 'time') {
      return (
        <div key={fieldKey} className="space-y-2">
          <Label>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
          <Input
            type="time"
            value={getFieldValue(field)}
            onChange={(e) => setFieldValue(field, e.target.value || null)}
            className="max-w-xs"
          />
        </div>
      );
    }

    if (field.type === 'text') {
      return (
        <div key={fieldKey} className="space-y-2">
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
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={fieldKey} className="space-y-2 col-span-full">
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
      );
    }

    return null;
  };

  // Render a group of fields
  const renderGroup = (group: EccairsFieldGroup) => {
    const fields = getFieldsByGroup(group).filter(f => f.type !== 'hidden');
    if (fields.length === 0) return null;

    return (
      <div key={group} className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground border-b pb-2">
          {ECCAIRS_FIELD_GROUP_LABELS[group]}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map(field => renderField(field))}
        </div>
      </div>
    );
  };

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

            {/* ECCAIRS classification fields - grouped logically */}
            <div className="space-y-6">
              {getOrderedGroups().map(group => renderGroup(group))}
            </div>

            {!requiredFieldsFilled && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Hendelsesklasse og Overskrift er påkrevd for ECCAIRS-eksport</span>
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
