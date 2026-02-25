export const statusColors: Record<string, string> = {
  Planlagt: "bg-blue-500/20 text-blue-900 border-blue-500/30",
  Pågående: "bg-green-500/20 text-green-900 border-green-500/30",
  Fullført: "bg-gray-500/20 text-gray-900 border-gray-500/30",
  Avbrutt: "bg-red-500/20 text-red-900 border-red-500/30"
};

export const incidentSeverityColors: Record<string, string> = {
  Lav: "bg-blue-500/20 text-blue-900 border-blue-500/30",
  Middels: "bg-yellow-500/20 text-yellow-900 border-yellow-500/30",
  Høy: "bg-orange-500/20 text-orange-900 border-orange-500/30",
  Kritisk: "bg-red-500/20 text-red-900 border-red-500/30",
};

export const incidentStatusColors: Record<string, string> = {
  Åpen: "bg-blue-500/20 text-blue-900 border-blue-500/30",
  "Under behandling": "bg-yellow-500/20 text-yellow-900 border-yellow-500/30",
  Løst: "bg-green-500/20 text-green-900 border-green-500/30",
  Lukket: "bg-gray-500/20 text-gray-900 border-gray-500/30",
};

export const getAIRiskBadgeColor = (recommendation: string) => {
  switch (recommendation?.toLowerCase()) {
    case 'proceed':
      return 'bg-green-500/20 text-green-900 border-green-500/30';
    case 'proceed_with_caution':
      return 'bg-yellow-500/20 text-yellow-900 border-yellow-500/30';
    case 'not_recommended':
      return 'bg-red-500/20 text-red-900 border-red-500/30';
    default:
      return 'bg-gray-500/20 text-gray-900 border-gray-500/30';
  }
};

export const getAIRiskLabel = (recommendation: string) => {
  switch (recommendation?.toLowerCase()) {
    case 'proceed':
      return 'Anbefalt';
    case 'proceed_with_caution':
      return 'Forsiktighet';
    case 'not_recommended':
      return 'Ikke anbefalt';
    default:
      return recommendation || 'Ukjent';
  }
};

export const formatAIRiskScore = (score: unknown) => {
  const n = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(n)) return "—/10";
  return `${n.toFixed(1)}/10`;
};
