import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";

export interface PasswordCheck {
  key: string;
  test: (pw: string) => boolean;
}

export const passwordChecks: PasswordCheck[] = [
  { key: "passwordMinLength", test: (pw) => pw.length >= 8 },
  { key: "passwordUppercase", test: (pw) => /[A-Z]/.test(pw) },
  { key: "passwordLowercase", test: (pw) => /[a-z]/.test(pw) },
  { key: "passwordNumber", test: (pw) => /[0-9]/.test(pw) },
  { key: "passwordSpecial", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export const isPasswordValid = (pw: string) => passwordChecks.every((c) => c.test(pw));

export const passwordErrorMessage = (pw: string): string | null => {
  const failed = passwordChecks.filter((c) => !c.test(pw));
  if (failed.length === 0) return null;
  const list = failed.map((f) => i18n.t(`auth.${f.key}`).toLowerCase()).join(", ");
  return i18n.t("auth.passwordMustContain", { list });
};

interface Props {
  password: string;
  className?: string;
}

export const PasswordRequirements = ({ password, className }: Props) => {
  const { t } = useTranslation();
  return (
    <div className={cn("rounded-md border border-border/50 bg-muted/30 p-3 space-y-1.5", className)}>
      <p className="text-xs font-medium text-muted-foreground mb-1">{t("auth.passwordRequirementsTitle")}</p>
      {passwordChecks.map((check) => {
        const ok = check.test(password);
        return (
          <div
            key={check.key}
            className={cn(
              "flex items-center gap-2 text-xs transition-colors",
              ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
            )}
          >
            {ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0 opacity-60" />}
            <span>{t(`auth.${check.key}`)}</span>
          </div>
        );
      })}
    </div>
  );
};
