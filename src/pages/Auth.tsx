import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import droneBackground from "@/assets/drone-background.webp";
import type { User } from "@supabase/supabase-js";


const Auth = () => {
  const { t } = useTranslation();
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
  
  // Google OAuth registration state
  const [showGoogleRegistration, setShowGoogleRegistration] = useState(false);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleFullName, setGoogleFullName] = useState("");
  const [googleRegistrationCode, setGoogleRegistrationCode] = useState("");
  const [googleValidatedCompany, setGoogleValidatedCompany] = useState<{ id: string; name: string } | null>(null);
  const [checkingGoogleUser, setCheckingGoogleUser] = useState(false);
  
  // Handle email confirmation messages from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const error = params.get('error');
      const errorDescription = params.get('error_description');
      
      if (error === 'access_denied' || errorDescription?.includes('already been consumed')) {
        toast.error(t('auth.linkExpired'));
      } else if (!error && hash.includes('access_token')) {
        // Successful email verification
        toast.success(t('auth.emailConfirmed'));
      }
      
      // Clean up URL hash
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [t]);

  // Handle Google OAuth users - check if they have a valid profile
  useEffect(() => {
    const checkGoogleUserProfile = async () => {
      if (authLoading || !user) return;
      
      // Check if this is an OAuth user (no password, has Google provider)
      const isOAuthUser = user.app_metadata?.provider === 'google' || 
                          user.app_metadata?.providers?.includes('google');
      
      if (!isOAuthUser) {
        // Regular email user - let normal flow handle it
        return;
      }

      setCheckingGoogleUser(true);
      
      try {
        // Check if user has a profile with a valid company_id
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('id, company_id, approved')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error) {
          console.error('Error checking profile:', error);
          setCheckingGoogleUser(false);
          return;
        }

        if (profile && profile.company_id) {
          // User has a profile with company_id
          if (profile.approved) {
            // Approved user - redirect to app
            console.log('Google user approved, redirecting to app');
            redirectToApp('/');
          } else {
            // Not approved - show message and sign out
            toast.error(t('auth.accountPendingApproval'));
            await supabase.auth.signOut();
          }
        } else {
          // New Google user without profile - show registration dialog
          console.log('New Google user, showing registration dialog');
          setGoogleUser(user);
          setGoogleFullName(user.user_metadata?.full_name || user.user_metadata?.name || '');
          setShowGoogleRegistration(true);
        }
      } catch (err) {
        console.error('Error in Google user check:', err);
      } finally {
        setCheckingGoogleUser(false);
      }
    };

    checkGoogleUserProfile();
  }, [user, authLoading, t]);

  // Regular redirect for non-OAuth users
  useEffect(() => {
    if (authLoading || checkingGoogleUser || showGoogleRegistration) return;
    
    const isOAuthUser = user?.app_metadata?.provider === 'google' || 
                        user?.app_metadata?.providers?.includes('google');
    
    if (!isOAuthUser && user) {
      console.log('Redirecting to app domain');
      redirectToApp('/');
    }
  }, [user, authLoading, checkingGoogleUser, showGoogleRegistration]);

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

  // Validate Google registration code
  useEffect(() => {
    const validateCode = async () => {
      if (googleRegistrationCode.length === 6) {
        const { data, error } = await supabase.rpc('get_company_by_registration_code', {
          p_code: googleRegistrationCode
        });
        
        if (!error && data && data.length > 0) {
          setGoogleValidatedCompany({ id: data[0].company_id, name: data[0].company_name });
        } else {
          setGoogleValidatedCompany(null);
        }
      } else {
        setGoogleValidatedCompany(null);
      }
    };

    if (googleRegistrationCode) {
      validateCode();
    }
  }, [googleRegistrationCode]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error(t('auth.fillAllFields'));
      return;
    }
    if (!isLogin && !fullName) {
      toast.error(t('auth.fillFullName'));
      return;
    }
    if (!isLogin && !validatedCompany) {
      toast.error(t('auth.enterValidCode'));
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
            toast.error(t('auth.accountPendingApproval'));
            return;
          }
          toast.success(t('auth.loginSuccess'));
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
            console.error('Error creating profile:', profileError);
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

          toast.success(t('auth.accountCreated'));
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
      toast.error(error.message || t('errors.generic'));
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
          redirectTo: 'https://login.avisafe.no/auth'
        }
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      toast.error(error.message || t('auth.couldNotSignInGoogle'));
      setLoading(false);
    }
  };

  const handleGoogleRegistrationSubmit = async () => {
    if (!googleUser || !googleValidatedCompany || !googleFullName.trim()) {
      toast.error(t('auth.fillAllFields'));
      return;
    }

    setLoading(true);
    try {
      // Create profile for the Google user
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: googleUser.id,
          full_name: googleFullName.trim(),
          company_id: googleValidatedCompany.id,
          email: googleUser.email,
          approved: false
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        toast.error(t('errors.generic'));
        return;
      }

      // Assign default role
      await supabase
        .from('user_roles')
        .insert({
          user_id: googleUser.id,
          role: 'lesetilgang'
        });

      // Send notifications to admins
      await supabase.functions.invoke('send-notification-email', {
        body: {
          type: 'notify_admins_new_user',
          companyId: googleValidatedCompany.id,
          newUser: {
            fullName: googleFullName.trim(),
            email: googleUser.email,
            companyName: googleValidatedCompany.name
          }
        }
      });

      toast.success(t('auth.accountCreated'));
      
      // Sign out and reset state
      await supabase.auth.signOut();
      setShowGoogleRegistration(false);
      setGoogleUser(null);
      setGoogleFullName("");
      setGoogleRegistrationCode("");
      setGoogleValidatedCompany(null);
    } catch (error: any) {
      console.error('Google registration error:', error);
      toast.error(error.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelGoogleRegistration = async () => {
    if (!googleUser) {
      setShowGoogleRegistration(false);
      return;
    }

    setLoading(true);
    try {
      // Delete the auth user via edge function
      await supabase.functions.invoke('admin-delete-user', {
        body: { email: googleUser.email }
      });

      // Sign out
      await supabase.auth.signOut();

      toast.info(t('auth.registrationCancelled'));
    } catch (error: any) {
      console.error('Error cancelling Google registration:', error);
      // Still try to sign out even if delete fails
      await supabase.auth.signOut();
    } finally {
      setShowGoogleRegistration(false);
      setGoogleUser(null);
      setGoogleFullName("");
      setGoogleRegistrationCode("");
      setGoogleValidatedCompany(null);
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      toast.error(t('auth.enterEmailAddress'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-password-reset', {
        body: { email: resetEmail }
      });
      
      if (error) throw error;
      
      toast.success(t('auth.resetEmailSent'));
      setShowResetPassword(false);
      setResetEmail("");
    } catch (error: any) {
      console.error("Reset password error:", error);
      toast.error(error.message || t('errors.generic'));
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
              <img 
                src="/avisafe-logo-text.png" 
                alt="AviSafe" 
                className="h-24 w-auto" 
                width={301}
                height={96}
                fetchPriority="high"
              />
            </div>
            <div className="text-center">
              <CardTitle className="text-xl">
                {isLogin ? t('auth.signIn') : t('auth.signUp')}
              </CardTitle>
              <CardDescription>
                {isLogin ? t('auth.enterCredentials') : t('auth.fillForm')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t('auth.fullName')}</Label>
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
                  <Label htmlFor="registrationCode">{t('auth.registrationCode')}</Label>
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
                      {t('auth.company')}: {validatedCompany.name}
                    </p>
                  )}
                  {registrationCode.length === 6 && !validatedCompany && (
                    <p className="text-sm text-destructive">{t('auth.invalidCode')}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('auth.contactAdmin')}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder={t('forms.placeholder.email')} 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('auth.password')}</Label>
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
                    {t('auth.forgotPassword')}
                  </button>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loading || (!isLogin && !validatedCompany)}>
                {loading ? t('common.processing') : isLogin ? t('auth.signIn') : t('auth.signUp')}
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
              {t('auth.signInWithGoogle')}
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
                {isLogin ? t('auth.noAccount') : t('auth.hasAccount')}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('auth.resetPassword')}</DialogTitle>
            <DialogDescription>
              {t('auth.resetPasswordDesc')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetEmail">{t('auth.email')}</Label>
              <Input 
                id="resetEmail" 
                type="email" 
                placeholder={t('forms.placeholder.email')} 
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
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? t('auth.sending') : t('auth.sendEmail')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Google Registration Dialog */}
      <Dialog open={showGoogleRegistration} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('auth.completeRegistration')}</DialogTitle>
            <DialogDescription>
              {t('auth.enterRegistrationCodeToComplete')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="googleFullName">{t('auth.fullName')}</Label>
              <Input 
                id="googleFullName" 
                type="text" 
                placeholder="Ola Nordmann" 
                value={googleFullName} 
                onChange={e => setGoogleFullName(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="googleRegistrationCode">{t('auth.registrationCode')}</Label>
              <div className="relative">
                <Input 
                  id="googleRegistrationCode" 
                  type="text" 
                  placeholder="ABC123" 
                  value={googleRegistrationCode} 
                  onChange={e => setGoogleRegistrationCode(e.target.value.toUpperCase().slice(0, 6))} 
                  maxLength={6}
                  className="font-mono uppercase tracking-wider"
                />
                {googleValidatedCompany && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                )}
              </div>
              {googleValidatedCompany && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  {t('auth.company')}: {googleValidatedCompany.name}
                </p>
              )}
              {googleRegistrationCode.length === 6 && !googleValidatedCompany && (
                <p className="text-sm text-destructive">{t('auth.invalidCode')}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('auth.contactAdmin')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCancelGoogleRegistration} 
                disabled={loading}
                className="flex-1"
              >
                {t('actions.cancel')}
              </Button>
              <Button 
                type="button" 
                onClick={handleGoogleRegistrationSubmit} 
                disabled={loading || !googleValidatedCompany || !googleFullName.trim()}
                className="flex-1"
              >
                {loading ? t('common.processing') : t('auth.signUp')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
