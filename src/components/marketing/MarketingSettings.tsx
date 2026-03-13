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
import { Save } from "lucide-react";
import { BRAND_VOICE_DEFAULTS } from "./marketingPresets";

const STORAGE_KEY = "avisafe-marketing-brand-settings";

const platformIntegrations = [
  { name: "LinkedIn", status: "Planlagt", desc: "Automatisk publisering kommer snart." },
  { name: "Facebook", status: "Aktiv", desc: "Direkte publisering via Graph API." },
  { name: "Instagram", status: "Planlagt", desc: "Automatisk publisering kommer snart." },
  { name: "Blogg", status: "Planlagt", desc: "CMS-integrasjon kommer snart." },
  { name: "E-post", status: "Planlagt", desc: "Nyhetsbrev-integrasjon kommer snart." },
];

export const MarketingSettings = () => {
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
          <div className="grid grid-cols-2 gap-3">
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
