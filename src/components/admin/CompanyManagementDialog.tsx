import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
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
import { Loader2 } from "lucide-react";

interface Company {
  id: string;
  navn: string;
  org_nummer: string | null;
  adresse: string | null;
  kontakt_epost: string | null;
  kontakt_telefon: string | null;
  aktiv: boolean;
}

interface CompanyManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  onSuccess: () => void;
}

const companySchema = z.object({
  navn: z.string()
    .trim()
    .min(1, "Selskapsnavn er påkrevd")
    .max(200, "Selskapsnavn må være under 200 tegn"),
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
});

type CompanyFormData = z.infer<typeof companySchema>;

export const CompanyManagementDialog = ({
  open,
  onOpenChange,
  company,
  onSuccess,
}: CompanyManagementDialogProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isCreating = !company;

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      navn: "",
      org_nummer: "",
      adresse: "",
      kontakt_epost: "",
      kontakt_telefon: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (company) {
        form.reset({
          navn: company.navn,
          org_nummer: company.org_nummer || "",
          adresse: company.adresse || "",
          kontakt_epost: company.kontakt_epost || "",
          kontakt_telefon: company.kontakt_telefon || "",
        });
      } else {
        form.reset({
          navn: "",
          org_nummer: "",
          adresse: "",
          kontakt_epost: "",
          kontakt_telefon: "",
        });
      }
    }
  }, [open, company, form]);

  const onSubmit = async (data: CompanyFormData) => {
    setIsSubmitting(true);
    
    try {
      const companyData = {
        navn: data.navn,
        org_nummer: data.org_nummer || null,
        adresse: data.adresse || null,
        kontakt_epost: data.kontakt_epost || null,
        kontakt_telefon: data.kontakt_telefon || null,
      };

      if (isCreating) {
        const { error } = await supabase
          .from("companies")
          .insert(companyData);

        if (error) throw error;
        toast.success("Selskap opprettet");
      } else {
        const { error } = await supabase
          .from("companies")
          .update(companyData)
          .eq("id", company.id);

        if (error) throw error;
        toast.success("Selskap oppdatert");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving company:", error);
      toast.error("Kunne ikke lagre selskap: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCreating ? "Opprett nytt selskap" : "Rediger selskap"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="navn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Selskapsnavn *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Skriv inn selskapsnavn" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="org_nummer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organisasjonsnummer</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Skriv inn org.nummer" />
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
                  <FormLabel>Adresse</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Skriv inn adresse" />
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
                  <FormLabel>Kontakt e-post</FormLabel>
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
                  <FormLabel>Kontakt telefon</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="+47 123 45 678" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isCreating ? "Opprett" : "Lagre"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
