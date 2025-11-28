import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings, Save, Send, Loader2, Eye, EyeOff } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface EmailSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EmailSettings {
  id?: string;
  company_id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure: boolean;
  from_name: string;
  from_email: string;
  enabled: boolean;
}

export const EmailSettingsDialog = ({ open, onOpenChange }: EmailSettingsDialogProps) => {
  const { companyId } = useAuth();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [settings, setSettings] = useState<EmailSettings>({
    company_id: companyId || "",
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_pass: "",
    smtp_secure: false,
    from_name: "",
    from_email: "",
    enabled: false,
  });

  useEffect(() => {
    if (open && companyId) {
      fetchSettings();
    }
  }, [open, companyId]);

  const fetchSettings = async () => {
    if (!companyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("email_settings" as any)
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data as unknown as EmailSettings);
      } else {
        // Reset to defaults if no settings found
        setSettings({
          company_id: companyId,
          smtp_host: "",
          smtp_port: 587,
          smtp_user: "",
          smtp_pass: "",
          smtp_secure: false,
          from_name: "",
          from_email: "",
          enabled: false,
        });
      }
    } catch (error: any) {
      console.error("Error fetching email settings:", error);
      toast.error("Kunne ikke laste innstillinger");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companyId) {
      toast.error("Du må være logget inn");
      return;
    }

    // Validate required fields
    if (!settings.smtp_host || !settings.smtp_user || !settings.from_email) {
      toast.error("Vennligst fyll ut alle påkrevde felt");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(settings.from_email)) {
      toast.error("Ugyldig avsender e-postadresse");
      return;
    }

    setSaving(true);
    try {
      if (settings.id) {
        // Update existing settings
        const { error } = await supabase
          .from("email_settings" as any)
          .update({
            smtp_host: settings.smtp_host,
            smtp_port: settings.smtp_port,
            smtp_user: settings.smtp_user,
            smtp_pass: settings.smtp_pass,
            smtp_secure: settings.smtp_secure,
            from_name: settings.from_name,
            from_email: settings.from_email,
            enabled: settings.enabled,
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Create new settings
        const { error } = await supabase
          .from("email_settings" as any)
          .insert({
            company_id: companyId,
            smtp_host: settings.smtp_host,
            smtp_port: settings.smtp_port,
            smtp_user: settings.smtp_user,
            smtp_pass: settings.smtp_pass,
            smtp_secure: settings.smtp_secure,
            from_name: settings.from_name,
            from_email: settings.from_email,
            enabled: settings.enabled,
          });

        if (error) throw error;
      }

      toast.success("Innstillinger lagret");
      fetchSettings();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error("Kunne ikke lagre innstillinger: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error("Vennligst skriv inn en e-postadresse for test");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      toast.error("Ugyldig e-postadresse");
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-email", {
        body: {
          company_id: companyId,
          recipient_email: testEmail,
        },
      });

      if (error) throw error;

      toast.success("Test e-post sendt! Sjekk innboksen din.");
    } catch (error: any) {
      console.error("Error sending test email:", error);
      toast.error("Kunne ikke sende test e-post: " + error.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={isMobile ? "max-w-[95vw]" : "max-w-2xl"}>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isMobile ? "max-w-[95vw] max-h-[85vh]" : "max-w-2xl max-h-[90vh]"} overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isMobile ? "text-base" : "text-lg"}`}>
            <Settings className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
            E-postinnstillinger
          </DialogTitle>
          <DialogDescription className={isMobile ? "text-xs" : "text-sm"}>
            Konfigurer SMTP-innstillinger for å sende e-post fra systemet
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 py-4">
          {/* Status */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <Label className={isMobile ? "text-xs" : "text-sm"}>E-post status</Label>
              <p className={`text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>
                {settings.enabled ? "Aktivert" : "Deaktivert"}
              </p>
            </div>
            <Badge variant={settings.enabled ? "default" : "secondary"}>
              {settings.enabled ? "Aktiv" : "Inaktiv"}
            </Badge>
          </div>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="enabled" className={isMobile ? "text-xs" : "text-sm"}>
              Aktiver e-postsending
            </Label>
            <Switch
              id="enabled"
              checked={settings.enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enabled: checked })
              }
            />
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className={`font-semibold ${isMobile ? "text-sm" : "text-base"}`}>SMTP-konfigurasjon</h3>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp_host" className={isMobile ? "text-xs" : "text-sm"}>
                  SMTP Host *
                </Label>
                <Input
                  id="smtp_host"
                  value={settings.smtp_host}
                  onChange={(e) =>
                    setSettings({ ...settings, smtp_host: e.target.value })
                  }
                  placeholder="smtp.gmail.com"
                  className={isMobile ? "h-9 text-sm" : ""}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp_port" className={isMobile ? "text-xs" : "text-sm"}>
                    SMTP Port *
                  </Label>
                  <Input
                    id="smtp_port"
                    type="number"
                    value={settings.smtp_port}
                    onChange={(e) =>
                      setSettings({ ...settings, smtp_port: parseInt(e.target.value) || 587 })
                    }
                    className={isMobile ? "h-9 text-sm" : ""}
                  />
                </div>

                <div className="flex items-center space-x-2 pt-8">
                  <Switch
                    id="smtp_secure"
                    checked={settings.smtp_secure}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, smtp_secure: checked })
                    }
                  />
                  <Label htmlFor="smtp_secure" className={isMobile ? "text-xs" : "text-sm"}>
                    TLS/SSL
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp_user" className={isMobile ? "text-xs" : "text-sm"}>
                  Brukernavn / E-post *
                </Label>
                <Input
                  id="smtp_user"
                  value={settings.smtp_user}
                  onChange={(e) =>
                    setSettings({ ...settings, smtp_user: e.target.value })
                  }
                  placeholder="din-epost@example.com"
                  className={isMobile ? "h-9 text-sm" : ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp_pass" className={isMobile ? "text-xs" : "text-sm"}>
                  Passord *
                </Label>
                <div className="relative">
                  <Input
                    id="smtp_pass"
                    type={showPassword ? "text" : "password"}
                    value={settings.smtp_pass}
                    onChange={(e) =>
                      setSettings({ ...settings, smtp_pass: e.target.value })
                    }
                    placeholder="••••••••"
                    className={`${isMobile ? "h-9 text-sm" : ""} pr-10`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className={`font-semibold ${isMobile ? "text-sm" : "text-base"}`}>Avsender-innstillinger</h3>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="from_name" className={isMobile ? "text-xs" : "text-sm"}>
                  Avsendernavn
                </Label>
                <Input
                  id="from_name"
                  value={settings.from_name}
                  onChange={(e) =>
                    setSettings({ ...settings, from_name: e.target.value })
                  }
                  placeholder="Ditt Selskap"
                  className={isMobile ? "h-9 text-sm" : ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="from_email" className={isMobile ? "text-xs" : "text-sm"}>
                  Avsender e-post *
                </Label>
                <Input
                  id="from_email"
                  type="email"
                  value={settings.from_email}
                  onChange={(e) =>
                    setSettings({ ...settings, from_email: e.target.value })
                  }
                  placeholder="noreply@example.com"
                  className={isMobile ? "h-9 text-sm" : ""}
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className={`font-semibold ${isMobile ? "text-sm" : "text-base"}`}>Test e-post</h3>
            <div className="space-y-2">
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                className={isMobile ? "h-9 text-sm" : ""}
              />
              <p className={`text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>
                Send en test-epost for å verifisere at innstillingene fungerer
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleTestEmail}
              disabled={testing || !settings.smtp_host}
              variant="outline"
              className="flex-1"
              size={isMobile ? "sm" : "default"}
            >
              {testing ? (
                <Loader2 className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} animate-spin`} />
              ) : (
                <Send className={isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} />
              )}
              {isMobile ? "Send" : "Send test"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1"
              size={isMobile ? "sm" : "default"}
            >
              {saving ? (
                <Loader2 className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} animate-spin`} />
              ) : (
                <Save className={isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} />
              )}
              {saving ? "Lagrer..." : "Lagre innstillinger"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
