import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, Apple, Share, MoreVertical, Plus, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import avisafeLogo from "@/assets/avisafe-logo-text.png";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Installer() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-4">
          <img 
            src={avisafeLogo} 
            alt="AviSafe" 
            className="h-16 mx-auto dark:invert"
          />
          <h1 className="text-2xl font-bold text-foreground">
            {t("installer.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("installer.subtitle")}
          </p>
        </div>

        {isInstalled ? (
          <Card className="border-green-500/50 bg-green-500/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-green-600 dark:text-green-400">
                <Check className="w-6 h-6" />
                <span className="font-medium">
                  {t("installer.alreadyInstalled")}
                </span>
              </div>
            </CardContent>
          </Card>
        ) : deferredPrompt ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                {t("installer.installNow")}
              </CardTitle>
              <CardDescription>
                {t("installer.oneClickInstall")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleInstallClick} className="w-full" size="lg">
                <Download className="w-4 h-4 mr-2" />
                {t("installer.installButton")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {isIOS && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Apple className="w-5 h-5" />
                    {t("installer.iosTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t("installer.iosDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{t("installer.iosStep1")}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Share className="w-4 h-4" /> {t("installer.iosStep1Desc")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{t("installer.iosStep2")}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Plus className="w-4 h-4" /> {t("installer.iosStep2Desc")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{t("installer.iosStep3")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("installer.iosStep3Desc")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {isAndroid && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5" />
                    {t("installer.androidTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t("installer.androidDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{t("installer.androidStep1")}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MoreVertical className="w-4 h-4" /> {t("installer.androidStep1Desc")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{t("installer.androidStep2")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("installer.androidStep2Desc")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{t("installer.androidStep3")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("installer.androidStep3Desc")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!isIOS && !isAndroid && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="w-5 h-5" />
                    {t("installer.desktopTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t("installer.desktopDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t("installer.desktopInstructions")}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <div className="text-center">
          <Button variant="ghost" onClick={() => window.history.back()}>
            {t("actions.back")}
          </Button>
        </div>
      </div>
    </div>
  );
}