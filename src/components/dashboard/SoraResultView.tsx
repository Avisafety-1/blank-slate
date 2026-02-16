import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

interface SoraData {
  environment?: string;
  conops_summary?: string;
  igrc?: number;
  ground_mitigations?: string;
  fgrc?: number;
  arc_initial?: string;
  airspace_mitigations?: string;
  arc_residual?: string;
  sail?: string;
  residual_risk_level?: string;
  residual_risk_comment?: string;
  operational_limits?: string;
  overall_score?: number;
  recommendation?: string;
  summary?: string;
}

interface SoraResultViewProps {
  data: SoraData;
}

const riskColor = (level?: string) => {
  if (!level) return "secondary";
  const l = level.toLowerCase();
  if (l === "lav" || l === "low") return "default";
  if (l === "moderat" || l === "moderate") return "secondary";
  return "destructive";
};

const Field = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="space-y-1">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="text-sm">{value ?? "—"}</p>
  </div>
);

export const SoraResultView = ({ data }: SoraResultViewProps) => {
  return (
    <div className="space-y-4">
      {data.summary && (
        <div className="p-4 rounded-lg bg-muted/50">
          <p className="text-sm">{data.summary}</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {data.sail && <Badge variant="outline">{data.sail}</Badge>}
        {data.residual_risk_level && (
          <Badge variant={riskColor(data.residual_risk_level)}>
            Rest-risiko: {data.residual_risk_level}
          </Badge>
        )}
        {data.recommendation && (
          <Badge variant={data.recommendation === "go" ? "default" : data.recommendation === "caution" ? "secondary" : "destructive"}>
            {data.recommendation.toUpperCase()}
          </Badge>
        )}
      </div>

      <Accordion type="multiple" defaultValue={["env", "grc", "arc", "sail"]} className="w-full">
        <AccordionItem value="env">
          <AccordionTrigger>Operasjonsmiljø og ConOps</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <Field label="Miljø" value={data.environment} />
            <Field label="ConOps-beskrivelse" value={data.conops_summary} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="grc">
          <AccordionTrigger>Bakkebasert risiko (GRC)</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <Field label="iGRC (grunnrisiko)" value={data.igrc} />
              <Field label="fGRC (endelig)" value={data.fgrc} />
            </div>
            <Field label="Bakkemitigeringer" value={data.ground_mitigations} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="arc">
          <AccordionTrigger>Luftromsrisiko (ARC)</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Initial ARC" value={data.arc_initial} />
              <Field label="Residual ARC" value={data.arc_residual} />
            </div>
            <Field label="Luftromsmitigeringer" value={data.airspace_mitigations} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="sail">
          <AccordionTrigger>SAIL og rest-risiko</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <Field label="SAIL-nivå" value={data.sail} />
              <Field label="Rest-risiko" value={data.residual_risk_level} />
            </div>
            <Field label="Rest-risiko kommentar" value={data.residual_risk_comment} />
            <Field label="Operative begrensninger" value={data.operational_limits} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
