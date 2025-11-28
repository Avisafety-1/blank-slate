import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Shield, LogOut, Trash2, Check, X, Menu, Settings, UserCog, Users, Building2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileDialog } from "@/components/ProfileDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyManagementSection } from "@/components/admin/CompanyManagementSection";
import { CustomerManagementSection } from "@/components/admin/CustomerManagementSection";
import { EmailTemplateEditor } from "@/components/admin/EmailTemplateEditor";

interface Profile {
  id: string;
  full_name: string | null;
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
}

const availableRoles = [
  { value: "superadmin", label: "Super Administrator" },
  { value: "admin", label: "Administrator" },
  { value: "saksbehandler", label: "Saksbehandler" },
  { value: "operatør", label: "Operatør" },
  { value: "lesetilgang", label: "Lesetilgang" },
];

const Admin = () => {
  const { user, loading, companyId, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      checkAdminStatus();
    }
  }, [user]);

  const checkAdminStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: user?.id,
        _role: 'admin'
      });

      if (error) throw error;

      if (data) {
        setIsAdmin(true);
        fetchData();
      } else {
        toast.error("Du har ikke tilgang til denne siden");
        navigate("/");
      }
    } catch (error) {
      console.error("Error checking admin status:", error);
      toast.error("Feil ved sjekking av tilgang");
      navigate("/");
    }
  };

  const fetchData = async () => {
    setLoadingData(true);
    try {
      // Fetch profiles - filter by company if not superadmin
      let profilesQuery = supabase
        .from("profiles")
        .select("*, companies(navn)")
        .order("created_at", { ascending: false });
      
      // Regular admin sees only their company
      if (!isSuperAdmin && companyId) {
        profilesQuery = profilesQuery.eq('company_id', companyId);
      }

      const { data: profilesData, error: profilesError } = await profilesQuery;

      if (profilesError) throw profilesError;

      setProfiles((profilesData || []) as Profile[]);

      // Fetch all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      setUserRoles(rolesData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Feil ved henting av data");
    } finally {
      setLoadingData(false);
    }
  };

  const approveUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        } as any)
        .eq("id", userId);

      if (error) throw error;

      // Get user details and send approval email
      const profile = profiles.find(p => p.id === userId);
      if (profile) {
        // Get user email from auth
        const { data: authUser } = await supabase.auth.admin.getUserById(userId);
        
        // Get company name
        const { data: company } = await supabase
          .from("companies")
          .select("navn")
          .eq("id", companyId)
          .single();

        if (authUser?.user?.email && company) {
          // Send approval email via edge function
          await supabase.functions.invoke('send-user-approved-email', {
            body: {
              user_id: userId,
              user_name: profile.full_name || "Bruker",
              user_email: authUser.user.email,
              company_name: company.navn,
              company_id: companyId
            }
          });
        }
      }

      toast.success("Bruker godkjent");
      fetchData();
    } catch (error) {
      console.error("Error approving user:", error);
      toast.error("Feil ved godkjenning av bruker");
    }
  };

  const assignRole = async (userId: string, role: string) => {
    try {
      // Get existing role for the user
      const existingRole = userRoles.find((r) => r.user_id === userId);

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from("user_roles")
          .update({ role: role as any })
          .eq("user_id", userId);

        if (error) throw error;
        toast.success("Rolle oppdatert");
      } else {
        // Insert new role
        const { error } = await supabase
          .from("user_roles")
          .insert([{ user_id: userId, role: role as any }]);

        if (error) throw error;
        toast.success("Rolle tildelt");
      }

      fetchData();
    } catch (error) {
      console.error("Error assigning role:", error);
      toast.error("Feil ved tildeling av rolle");
    }
  };

  const removeRole = async (roleId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;

      toast.success("Rolle fjernet");
      fetchData();
    } catch (error) {
      console.error("Error removing role:", error);
      toast.error("Feil ved fjerning av rolle");
    }
  };

  const deleteUser = async (userId: string, userName: string | null) => {
    if (!confirm(`Er du sikker på at du vil slette brukeren ${userName || "Ikke oppgitt"}? Dette kan ikke angres.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (error) throw error;

      toast.success("Bruker slettet");
      fetchData();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Feil ved sletting av bruker");
    }
  };

  const getUserRoles = (userId: string) => {
    return userRoles.filter((r) => r.user_id === userId);
  };

  const getRoleLabel = (role: string) => {
    return availableRoles.find((r) => r.value === role)?.label || role;
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Shield className="w-16 h-16 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-lg">Laster...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const pendingUsers = profiles.filter((p) => !p.approved);
  const approvedUsers = profiles.filter((p) => p.approved);

  return (
    <div className="min-h-screen bg-background w-full overflow-x-hidden">
      <header className="bg-card/20 backdrop-blur-md border-b border-glass sticky top-0 z-50 w-full">
        <div className="w-full px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            <Button 
              variant="ghost" 
              className="flex items-center gap-1 sm:gap-2 lg:gap-3 hover:bg-transparent p-0 flex-shrink-0"
              onClick={() => navigate("/")}
            >
              <Shield className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-primary" />
              <div className="text-left">
                <h1 className="text-sm sm:text-base lg:text-xl xl:text-2xl font-bold whitespace-nowrap">SMS Admin</h1>
                <p className="text-xs lg:text-sm text-primary hidden lg:block">Brukergodkjenning</p>
              </div>
            </Button>
            
            {/* Mobile Navigation - Hamburger Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="md:hidden">
                <Button variant="ghost" size="sm">
                  <Menu className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-card/95 backdrop-blur-md border-glass z-50">
                <DropdownMenuItem onClick={() => navigate("/kart")}>Kart</DropdownMenuItem>
                <DropdownMenuItem>Dokumenter</DropdownMenuItem>
                <DropdownMenuItem>Kalender</DropdownMenuItem>
                <DropdownMenuItem>Hendelser</DropdownMenuItem>
                <DropdownMenuItem>Status</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/ressurser")}>Ressurser</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <nav className="flex items-center gap-1 sm:gap-2 lg:gap-4 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/")}
              >
                Tilbake
              </Button>
              <ProfileDialog />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/auth")}
                title="Logg ut"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <main className="w-full px-2 sm:px-4 py-4 sm:py-8">
        <Tabs defaultValue="users" className="w-full">
          <TabsList className={`grid w-full max-w-3xl mx-auto ${isMobile ? 'grid-cols-2' : ''}`} style={!isMobile ? { gridTemplateColumns: isSuperAdmin ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr' } : undefined}>
            <TabsTrigger value="users" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Brukere</span>
              <span className="sm:hidden">Bruk.</span>
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <UserCog className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Kunder</span>
              <span className="sm:hidden">Kund.</span>
            </TabsTrigger>
            <TabsTrigger value="email-templates" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <Mail className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">E-postmaler</span>
              <span className="sm:hidden">E-post</span>
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="companies" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <Building2 className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Selskaper</span>
                <span className="sm:hidden">Selskap</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="users" className="mt-4 sm:mt-6">
            <div className="space-y-4 sm:space-y-6">
              {/* Pending Users */}
              {pendingUsers.length > 0 && (
                <Card>
                  <CardHeader className="pb-3 sm:pb-6">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <UserCog className="w-4 h-4 sm:w-5 sm:h-5" />
                      Ventende godkjenninger ({pendingUsers.length})
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Brukere som venter på godkjenning
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    <ScrollArea className="w-full">
                      <div className="min-w-[600px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs sm:text-sm">Navn</TableHead>
                              <TableHead className={`text-xs sm:text-sm ${isMobile ? 'hidden' : ''}`}>Selskap</TableHead>
                              <TableHead className={`text-xs sm:text-sm ${isMobile ? 'hidden' : ''}`}>Bruker ID</TableHead>
                              <TableHead className="text-xs sm:text-sm">Opprettet</TableHead>
                              <TableHead className="text-right text-xs sm:text-sm">Handlinger</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pendingUsers.map((profile) => (
                              <TableRow key={profile.id}>
                                <TableCell className="text-xs sm:text-sm">{profile.full_name || "Ikke oppgitt"}</TableCell>
                                <TableCell className={`text-xs sm:text-sm ${isMobile ? 'hidden' : ''}`}>{(profile as any).companies?.navn || "Ukjent"}</TableCell>
                                <TableCell className={`font-mono text-xs ${isMobile ? 'hidden' : ''}`}>{profile.id.slice(0, 8)}...</TableCell>
                                <TableCell className="text-xs sm:text-sm">
                                  {new Date(profile.created_at).toLocaleDateString("nb-NO")}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex gap-1 sm:gap-2 justify-end">
                                    <Button
                                      size="sm"
                                      onClick={() => approveUser(profile.id)}
                                      className={`gap-1 ${isMobile ? 'h-8 px-2' : 'gap-2'}`}
                                    >
                                      <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                                      <span className="hidden sm:inline">Godkjenn</span>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => deleteUser(profile.id, profile.full_name)}
                                      className={`gap-1 ${isMobile ? 'h-8 px-2' : 'gap-2'}`}
                                    >
                                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                                      <span className="hidden sm:inline">Slett</span>
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Approved Users */}
              <Card>
                <CardHeader className="pb-3 sm:pb-6">
                  <CardTitle className="text-base sm:text-lg">Godkjente brukere ({approvedUsers.length})</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Administrer roller for godkjente brukere
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <ScrollArea className="w-full">
                    <div className="min-w-[700px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs sm:text-sm">Navn</TableHead>
                            <TableHead className={`text-xs sm:text-sm ${isMobile ? 'hidden' : ''}`}>Selskap</TableHead>
                            <TableHead className={`text-xs sm:text-sm ${isMobile ? 'hidden' : ''}`}>Bruker ID</TableHead>
                            <TableHead className="text-xs sm:text-sm">Rolle</TableHead>
                            <TableHead className="text-right text-xs sm:text-sm">Endre rolle</TableHead>
                            <TableHead className="text-right text-xs sm:text-sm">Handlinger</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {approvedUsers.map((profile) => {
                            const userRole = userRoles.find((r) => r.user_id === profile.id);
                            return (
                              <TableRow key={profile.id}>
                                <TableCell className="text-xs sm:text-sm">{profile.full_name || "Ikke oppgitt"}</TableCell>
                                <TableCell className={`text-xs sm:text-sm ${isMobile ? 'hidden' : ''}`}>{(profile as any).companies?.navn || "Ukjent"}</TableCell>
                                <TableCell className={`font-mono text-xs ${isMobile ? 'hidden' : ''}`}>{profile.id.slice(0, 8)}...</TableCell>
                                <TableCell>
                                  {userRole ? (
                                    <Badge variant="secondary" className="text-xs">
                                      {getRoleLabel(userRole.role)}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Ingen rolle
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Select 
                                    value={userRole?.role || ""} 
                                    onValueChange={(value) => assignRole(profile.id, value)}
                                  >
                                    <SelectTrigger className={`${isMobile ? 'w-[140px] h-8 text-xs' : 'w-[180px]'}`}>
                                      <SelectValue placeholder="Velg rolle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableRoles.map((role) => (
                                        <SelectItem key={role.value} value={role.value} className="text-xs sm:text-sm">
                                          {role.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => deleteUser(profile.id, profile.full_name)}
                                    className={isMobile ? 'h-8 px-2' : ''}
                                  >
                                    <Trash2 className={`${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`} />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="mt-6">
            <CustomerManagementSection />
          </TabsContent>

          <TabsContent value="email-templates" className="mt-6">
            <EmailTemplateEditor />
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="companies" className="mt-6">
              <CompanyManagementSection />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;

