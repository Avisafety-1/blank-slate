import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { SoraProfilesSection } from "@/components/admin/SoraProfilesSection";

const SoraProfiles = () => {
  const { t } = useTranslation();
  const { companyId, isAdmin } = useAuth();
  const navigate = useNavigate();

  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">{t("soraProfile.adminOnly")}</div>;

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-4">
      <GlassCard className="p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin?tab=child-companies&section=sora-profiles")} aria-label={t("common.back")} className="shrink-0 mt-0.5">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold break-words">{t("soraProfile.pageTitle")}</h1>
            <p className="text-sm text-muted-foreground break-words">{t("soraProfile.pageDescription")}</p>
          </div>
        </div>
      </GlassCard>
      {companyId && <SoraProfilesSection companyId={companyId} enabled />}
    </div>
  );
};

export default SoraProfiles;
