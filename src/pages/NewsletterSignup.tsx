import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, Mail, CheckCircle2, ArrowLeft } from "lucide-react";
import logoText from "@/assets/avisafe-logo-text.png";
import droneBg from "@/assets/drone-background.webp";

const NewsletterSignup = () => {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("newsletter-manage", {
        body: { action: "public-subscribe", email, first_name: firstName, last_name: lastName },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDone(true);
    } catch (err: any) {
      toast({ title: "Feil", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-950 text-slate-100 relative"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(8,15,28,0.85) 0%, rgba(8,15,28,0.95) 60%, rgba(8,15,28,1) 100%), url(${droneBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Header */}
      <header className="w-full px-6 py-5 flex items-center justify-between border-b border-white/5">
        <a href="https://avisafe.no" className="flex items-center gap-2">
          <img src={logoText} alt="AviSafe" className="h-7 w-auto" />
        </a>
        <a
          href="https://avisafe.no"
          className="text-xs uppercase tracking-[0.18em] text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Tilbake til avisafe.no
        </a>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
              <Mail className="w-5 h-5 text-sky-300" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-sky-300/80 font-semibold">
              Hold deg oppdatert
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
              AviSafe Nyhetsbrev
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Meld deg på for innsikt, regelverksendringer og oppdateringer for profesjonelle droneoperasjoner.
            </p>
          </div>

          {done ? (
            <div className="text-center space-y-3 p-7 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-md shadow-2xl">
              <CheckCircle2 className="w-11 h-11 text-emerald-400 mx-auto" />
              <p className="text-white font-semibold">Takk for at du meldte deg på!</p>
              <p className="text-sm text-slate-400">
                Du vil motta vårt neste nyhetsbrev på <span className="text-slate-200">{email}</span>.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="space-y-4 p-6 sm:p-7 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-md shadow-2xl"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-slate-400">Fornavn</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ola"
                    className="bg-white/[0.03] border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-sky-500/40 focus-visible:border-sky-400/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-slate-400">Etternavn</Label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Nordmann"
                    className="bg-white/[0.03] border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-sky-500/40 focus-visible:border-sky-400/40"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-slate-400">E-post *</Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="din@epost.no"
                  className="bg-white/[0.03] border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-sky-500/40 focus-visible:border-sky-400/40"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-white text-slate-900 hover:bg-slate-100 font-semibold tracking-wide uppercase text-xs h-11"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                Meld meg på
              </Button>
              <p className="text-[10px] text-slate-500 text-center leading-relaxed pt-1">
                Du kan melde deg av når som helst via lenken i nyhetsbrevet.
              </p>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-white/5 text-center">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
          © {new Date().getFullYear()} AviSafe · Operational Intelligence for Professional Drone Operations
        </p>
      </footer>
    </div>
  );
};

export default NewsletterSignup;
