import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Linkedin, Loader2, CheckCircle2 } from "lucide-react";
import { BRAND_VOICE_DEFAULTS } from "./marketingPresets";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

const STORAGE_KEY = "avisafe-marketing-brand-settings";

const platformIntegrations = [
  { name: "LinkedIn", status: "Aktiv", desc: "OAuth 2.0-integrasjon med direkte publisering." },
  { name: "Facebook", status: "Aktiv", desc: "Direkte publisering via Graph API." },
  { name: "Instagram", status: "Aktiv", desc: "Direkte publisering via Instagram Graph API." },
  { name: "Blogg", status: "Planlagt", desc: "CMS-integrasjon kommer snart." },
  { name: "E-post", status: "Planlagt", desc: "Nyhetsbrev-integrasjon kommer snart." },
];

export const MarketingSettings = () => {
  const { companyId } = useAuth();
  const [connectingLinkedin, setConnectingLinkedin] = useState(false);
  const [customRules, setCustomRules] = useState("");
  const [bannedPhrases, setBannedPhrases] = useState("");
  const [ctaStyle, setCtaStyle] = useState("soft");
  const [hashtagStyle, setHashtagStyle] = useState("moderate");
  const [audienceLinkedin, setAudienceLinkedin] = useState(BRAND_VOICE_DEFAULTS.defaultAudiences.linkedin);
  const [audienceFacebook, setAudienceFacebook] = useState(BRAND_VOICE_DEFAULTS.defaultAudiences.facebook);
  const [audienceInstagram, setAudienceInstagram] = useState(BRAND_VOICE_DEFAULTS.defaultAudiences.instagram);
  const [audienceBlog, setAudienceBlog] = useState(BRAND_VOICE_DEFAULTS.defaultAudiences.blog);
  const [audienceEmail, setAudienceEmail] = useState(BRAND_VOICE_DEFAULTS.defaultAudiences.email);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setCustomRules(parsed.customRules || "");
        setBannedPhrases(parsed.bannedPhrases?.join(", ") || "");
        setCtaStyle(parsed.ctaStyle || "soft");
        setHashtagStyle(parsed.hashtagStyle || "moderate");
        if (parsed.audiences) {
          setAudienceLinkedin(parsed.audiences.linkedin || BRAND_VOICE_DEFAULTS.defaultAudiences.linkedin);
          setAudienceFacebook(parsed.audiences.facebook || BRAND_VOICE_DEFAULTS.defaultAudiences.facebook);
          setAudienceInstagram(parsed.audiences.instagram || BRAND_VOICE_DEFAULTS.defaultAudiences.instagram);
          setAudienceBlog(parsed.audiences.blog || BRAND_VOICE_DEFAULTS.defaultAudiences.blog);
          setAudienceEmail(parsed.audiences.email || BRAND_VOICE_DEFAULTS.defaultAudiences.email);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const { data: linkedinStatus } = useQuery({
    queryKey: ["linkedin-status", companyId],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/linkedin-oauth?action=status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId }),
        }
      );
      return res.json();
    },
    enabled: !!companyId,
  });

  const handleConnectLinkedin = async () => {
    setConnectingLinkedin(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/linkedin-oauth?action=authorize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId }),
        }
      );
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "linkedin-oauth", "width=600,height=700");
      } else {
        toast.error(data.error || "Kunne ikke starte LinkedIn-kobling");
      }
    } catch (e: any) {
      toast.error(e.message || "Feil ved LinkedIn-kobling");
    } finally {
      setConnectingLinkedin(false);
    }
  };

  const handleSave = () => {
    const settings = {
      customRules,
      bannedPhrases: bannedPhrases.split(",").map((s) => s.trim()).filter(Boolean),
      ctaStyle,
      hashtagStyle,
      audiences: {
        linkedin: audienceLinkedin,
        facebook: audienceFacebook,
        instagram: audienceInstagram,
        blog: audienceBlog,
        email: audienceEmail,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    toast.success("Innstillinger lagret");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Innstillinger</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          Konfigurer merkevare-stemme, regler og plattforminnstillinger.
        </p>
      </div>

      {/* Brand voice rules */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Merkevare-stemme</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Standard regler (innebygd)</label>
            <div className="mt-1 p-3 rounded-md bg-muted/30 border border-border text-xs text-muted-foreground space-y-1">
              {BRAND_VOICE_DEFAULTS.rules.map((rule, i) => (
                <p key={i}>• {rule}</p>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Egne tilleggsregler</label>
            <Textarea
              value={customRules}
              onChange={(e) => setCustomRules(e.target.value)}
              rows={3}
              placeholder="Legg til egne regler for AI-generering..."
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Banned phrases */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bannlyste fraser</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground">Standard bannlyste (innebygd)</label>
            <p className="text-xs text-muted-foreground mt-1">
              {BRAND_VOICE_DEFAULTS.bannedPhrases.join(", ")}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Egne bannlyste fraser</label>
            <Input
              value={bannedPhrases}
              onChange={(e) => setBannedPhrases(e.target.value)}
              placeholder="Kommaseparert liste..."
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* CTA & Hashtag style */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stil-preferanser</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground">Foretrukket CTA-stil</label>
              <Select value={ctaStyle} onValueChange={setCtaStyle}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRAND_VOICE_DEFAULTS.ctaStyles.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Foretrukket hashtagstil</label>
              <Select value={hashtagStyle} onValueChange={setHashtagStyle}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRAND_VOICE_DEFAULTS.hashtagStyles.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default audiences */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Standard målgrupper per plattform</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "LinkedIn", value: audienceLinkedin, setter: setAudienceLinkedin },
            { label: "Facebook", value: audienceFacebook, setter: setAudienceFacebook },
            { label: "Instagram", value: audienceInstagram, setter: setAudienceInstagram },
            { label: "Blogg", value: audienceBlog, setter: setAudienceBlog },
            { label: "E-post", value: audienceEmail, setter: setAudienceEmail },
          ].map((item) => (
            <div key={item.label}>
              <label className="text-sm font-medium text-foreground">{item.label}</label>
              <Input
                value={item.value}
                onChange={(e) => item.setter(e.target.value)}
                className="mt-1"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* LinkedIn configuration */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Linkedin className="w-4 h-4" />
            LinkedIn-konfigurasjon
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {linkedinStatus?.connected ? (
            <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Koblet til LinkedIn</p>
                <p className="text-xs text-muted-foreground">
                  {linkedinStatus.memberUrn}
                  {linkedinStatus.expiresAt && ` · Utløper ${new Date(linkedinStatus.expiresAt).toLocaleDateString("nb-NO")}`}
                </p>
              </div>
              <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={handleConnectLinkedin}>
                Koble på nytt
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Koble til LinkedIn for å publisere innlegg direkte fra markedsføringsmodulen.
              </p>
              <Button
                onClick={handleConnectLinkedin}
                disabled={connectingLinkedin}
                className="gap-2 bg-[#0A66C2] hover:bg-[#0A66C2]/90 text-white"
              >
                {connectingLinkedin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Linkedin className="w-4 h-4" />}
                Koble til LinkedIn
              </Button>
            </div>
          )}
          <div className="rounded-md bg-muted/30 border border-border p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Oppsett:</p>
            <p>1. Registrer redirect-URI i LinkedIn-appen din:</p>
            <code className="block text-[10px] bg-muted p-1 rounded">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/linkedin-oauth?action=callback</code>
            <p>2. Sørg for at appen har <code>w_member_social</code>, <code>openid</code> og <code>profile</code> scopes</p>
          </div>
        </CardContent>
      </Card>

      {/* Facebook configuration */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Facebook-konfigurasjon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Facebook Page Access Token og Page ID konfigureres som Supabase secrets.
            Kontakt superadmin for oppsett. Tokenet må ha <code>pages_manage_posts</code>-tillatelse.
          </p>
          <div className="rounded-md bg-muted/30 border border-border p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Slik setter du opp:</p>
            <p>1. Gå til <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">developers.facebook.com</a></p>
            <p>2. Opprett en app → legg til «Pages API»</p>
            <p>3. Generer en langvarig Page Access Token</p>
            <p>4. Legg til som Supabase secrets: <code>FACEBOOK_PAGE_ACCESS_TOKEN</code> og <code>FACEBOOK_PAGE_ID</code></p>
          </div>
        </CardContent>
      </Card>

      {/* Instagram configuration */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Instagram-konfigurasjon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Instagram bruker en egen app med Instagram-login. Krever <code>instagram_business_basic</code> og <code>instagram_content_publish</code> tillatelser.
          </p>
          <div className="rounded-md bg-muted/30 border border-border p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Slik setter du opp:</p>
            <p>1. Gå til <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">developers.facebook.com</a> → «API setup with Instagram login»</p>
            <p>2. Legg til tillatelser: <code>instagram_business_basic</code>, <code>instagram_content_publish</code></p>
            <p>3. Generer en Access Token for Instagram-kontoen din</p>
            <p>4. Legg til som Supabase secrets: <code>INSTAGRAM_ACCESS_TOKEN</code> og <code>INSTAGRAM_BUSINESS_ACCOUNT_ID</code></p>
          </div>
        </CardContent>
      </Card>

      {/* Platform integrations */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Plattformintegrasjoner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {platformIntegrations.map((p) => (
            <div key={p.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div>
                <p className="text-sm font-medium text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </div>
              <Badge variant="outline" className={`text-xs ${p.status === "Aktiv" ? "border-green-500 text-green-600" : ""}`}>{p.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="gap-2">
        <Save className="w-4 h-4" />
        Lagre innstillinger
      </Button>
    </div>
  );
};
