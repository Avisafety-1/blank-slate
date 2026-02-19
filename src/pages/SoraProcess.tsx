import {
  Database,
  Globe,
  Shield,
  User,
  Brain,
  MessageSquare,
  Zap,
  ChevronDown,
  Wind,
  Thermometer,
  Eye,
  MapPin,
  Users,
  Cpu,
  CheckCircle2,
  ArrowRight,
  Radio,
  BarChart3,
  FileText,
  Lock,
  Clock,
  Activity,
  Layers,
  Navigation,
  AlertTriangle,
} from "lucide-react";
import avisafeLogo from "@/assets/avisafe-logo.png";

const COLORS = {
  bg: "#0a1628",
  bgCard: "#0f1f3d",
  bgCardHover: "#122448",
  blue: "#3b82f6",
  blueLight: "#60a5fa",
  blueDim: "#1e3a5f",
  green: "#22c55e",
  greenDim: "#14532d",
  orange: "#f59e0b",
  orangeDim: "#451a03",
  purple: "#8b5cf6",
  purpleDim: "#2e1065",
  red: "#ef4444",
  redDim: "#450a0a",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  border: "#1e3a5f",
};

const FlowConnector = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center py-2" style={{ gap: 0 }}>
    <div
      className="w-0.5 h-6"
      style={{ background: `linear-gradient(to bottom, ${COLORS.border}, ${COLORS.blue}40)` }}
    />
    <div
      className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border"
      style={{
        background: `${COLORS.blue}15`,
        borderColor: `${COLORS.blue}40`,
        color: COLORS.blueLight,
      }}
    >
      <ChevronDown size={10} />
      {label}
      <ChevronDown size={10} />
    </div>
    <div
      className="w-0.5 h-6"
      style={{ background: `linear-gradient(to bottom, ${COLORS.blue}40, ${COLORS.border})` }}
    />
  </div>
);

interface PhaseCardProps {
  phase: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: string;
  dimColor: string;
  items: { icon?: React.ReactNode; label: string; desc?: string }[];
  glow?: boolean;
  wide?: boolean;
}

const PhaseCard = ({
  phase,
  icon,
  title,
  subtitle,
  color,
  dimColor,
  items,
  glow = false,
}: PhaseCardProps) => (
  <div
    className="relative rounded-2xl border overflow-hidden w-full"
    style={{
      background: `linear-gradient(135deg, ${COLORS.bgCard} 0%, ${dimColor}80 100%)`,
      borderColor: `${color}40`,
      boxShadow: glow
        ? `0 0 40px ${color}30, 0 0 80px ${color}15, inset 0 1px 0 ${color}20`
        : `0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 ${color}15`,
    }}
  >
    {glow && (
      <div
        className="absolute inset-0 opacity-5 animate-pulse"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${color}, transparent 70%)` }}
      />
    )}
    <div className="relative p-6">
      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${color}25, ${color}10)`,
            border: `1px solid ${color}40`,
          }}
        >
          <div style={{ color }}>{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded"
              style={{ background: `${color}20`, color }}
            >
              Fase {phase}
            </span>
          </div>
          <h3 className="font-bold text-lg leading-tight" style={{ color: COLORS.text }}>
            {title}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: COLORS.textMuted }}>
            {subtitle}
          </p>
        </div>
      </div>

      {/* Items grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 p-2.5 rounded-lg"
            style={{ background: `${color}08`, border: `1px solid ${color}15` }}
          >
            {item.icon && (
              <div className="flex-shrink-0 mt-0.5" style={{ color: `${color}cc` }}>
                {item.icon}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium" style={{ color: COLORS.text }}>
                {item.label}
              </div>
              {item.desc && (
                <div className="text-xs mt-0.5" style={{ color: COLORS.textMuted }}>
                  {item.desc}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MetricCard = ({
  label,
  value,
  sub,
  color,
  arrow,
  arrowLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  arrow?: boolean;
  arrowLabel?: string;
}) => (
  <div className="flex items-center gap-3">
    <div
      className="flex-1 rounded-xl p-4 text-center border"
      style={{
        background: `linear-gradient(135deg, ${COLORS.bgCard}, ${color}15)`,
        borderColor: `${color}40`,
        boxShadow: `0 0 20px ${color}20`,
      }}
    >
      <div className="text-xs font-bold tracking-wider uppercase mb-2" style={{ color: COLORS.textMuted }}>
        {label}
      </div>
      <div className="text-3xl font-black" style={{ color }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
          {sub}
        </div>
      )}
    </div>
    {arrow && (
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <ArrowRight size={20} style={{ color: COLORS.textDim }} />
        {arrowLabel && (
          <span className="text-xs text-center" style={{ color: COLORS.textDim, maxWidth: 60 }}>
            {arrowLabel}
          </span>
        )}
      </div>
    )}
  </div>
);

export default function SoraProcess() {
  return (
    <div
      className="min-h-screen w-full"
      style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "system-ui, sans-serif" }}
    >
      {/* Background grid pattern */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(${COLORS.blue} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.blue} 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-4 py-16">
        {/* ─── HERO ─── */}
        <div className="text-center mb-20">
          <img
            src={avisafeLogo}
            alt="Avisafe"
            className="h-14 mx-auto mb-8 opacity-90"
          />

          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold tracking-wider uppercase mb-6 border"
            style={{
              background: `${COLORS.purple}15`,
              borderColor: `${COLORS.purple}40`,
              color: COLORS.purple,
            }}
          >
            <Activity size={12} />
            EASA U-space · AI-drevet · SORA-sertifisert
          </div>

          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-4"
            style={{
              background: `linear-gradient(135deg, ${COLORS.text} 0%, ${COLORS.blueLight} 50%, ${COLORS.purple} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Intelligent SORA
            <br />
            <span className="text-3xl sm:text-4xl lg:text-5xl">fra data til beslutning</span>
          </h1>

          <p className="text-lg mb-3" style={{ color: COLORS.textMuted }}>
            Automatisert risikovurdering etter EASA U-space regelverket
          </p>
          <p
            className="text-sm font-semibold tracking-wide uppercase"
            style={{ color: COLORS.blue }}
          >
            Norges mest avanserte droneoperasjonsplattform
          </p>

          {/* Stats bar */}
          <div className="flex flex-wrap justify-center gap-8 mt-12">
            {[
              { value: "7+", label: "Datakilder" },
              { value: "5", label: "AI-analysekategorier" },
              { value: "SAIL I–VI", label: "SORA-sertifisering" },
              { value: "< 60s", label: "Analysertid" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-black" style={{ color: COLORS.blueLight }}>
                  {s.value}
                </div>
                <div className="text-xs" style={{ color: COLORS.textDim }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── FLOW DIAGRAM ─── */}
        <div className="space-y-0">

          {/* FASE 1 — Avisafe Data */}
          <PhaseCard
            phase={1}
            icon={<Database size={22} />}
            title="Avisafe Oppdragsdata"
            subtitle="Strukturerte operasjonsdata fra plattformen"
            color={COLORS.blue}
            dimColor={COLORS.blueDim}
            items={[
              { icon: <MapPin size={14} />, label: "Oppdragsdetaljer", desc: "Lokasjon, tid, rute, kunde" },
              { icon: <Users size={14} />, label: "Piloter & kompetanser", desc: "Sertifikater, flytimer, recency" },
              { icon: <Navigation size={14} />, label: "Droner", desc: "Modell, status, flytimer, inspeksjon" },
              { icon: <Layers size={14} />, label: "Utstyr", desc: "Vedlikeholdsstatus, tilgjengelighet" },
            ]}
          />

          <FlowConnector label="Kontekstdata" />

          {/* FASE 2 — Eksterne datakilder */}
          <PhaseCard
            phase={2}
            icon={<Globe size={22} />}
            title="Eksterne Datakilder"
            subtitle="Sanntidsdata fra offentlige og regulatoriske API-er"
            color={COLORS.green}
            dimColor={COLORS.greenDim}
            items={[
              {
                icon: <Wind size={14} />,
                label: "Yr.no / OpenMeteo",
                desc: "Temperatur, vind, kast, sikt, nedbør",
              },
              {
                icon: <Radio size={14} />,
                label: "OpenAIP Luftrom",
                desc: "CTR, TMA, R/D/P-soner, restriksjoner",
              },
              {
                icon: <MapPin size={14} />,
                label: "SSB Arealbruk (Geonorge WFS)",
                desc: "Bolig, industri, natur-klassifisering",
              },
              {
                icon: <Users size={14} />,
                label: "SSB Befolkning (rutenett WFS)",
                desc: "Tetthet per km² — direkte inn i GRC",
              },
            ]}
          />

          <FlowConnector label="Sanntidsdata" />

          {/* FASE 3 — Selskapssettings */}
          <PhaseCard
            phase={3}
            icon={<Shield size={22} />}
            title="Selskapssettings & Hard Stops"
            subtitle="Operatørens egendefinerte sikkerhetspolicyer og operative begrensninger"
            color={COLORS.red}
            dimColor={COLORS.redDim}
            items={[
              { icon: <Wind size={14} />, label: "Vindgrenser (m/s)", desc: "Middelvind og kast-terskel" },
              { icon: <Thermometer size={14} />, label: "Temperaturgrenser (°C)", desc: "Min og maks operasjonstemperatur" },
              { icon: <Navigation size={14} />, label: "Maks flyhøyde (m AGL)", desc: "Hardstop — overstyres ikke" },
              { icon: <Eye size={14} />, label: "BVLOS / Nattflyging", desc: "Tillatt eller ikke for selskapet" },
              { icon: <Users size={14} />, label: "Maks befolkningstetthet", desc: "Terskel for operasjonsgodkjenning" },
              { icon: <CheckCircle2 size={14} />, label: "Krav: observatør & reservebatteri", desc: "Operasjonelle minimumskrav" },
              { icon: <Lock size={14} />, label: "Operative begrensninger", desc: "Fritekst til AI-systemprompt" },
              { icon: <FileText size={14} />, label: "Operasjonsmanual", desc: "Policydokumenter som AI-kontekst" },
            ]}
          />

          <FlowConnector label="Selskapspolicyer" />

          {/* FASE 4 — Bruker-input */}
          <PhaseCard
            phase={4}
            icon={<User size={22} />}
            title="Pilot & Operatør Input"
            subtitle="Operasjonsspesifikke parametere fra piloten"
            color={COLORS.orange}
            dimColor={COLORS.orangeDim}
            items={[
              { icon: <Navigation size={14} />, label: "Flyhøyde & operasjonstype", desc: "VLOS / BVLOS" },
              { icon: <Users size={14} />, label: "Nærhet til folk", desc: "Ingen / spredt / tett bebyggelse" },
              { icon: <AlertTriangle size={14} />, label: "Kritisk infrastruktur", desc: "Nærhet og eksponeringsgrad" },
              { icon: <Eye size={14} />, label: "Antall observatører", desc: "Bemanning av sikkerhetsvakter" },
              { icon: <Radio size={14} />, label: "ATC-koordinering", desc: "Kontakt og clearance-status" },
              { icon: <MapPin size={14} />, label: "Reservelandingsplass", desc: "Definert nødlandingspunkt" },
            ]}
          />

          <FlowConnector label="Operasjonsparametre" />

          {/* FASE 5 — AI Analyse */}
          <PhaseCard
            phase={5}
            icon={<Brain size={22} />}
            title="AI Analyse — Første vurdering"
            subtitle="Claude AI analyserer alle inputs simultant mot SORA-rammeverket"
            color={COLORS.purple}
            dimColor={COLORS.purpleDim}
            glow
            items={[
              { icon: <Cpu size={14} />, label: "Simultant alle datakilder", desc: "700+ parametere analysert i én pass" },
              { icon: <AlertTriangle size={14} />, label: "Hard stop-sjekk", desc: "Automatisk blokkering ved brudd" },
              { icon: <BarChart3 size={14} />, label: "Risikoscore 1–10", desc: "Vektet aggregering per kategori" },
              { icon: <Wind size={14} />, label: "Værvurdering", desc: "Vind, sikt, temperatur, nedbør" },
              { icon: <Radio size={14} />, label: "Luftromsvurdering", desc: "CTR/TMA-konflikter, klareringer" },
              { icon: <Users size={14} />, label: "Pilot & utstyrsvurdering", desc: "Kompetanse, recency, vedlikehold" },
            ]}
          />

          <FlowConnector label="Risikovurdering" />

          {/* FASE 6 — Brukerens mitigeringer */}
          <PhaseCard
            phase={6}
            icon={<MessageSquare size={22} />}
            title="Pilotens Mitigeringer"
            subtitle="Piloter responderer på AI-analysen i 5 risikoklasser"
            color={COLORS.orange}
            dimColor={COLORS.orangeDim}
            items={[
              { icon: <Wind size={14} />, label: "Værtiltak", desc: "Planer for vindeksponering, nedbør" },
              { icon: <Radio size={14} />, label: "Luftromstiltak", desc: "ATC-koordinering, NOTAM-konfirmasjon" },
              { icon: <User size={14} />, label: "Pilotvurdering", desc: "Begrunnelse for kompetanse og recency" },
              { icon: <MapPin size={14} />, label: "Oppdragstiltak", desc: "Operasjonell kontigensplan" },
              { icon: <Cpu size={14} />, label: "Utstyrstiltak", desc: "Redundans, backup-systemer, inspeksjon" },
              { icon: <FileText size={14} />, label: "Oppdatert ConOps", desc: "Revidert operasjonskonsept til AI" },
            ]}
          />

          <FlowConnector label="Mitigeringer" />

          {/* FASE 7 — AI Re-vurdering */}
          <PhaseCard
            phase={7}
            icon={<Zap size={22} />}
            title="AI Re-vurdering — SORA-modus"
            subtitle="Ny AI-analyse med mitigeringer. Strukturert SORA-beregning etter EASA-metodikk"
            color={COLORS.purple}
            dimColor={COLORS.purpleDim}
            glow
            items={[
              { icon: <Brain size={14} />, label: "Ny komplett AI-analyse", desc: "Alle mitigeringer integrert" },
              { icon: <BarChart3 size={14} />, label: "GRC-beregning", desc: "iGRC → bakkemitigeringer → fGRC" },
              { icon: <Radio size={14} />, label: "ARC-klassifisering", desc: "Initial ARC → luftromsmitigeringer → Residual ARC" },
              { icon: <Layers size={14} />, label: "SAIL-matrise", desc: "Kombinert fGRC × Residual ARC → SAIL I–VI" },
            ]}
          />

          <FlowConnector label="SORA-analyse" />

          {/* OUTPUT */}
          <div
            className="relative rounded-2xl border overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${COLORS.bgCard} 0%, ${COLORS.greenDim}60 50%, ${COLORS.bgCard} 100%)`,
              borderColor: `${COLORS.green}50`,
              boxShadow: `0 0 60px ${COLORS.green}25, 0 0 120px ${COLORS.green}10`,
            }}
          >
            <div
              className="absolute inset-0 opacity-5 animate-pulse"
              style={{
                background: `radial-gradient(ellipse at 50% 100%, ${COLORS.green}, transparent 70%)`,
              }}
            />
            <div className="relative p-6">
              <div className="text-center mb-8">
                <div
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold mb-3 border"
                  style={{
                    background: `${COLORS.green}20`,
                    borderColor: `${COLORS.green}40`,
                    color: COLORS.green,
                  }}
                >
                  <CheckCircle2 size={14} />
                  SORA OUTPUT
                </div>
                <h3 className="text-2xl font-black" style={{ color: COLORS.text }}>
                  Strukturert risikovurdering
                </h3>
                <p className="text-sm mt-1" style={{ color: COLORS.textMuted }}>
                  Komplett SORA-rapport etter EASA JO-3.1 metodikk
                </p>
              </div>

              {/* GRC row */}
              <div className="mb-4">
                <div className="text-xs font-bold tracking-wider uppercase mb-3" style={{ color: COLORS.textDim }}>
                  Bakkerisikoklasse (GRC)
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <MetricCard label="iGRC" value="3" sub="Initial" color={COLORS.orange} arrow arrowLabel="Bakke­mitigeringer" />
                  <MetricCard label="fGRC" value="2" sub="Final" color={COLORS.green} />
                </div>
              </div>

              {/* ARC row */}
              <div className="mb-4">
                <div className="text-xs font-bold tracking-wider uppercase mb-3" style={{ color: COLORS.textDim }}>
                  Luftromsrisikoklasse (ARC)
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <MetricCard label="Initial ARC" value="B" sub="Ukontrollert luftrom" color={COLORS.orange} arrow arrowLabel="Luftroms­mitigeringer" />
                  <MetricCard label="Residual ARC" value="A" sub="Etter mitigeringer" color={COLORS.green} />
                </div>
              </div>

              {/* SAIL + Rest-risiko */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div
                  className="rounded-xl p-4 text-center border"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.blue}15)`,
                    borderColor: `${COLORS.blue}40`,
                    boxShadow: `0 0 20px ${COLORS.blue}20`,
                  }}
                >
                  <div className="text-xs font-bold tracking-wider uppercase mb-2" style={{ color: COLORS.textMuted }}>
                    SAIL-nivå
                  </div>
                  <div className="text-3xl font-black" style={{ color: COLORS.blue }}>II</div>
                  <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>SAIL I–VI skala</div>
                </div>

                <div
                  className="rounded-xl p-4 text-center border"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.green}15)`,
                    borderColor: `${COLORS.green}40`,
                    boxShadow: `0 0 20px ${COLORS.green}20`,
                  }}
                >
                  <div className="text-xs font-bold tracking-wider uppercase mb-2" style={{ color: COLORS.textMuted }}>
                    Rest-risiko
                  </div>
                  <div className="text-3xl font-black" style={{ color: COLORS.green }}>Lav</div>
                  <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>Etter alle mitigeringer</div>
                </div>

                <div
                  className="rounded-xl p-4 text-center border"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.bgCard}, ${COLORS.purple}15)`,
                    borderColor: `${COLORS.purple}40`,
                    boxShadow: `0 0 20px ${COLORS.purple}20`,
                  }}
                >
                  <div className="text-xs font-bold tracking-wider uppercase mb-2" style={{ color: COLORS.textMuted }}>
                    OSO-krav
                  </div>
                  <div className="text-3xl font-black" style={{ color: COLORS.purple }}>M</div>
                  <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>Medium robusthet</div>
                </div>
              </div>

              {/* GO / CAUTION / NO-GO */}
              <div
                className="rounded-xl p-5 text-center border"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.greenDim}80, ${COLORS.green}15)`,
                  borderColor: `${COLORS.green}60`,
                  boxShadow: `0 0 30px ${COLORS.green}30`,
                }}
              >
                <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: COLORS.textMuted }}>
                  AI-anbefaling
                </div>
                <div className="text-5xl font-black tracking-widest mb-2" style={{ color: COLORS.green }}>
                  GO
                </div>
                <p className="text-sm" style={{ color: COLORS.textMuted }}>
                  Alle hardstops bestått · Mitigeringer tilstrekkelige · SAIL II godkjent
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── FEATURE HIGHLIGHTS ─── */}
        <div className="mt-24 mb-16">
          <h2
            className="text-3xl font-black text-center mb-12"
            style={{ color: COLORS.text }}
          >
            Hvorfor Avisafe SORA?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                color: COLORS.blue,
                icon: <Cpu size={28} />,
                title: "Fullt automatisert",
                points: [
                  "AI henter alle datakilder automatisk",
                  "Ingen manuell datainnsamling",
                  "Analyse ferdig på under 60 sekunder",
                  "700+ parametere vurdert simultant",
                ],
              },
              {
                color: COLORS.purple,
                icon: <Clock size={28} />,
                title: "100% sporbar",
                points: [
                  "Komplett revisjonsspor",
                  "Alle inputs og outputs lagret",
                  "Pilot-signatur på hver vurdering",
                  "Eksport til PDF og ECCAIRS",
                ],
              },
              {
                color: COLORS.green,
                icon: <Shield size={28} />,
                title: "Regulatorisk klar",
                points: [
                  "EASA SORA JO-3.1 metodikk",
                  "U-space regelverkssamsvar",
                  "Automatisk SAIL-beregning",
                  "Integrert med norske myndigheter",
                ],
              },
            ].map((col) => (
              <div
                key={col.title}
                className="rounded-2xl p-6 border"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.bgCard} 0%, ${col.color}10 100%)`,
                  borderColor: `${col.color}30`,
                }}
              >
                <div
                  className="flex items-center justify-center w-14 h-14 rounded-2xl mx-auto mb-4"
                  style={{ background: `${col.color}20`, border: `1px solid ${col.color}40` }}
                >
                  <div style={{ color: col.color }}>{col.icon}</div>
                </div>
                <h3 className="text-lg font-bold text-center mb-4" style={{ color: COLORS.text }}>
                  {col.title}
                </h3>
                <ul className="space-y-2">
                  {col.points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" style={{ color: col.color }} />
                      <span className="text-sm" style={{ color: COLORS.textMuted }}>
                        {p}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ─── FOOTER ─── */}
        <div
          className="text-center pt-12 border-t"
          style={{ borderColor: COLORS.border }}
        >
          <img src={avisafeLogo} alt="Avisafe" className="h-8 mx-auto mb-3 opacity-60" />
          <p className="text-sm" style={{ color: COLORS.textDim }}>
            Powered by AviSafe · EASA SORA · AI-drevet droneoperasjonsplattform
          </p>
          <p className="text-xs mt-2" style={{ color: COLORS.textDim }}>
            © {new Date().getFullYear()} AviSafe AS · Norges mest avanserte droneoperasjonsplattform
          </p>
        </div>
      </div>
    </div>
  );
}
