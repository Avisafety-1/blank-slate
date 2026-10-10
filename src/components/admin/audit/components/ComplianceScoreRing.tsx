interface Props {
  score: number | null;
  label: string;
  size?: number;
}

export const ComplianceScoreRing = ({ score, label, size = 160 }: Props) => {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - ((score ?? 0) / 100) * circumference;
  const colorClass =
    score == null ? "stroke-muted" : score >= 85 ? "stroke-status-green" : score >= 65 ? "stroke-status-yellow" : "stroke-status-red";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            className="stroke-muted"
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            className={colorClass}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 600ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold">{score == null ? "—" : `${score}%`}</div>
          <div className="text-xs text-muted-foreground text-center px-3 leading-tight">{label}</div>
        </div>
      </div>
    </div>
  );
};
