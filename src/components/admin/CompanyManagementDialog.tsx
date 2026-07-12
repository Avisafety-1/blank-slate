import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Plane, Radio } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useTranslation } from "react-i18next";

interface Company {
  id: string;
  navn: string;
  org_nummer: string | null;
  adresse: string | null;
  adresse_lat?: number | null;
  adresse_lon?: number | null;
  kontakt_epost: string | null;
  kontakt_telefon: string | null;
  aktiv: boolean;
  selskapstype?: string | null;
  stripe_exempt?: boolean;
  parent_company_id?: string | null;
}

interface CompanyManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  onSuccess: () => void;
  /** When set, locks parent_company_id to this value (used by admin child-company flow) */
  forceParentCompanyId?: string;
}

const companySchema = z.object({
  navn: z.string()
    .trim()
    .min(1, "Selskapsnavn er påkrevd")
    .max(200, "Selskapsnavn må være under 200 tegn"),
  selskapstype: z.enum(['droneoperator', 'flyselskap']),
  org_nummer: z.string()
    .trim()
    .max(20, "Org.nummer må være under 20 tegn")
    .optional()
    .or(z.literal("")),
  adresse: z.string()
    .trim()
    .max(500, "Adresse må være under 500 tegn")
    .optional()
    .or(z.literal("")),
  adresse_lat: z.number().nullable().optional(),
  adresse_lon: z.number().nullable().optional(),
  kontakt_epost: z.string()
    .trim()
    .email("Ugyldig e-postadresse")
    .max(255, "E-post må være under 255 tegn")
    .optional()
    .or(z.literal("")),
  kontakt_telefon: z.string()
    .trim()
    .max(20, "Telefonnummer må være under 20 tegn")
    .optional()
    .or(z.literal("")),
  parent_company_id: z.string().nullable().optional(),
  default_language: z.enum(['no', 'en']).default('no'),
});

type CompanyFormData = z.infer<typeof companySchema>;

export const CompanyManagementDialog = ({
  open,
  onOpenChange,
  company,
  onSuccess,
  forceParentCompanyId,
}: CompanyManagementDialogProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stripeExempt, setStripeExempt] = useState(false);
  const [departmentsEnabled, setDepartmentsEnabled] = useState(false);
  const [allCompanies, setAllCompanies] = useState<{id: string; navn: string}[]>([]);
  const { isSuperAdmin } = useAuth();
  const { t } = useTranslation();
  const isCreating = !company;

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      navn: "",
      selskapstype: "droneoperator",
      org_nummer: "",
      adresse: "",
      adresse_lat: null,
      adresse_lon: null,
      kontakt_epost: "",
      kontakt_telefon: "",
      parent_company_id: null,
      default_language: 'no',
    },
  });

  // Fetch all companies for parent selector (superadmin only)
  useEffect(() => {
    if (open && isSuperAdmin) {
      supabase
        .from("companies")
        .select("id, navn")
        .order("navn")
        .then(({ data }) => setAllCompanies(data || []));
    }
  }, [open, isSuperAdmin]);

  useEffect(() => {
    if (open) {
      if (company) {
        setStripeExempt(company.stripe_exempt ?? false);
        setDepartmentsEnabled((company as any).departments_enabled ?? false);
        form.reset({
          navn: company.navn,
          selskapstype: (company.selskapstype as 'droneoperator' | 'flyselskap') || "droneoperator",
          org_nummer: company.org_nummer || "",
          adresse: company.adresse || "",
          adresse_lat: company.adresse_lat || null,
          adresse_lon: company.adresse_lon || null,
          kontakt_epost: company.kontakt_epost || "",
          kontakt_telefon: company.kontakt_telefon || "",
          parent_company_id: company.parent_company_id || null,
          default_language: ((company as any).default_language as 'no' | 'en') || 'no',
        });
      } else {
        setStripeExempt(false);
        setDepartmentsEnabled(false);
        form.reset({
          navn: "",
          selskapstype: "droneoperator",
          org_nummer: "",
          adresse: "",
          adresse_lat: null,
          adresse_lon: null,
          kontakt_epost: "",
          kontakt_telefon: "",
          parent_company_id: null,
          default_language: 'no',
        });
      }
    }
  }, [open, company, form]);

  const onSubmit = async (data: CompanyFormData) => {
    setIsSubmitting(true);
    
    try {
      let inheritedStripeExempt = stripeExempt;
      let inheritedDjiEnabled = false;
      let inheritedLanguage: 'no' | 'en' | null = null;
      const parentId = forceParentCompanyId || data.parent_company_id || null;

      // Inherit settings from parent company when creating a child
      if (isCreating && parentId) {
        const { data: parentCompany } = await supabase
          .from("companies")
          .select("stripe_exempt, dji_flightlog_enabled, selskapstype, default_language")
          .eq("id", parentId)
          .single();
        if (parentCompany) {
          inheritedStripeExempt = parentCompany.stripe_exempt;
          inheritedDjiEnabled = parentCompany.dji_flightlog_enabled;
          const pl = (parentCompany as any).default_language;
          if (pl === 'no' || pl === 'en') inheritedLanguage = pl;
          if (!data.selskapstype) {
            data.selskapstype = (parentCompany.selskapstype as 'droneoperator' | 'flyselskap') || 'droneoperator';
          }
        }
      }

      const companyData: any = {
        navn: data.navn,
        selskapstype: data.selskapstype,
        org_nummer: data.org_nummer || null,
        adresse: data.adresse || null,
        adresse_lat: data.adresse_lat || null,
        adresse_lon: data.adresse_lon || null,
        kontakt_epost: data.kontakt_epost || null,
        kontakt_telefon: data.kontakt_telefon || null,
        stripe_exempt: inheritedStripeExempt,
        parent_company_id: parentId,
        departments_enabled: departmentsEnabled,
        default_language: (isCreating && inheritedLanguage) ? inheritedLanguage : (data.default_language || 'no'),
      };

      if (isCreating) {
        companyData.dji_flightlog_enabled = inheritedDjiEnabled;
      }

      if (isCreating) {
        // registration_code is auto-generated by trigger
        const { error } = await supabase
          .from("companies")
          .insert(companyData as any);

        if (error) throw error;
        toast.success(t("admin.companyDialog.toastCreated"));
      } else {
        const { error } = await supabase
          .from("companies")
          .update(companyData)
          .eq("id", company.id);

        if (error) throw error;
        toast.success(t("admin.companyDialog.toastUpdated"));
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving company:", error);
      toast.error(t("admin.companyDialog.toastSaveError", { error: error.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCreating ? t("admin.companyDialog.createTitle") : t("admin.companyDialog.editTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="navn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.companyDialog.nameLabel")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t("admin.companyDialog.namePlaceholder")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!forceParentCompanyId && (
            <FormField
              control={form.control}
              name="selskapstype"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>{t("admin.companyDialog.typeLabel")}</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="grid grid-cols-2 gap-4"
                    >
                      <div className="relative">
                        <RadioGroupItem
                          value="droneoperator"
                          id="droneoperator"
                          className="peer sr-only"
                        />
                        <label
                          htmlFor="droneoperator"
                          className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                        >
                          <Radio className="mb-2 h-6 w-6" />
                          <span className="font-medium">{t("admin.companyDialog.droneoperator")}</span>
                          <span className="text-xs text-muted-foreground mt-1">
                            {t("admin.companyDialog.droneoperatorDesc")}
                          </span>
                        </label>
                      </div>
                      <div className="relative">
                        <RadioGroupItem
                          value="flyselskap"
                          id="flyselskap"
                          className="peer sr-only"
                        />
                        <label
                          htmlFor="flyselskap"
                          className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                        >
                          <Plane className="mb-2 h-6 w-6" />
                          <span className="font-medium">{t("admin.companyDialog.flyselskap")}</span>
                          <span className="text-xs text-muted-foreground mt-1">
                            {t("admin.companyDialog.flyselskapDesc")}
                          </span>
                        </label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            )}

            <FormField
              control={form.control}
              name="org_nummer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.companyDialog.orgNrLabel")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t("admin.companyDialog.orgNrPlaceholder")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="adresse"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <AddressAutocomplete
                      label={t("admin.companyDialog.addressLabel")}
                      value={field.value || ""}
                      onChange={(val) => {
                        field.onChange(val);
                      }}
                      onSelectLocation={(loc) => {
                        field.onChange(loc.address);
                        form.setValue("adresse_lat", loc.lat);
                        form.setValue("adresse_lon", loc.lon);
                      }}
                      placeholder={t("admin.companyDialog.addressPlaceholder")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="kontakt_epost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.companyDialog.emailLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="kontakt@firma.no"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="kontakt_telefon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin.companyDialog.phoneLabel")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t("admin.companyDialog.phonePlaceholder")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isSuperAdmin && !(isCreating && forceParentCompanyId) && (
              <FormField
                control={form.control}
                name="default_language"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>{t("admin.companyDialog.defaultLanguageLabel")}</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {t("admin.companyDialog.defaultLanguageDesc")}
                    </p>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="grid grid-cols-2 gap-4"
                      >
                        <div className="relative">
                          <RadioGroupItem value="no" id="lang-no" className="peer sr-only" />
                          <label
                            htmlFor="lang-no"
                            className="flex items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                          >
                            <span className="font-medium">{t("admin.companyDialog.languageNorwegian")}</span>
                          </label>
                        </div>
                        <div className="relative">
                          <RadioGroupItem value="en" id="lang-en" className="peer sr-only" />
                          <label
                            htmlFor="lang-en"
                            className="flex items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                          >
                            <span className="font-medium">{t("admin.companyDialog.languageEnglish")}</span>
                          </label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isSuperAdmin && !forceParentCompanyId && (
              <FormField
                control={form.control}
                name="parent_company_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin.companyDialog.parentLabel")}</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      >
                        <option value="">{t("admin.companyDialog.parentNone")}</option>
                        {allCompanies
                          .filter(c => c.id !== company?.id)
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.navn}</option>
                          ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isSuperAdmin && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <label htmlFor="stripe_exempt" className="text-sm font-medium">{t("admin.companyDialog.stripeExemptLabel")}</label>
                  <p className="text-xs text-muted-foreground">{t("admin.companyDialog.stripeExemptDesc")}</p>
                </div>
                <Switch
                  id="stripe_exempt"
                  checked={stripeExempt}
                  onCheckedChange={setStripeExempt}
                />
              </div>
            )}

            {isSuperAdmin && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <label htmlFor="departments_enabled" className="text-sm font-medium">{t("admin.companyDialog.departmentsLabel")}</label>
                  <p className="text-xs text-muted-foreground">{t("admin.companyDialog.departmentsDesc")}</p>
                </div>
                <Switch
                  id="departments_enabled"
                  checked={departmentsEnabled}
                  onCheckedChange={setDepartmentsEnabled}
                />
              </div>
            )}


            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {t("admin.companyDialog.cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isCreating ? t("admin.companyDialog.create") : t("admin.companyDialog.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};