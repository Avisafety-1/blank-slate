import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Paperclip, Trash2 } from "lucide-react";
import { StatusPill } from "./StatusPill";
import type { InternalAudit, AuditFinding, AuditSectionKey } from "../types";

const SECTION_LABELS: Record<AuditSectionKey, string> = {
  organization: "Organisasjon",
  documentation: "Dokumentasjon",
  competency: "Kompetanse",
  operations: "Operasjoner",
  technical: "Teknisk",
  safety: "Safety",
};

const SECTION_ITEMS: Record<AuditSectionKey, string[]> = {
  organization: ["Roller definert", "Ansvarsfordeling dokumentert", "Kontaktinfo oppdatert"],
  documentation: ["Operasjonsmanual gyldig", "SOP oppdatert", "Endringslogg ført"],
  competency: ["Piloter sertifisert", "Årlig gjennomgang utført"],
  operations: ["Sjekklister brukt", "Risikovurderinger utført", "Debrief gjennomført"],
  technical: ["Vedlikehold à jour", "Firmware oppdatert"],
  safety: ["Hendelser rapportert", "Tiltak lukket i tide"],
};

interface Props {
  audit: InternalAudit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (audit: InternalAudit) => void;
}

export const AuditDetailDialog = ({ audit, open, onOpenChange, onSave }: Props) => {
  const [local, setLocal] = useState<InternalAudit>(audit);

  const toggleCheck = (section: AuditSectionKey, idx: number) => {
    setLocal((prev) => {
      const next = { ...prev, sections: { ...prev.sections } };
      const arr = [...next.sections[section].checked];
      arr[idx] = !arr[idx];
      next.sections[section] = { ...next.sections[section], checked: arr };
      return next;
    });
  };

  const updateComment = (section: AuditSectionKey, value: string) => {
    setLocal((prev) => ({
      ...prev,
      sections: { ...prev.sections, [section]: { ...prev.sections[section], comment: value } },
    }));
  };

  const addFinding = () => {
    const f: AuditFinding = {
      id: `af-${Date.now()}`,
      category: "Nytt funn",
      description: "",
      responsible: "",
      deadline: new Date().toISOString().slice(0, 10),
      status: "open",
      actions: [],
    };
    setLocal((prev) => ({ ...prev, findings: [...prev.findings, f] }));
  };

  const updateFinding = (id: string, patch: Partial<AuditFinding>) => {
    setLocal((prev) => ({
      ...prev,
      findings: prev.findings.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  };

  const deleteFinding = (id: string) => {
    setLocal((prev) => ({ ...prev, findings: prev.findings.filter((f) => f.id !== id) }));
  };

  const addAction = (findingId: string) => {
    updateFinding(findingId, {
      actions: [
        ...(local.findings.find((f) => f.id === findingId)?.actions ?? []),
        { id: `aa-${Date.now()}`, description: "", responsible: "", deadline: new Date().toISOString().slice(0, 10), status: "open" },
      ],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{local.title}</DialogTitle>
        </DialogHeader>

        <Accordion type="multiple" defaultValue={["documentation"]} className="w-full">
          {(Object.keys(SECTION_LABELS) as AuditSectionKey[]).map((key) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  {SECTION_LABELS[key]}
                  <StatusPill status={local.sections[key].status} />
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                {SECTION_ITEMS[key].map((label, idx) => (
                  <label key={idx} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={local.sections[key].checked[idx] ?? false}
                      onCheckedChange={() => toggleCheck(key, idx)}
                    />
                    {label}
                  </label>
                ))}
                <Textarea
                  placeholder="Kommentar…"
                  value={local.sections[key].comment}
                  onChange={(e) => updateComment(key, e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" disabled>
                  <Paperclip className="w-4 h-4 mr-2" /> Vedlegg (kommer)
                </Button>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="border-t pt-4 mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Funn</h3>
            <Button size="sm" onClick={addFinding}>
              <Plus className="w-4 h-4 mr-1" /> Legg til funn
            </Button>
          </div>
          {local.findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen funn registrert.</p>
          ) : (
            <div className="space-y-3">
              {local.findings.map((f) => (
                <div key={f.id} className="border rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input value={f.category} onChange={(e) => updateFinding(f.id, { category: e.target.value })} placeholder="Kategori" />
                    <Input value={f.responsible} onChange={(e) => updateFinding(f.id, { responsible: e.target.value })} placeholder="Ansvarlig" />
                    <Input type="date" value={f.deadline} onChange={(e) => updateFinding(f.id, { deadline: e.target.value })} />
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={f.status}
                      onChange={(e) => updateFinding(f.id, { status: e.target.value as AuditFinding["status"] })}
                    >
                      <option value="open">Åpen</option>
                      <option value="in_progress">Pågår</option>
                      <option value="closed">Lukket</option>
                    </select>
                  </div>
                  <Textarea value={f.description} onChange={(e) => updateFinding(f.id, { description: e.target.value })} placeholder="Beskrivelse" />

                  <div className="pl-2 border-l-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">Tiltak</span>
                      <Button size="sm" variant="outline" onClick={() => addAction(f.id)}>
                        <Plus className="w-3 h-3 mr-1" /> Tiltak
                      </Button>
                    </div>
                    {f.actions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Ingen tiltak.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Beskrivelse</TableHead>
                            <TableHead>Ansvarlig</TableHead>
                            <TableHead>Frist</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {f.actions.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell>
                                <Input
                                  value={a.description}
                                  onChange={(e) =>
                                    updateFinding(f.id, { actions: f.actions.map((x) => x.id === a.id ? { ...x, description: e.target.value } : x) })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={a.responsible}
                                  onChange={(e) =>
                                    updateFinding(f.id, { actions: f.actions.map((x) => x.id === a.id ? { ...x, responsible: e.target.value } : x) })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="date"
                                  value={a.deadline}
                                  onChange={(e) =>
                                    updateFinding(f.id, { actions: f.actions.map((x) => x.id === a.id ? { ...x, deadline: e.target.value } : x) })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <select
                                  className="h-9 rounded-md border bg-background px-2 text-sm"
                                  value={a.status}
                                  onChange={(e) =>
                                    updateFinding(f.id, { actions: f.actions.map((x) => x.id === a.id ? { ...x, status: e.target.value as AuditFinding["status"] } : x) })
                                  }
                                >
                                  <option value="open">Åpen</option>
                                  <option value="in_progress">Pågår</option>
                                  <option value="closed">Lukket</option>
                                </select>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => deleteFinding(f.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={() => { onSave(local); onOpenChange(false); }}>Lagre</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
