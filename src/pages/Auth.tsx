import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { redirectToApp } from "@/config/domains";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Chrome, CheckCircle2 } from "lucide-react";
import droneBackground from "@/assets/drone-background.png";
import avisafeLogo from "@/assets/avisafe-logo.png";

const Auth = () => {
  const navigate = useNavigate();
  const {
    user,
    loading: authLoading
  } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [validatedCompany, setValidatedCompany] = useState<{ id: string; name: string } | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  
  // Handle email confirmation messages from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const error = params.get('error');
      const errorDescription = params.get('error_description');
      
      if (error === 'access_denied' || errorDescription?.includes('already been consumed')) {
        toast.error("Denne lenken er allerede brukt eller utløpt.");
      } else if (!error && hash.includes('access_token')) {
        // Successful email verification
        toast.success("E-posten din er bekreftet! Din konto venter nå på godkjenning fra administrator.");
      }
      
      // Clean up URL hash
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);
  
  useEffect(() => {
    console.log('Auth page - user:', user?.email, 'authLoading:', authLoading);
    if (!authLoading && user) {
      console.log('Redirecting to app domain');
      redirectToApp('/');
    }
  }, [user, authLoading]);

  // Validate registration code when it changes
  useEffect(() => {
    const validateCode = async () => {
      if (registrationCode.length === 6) {
        const { data, error } = await supabase.rpc('get_company_by_registration_code', {
          p_code: registrationCode
        });
        
        if (!error && data && data.length > 0) {
          setValidatedCompany({ id: data[0].company_id, name: data[0].company_name });
        } else {
          setValidatedCompany(null);
        }
      } else {
        setValidatedCompany(null);
      }
    };

    if (!isLogin && registrationCode) {
      validateCode();
    }
  }, [registrationCode, isLogin]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Vennligst fyll ut alle felt");
      return;
    }
    if (!isLogin && !fullName) {
      toast.error("Vennligst fyll ut fullt navn");
      return;
    }
    if (!isLogin && !validatedCompany) {
      toast.error("Vennligst skriv inn en gyldig registreringskode");
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        const {
          data,
          error
        } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        if (data.user) {
          // Check if user is approved
          const {
            data: profileData
          } = await supabase.from("profiles").select("approved").eq("id", data.user.id).maybeSingle();
          if (profileData && !(profileData as any).approved) {
            await supabase.auth.signOut();
            toast.error("Din konto venter på godkjenning fra administrator");
            return;
          }
          toast.success("Innlogging vellykket!");
          redirectToApp('/');
        }
      } else {
        const {
          data,
          error
        } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: 'https://login.avisafe.no/auth',
            data: {
              full_name: fullName,
              company_id: validatedCompany!.id
            }
          }
        });
        if (error) throw error;
        if (data.user) {
          // Upsert profile - creates if doesn't exist, updates if it does
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              full_name: fullName,
              company_id: validatedCompany!.id,
              email: email,
              approved: false
            }, {
              onConflict: 'id'
            });

          if (profileError) {
            console.error('Feil ved oppretting av profil:', profileError);
            // User is still created in auth, continue with notification
          }

          // Send notifications to admins via edge function
          await supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'notify_admins_new_user',
              companyId: validatedCompany!.id,
              newUser: {
                fullName: fullName,
                email: email,
                companyName: validatedCompany!.name
              }
            }
          });

          toast.success("Konto opprettet! Venter på godkjenning fra administrator.");
          setEmail("");
          setPassword("");
          setFullName("");
          setRegistrationCode("");
          setValidatedCompany(null);
          setIsLogin(true);
        }
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      toast.error(error.message || "En feil oppstod");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const {
        error
      } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'https://app.avisafe.no'
        }
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      toast.error(error.message || 'Kunne ikke logge inn med Google');
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      toast.error("Vennligst skriv inn e-postadressen din");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-password-reset', {
        body: { email: resetEmail }
      });
      
      if (error) throw error;
      
      toast.success("Hvis e-posten finnes i systemet, vil du motta en tilbakestillingslenke!");
      setShowResetPassword(false);
      setResetEmail("");
    } catch (error: any) {
      console.error("Reset password error:", error);
      toast.error(error.message || "En feil oppstod");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center">
      {/* Background */}
      <div className="fixed inset-0 z-0" style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.4)), url(${droneBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }} />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-4">
        <Card className="bg-card/95 backdrop-blur-sm border-border/50">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-center">
              <img src={avisafeLogo} alt="AviSafe" className="h-24 w-auto" />
            </div>
            <div className="text-center">
              <CardTitle className="text-xl">
                {isLogin ? "Logg inn" : "Opprett konto"}
              </CardTitle>
              <CardDescription>
                {isLogin ? "Skriv inn dine innloggingsdetaljer" : "Fyll ut skjemaet for å opprette en konto"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Fullt navn</Label>
                  <Input 
                    id="fullName" 
                    type="text" 
                    placeholder="Ola Nordmann" 
                    value={fullName} 
                    onChange={e => setFullName(e.target.value)} 
                    required={!isLogin} 
                  />
                </div>
              )}
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="registrationCode">Registreringskode</Label>
                  <div className="relative">
                    <Input 
                      id="registrationCode" 
                      type="text" 
                      placeholder="ABC123" 
                      value={registrationCode} 
                      onChange={e => setRegistrationCode(e.target.value.toUpperCase().slice(0, 6))} 
                      required={!isLogin}
                      maxLength={6}
                      className="font-mono uppercase tracking-wider"
                    />
                    {validatedCompany && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                    )}
                  </div>
                  {validatedCompany && (
                    <p className="text-sm text-green-600 flex items-center gap-1">
                      Selskap: {validatedCompany.name}
                    </p>
                  )}
                  {registrationCode.length === 6 && !validatedCompany && (
                    <p className="text-sm text-destructive">Ugyldig registreringskode</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Kontakt din administrator for å få registreringskoden
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="din@epost.no" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Passord</Label>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  minLength={6} 
                />
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(true)}
                    className="text-xs text-primary hover:underline block mt-1"
                  >
                    Glemt passord?
                  </button>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loading || (!isLogin && !validatedCompany)}>
                {loading ? "Behandler..." : isLogin ? "Logg inn" : "Opprett konto"}
              </Button>
            </form>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                
              </div>
            </div>

            <Button 
              type="button" 
              variant="outline" 
              onClick={handleGoogleSignIn} 
              disabled={loading} 
              className="w-full text-center py-0 my-[19px] bg-blue-200 hover:bg-blue-100"
            >
              <Chrome className="mr-2 h-4 w-4" />
              Logg inn med Google
            </Button>

            <div className="text-center text-sm">
              <button 
                type="button" 
                onClick={() => {
                  setIsLogin(!isLogin);
                  setRegistrationCode("");
                  setValidatedCompany(null);
                }} 
                className="text-primary hover:underline"
              >
                {isLogin ? "Har du ikke konto? Opprett en her" : "Har du allerede konto? Logg inn her"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tilbakestill passord</DialogTitle>
            <DialogDescription>
              Skriv inn e-postadressen din, så sender vi deg en lenke for å tilbakestille passordet.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetEmail">E-post</Label>
              <Input 
                id="resetEmail" 
                type="email" 
                placeholder="din@epost.no" 
                value={resetEmail} 
                onChange={e => setResetEmail(e.target.value)} 
                required 
              />
            </div>
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowResetPassword(false);
                  setResetEmail("");
                }} 
                className="flex-1"
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Sender..." : "Send e-post"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
