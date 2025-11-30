import { Shield, LogOut, Settings, Menu, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfileDialog } from "@/components/ProfileDialog";
import { PendingApprovalsBadge } from "@/components/PendingApprovalsBadge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Company {
  id: string;
  navn: string;
}

export const Header = () => {
  const navigate = useNavigate();
  const { signOut, companyName, isSuperAdmin, companyId, refetchUserInfo, user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    if (user) {
      checkAdminStatus();
    }
  }, [user]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchCompanies();
    }
  }, [isSuperAdmin]);

  const checkAdminStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: user?.id,
        _role: 'admin'
      });

      if (error) throw error;
      setIsAdmin(data || false);
    } catch (error) {
      console.error("Error checking admin status:", error);
    }
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, navn")
        .order("navn", { ascending: true });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  const handleCompanySwitch = async (newCompanyId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ company_id: newCompanyId })
        .eq('id', user?.id);
      
      if (error) throw error;
      
      await refetchUserInfo();
      const company = companies.find(c => c.id === newCompanyId);
      toast.success(`Byttet til ${company?.navn}`);
    } catch (error) {
      console.error("Error switching company:", error);
      toast.error("Kunne ikke bytte selskap");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Logget ut");
    navigate("/auth");
  };

  return (
    <header className="bg-card/20 backdrop-blur-md border-b border-glass sticky top-0 z-[1001] w-full">
      <div className="w-full px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          <Button 
            variant="ghost" 
            className="flex items-center gap-1 sm:gap-2 lg:gap-3 hover:bg-transparent p-0 flex-shrink-0"
            onClick={() => navigate("/")}
          >
            <Shield className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-primary" />
            <div className="text-left">
              <h1 className="text-sm sm:text-base lg:text-xl xl:text-2xl font-bold whitespace-nowrap">SMS</h1>
              <p className="text-xs lg:text-sm text-foreground/80 hidden lg:block">
                {isSuperAdmin ? "Super Administrator" : companyName || "Drone Operations"}
              </p>
            </div>
          </Button>
          
          {/* Mobile company selector and menu */}
          <div className="flex items-center gap-1 md:hidden">
            {isSuperAdmin && companies.length > 0 && (
              <Select value={companyId || ""} onValueChange={handleCompanySwitch}>
                <SelectTrigger className="w-[120px] h-8">
                  <Building2 className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Velg..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.navn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* Mobile Navigation - Hamburger Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Menu className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card/95 backdrop-blur-md border-glass z-50">
                <DropdownMenuItem onClick={() => navigate("/kart")}>Kart</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/dokumenter")}>Dokumenter</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/kalender")}>Kalender</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/hendelser")}>Hendelser</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/status")}>Status</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/ressurser")}>Ressurser</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
                className="gap-1 relative h-8 w-8 p-0"
                title="Administrator"
              >
                <Settings className="w-4 h-4" />
                <PendingApprovalsBadge isAdmin={isAdmin} />
              </Button>
            )}
            <ProfileDialog />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              title="Logg ut"
              className="h-8 w-8 p-0"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 flex-shrink">
            <Button variant="ghost" size="sm" onClick={() => navigate("/kart")}>Kart</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/dokumenter")}>Dokumenter</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/kalender")}>Kalender</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/hendelser")}>Hendelser</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/status")}>Status</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/ressurser")}>Ressurser</Button>
          </nav>
          
          <nav className="hidden md:flex items-center gap-1 sm:gap-2 lg:gap-4 flex-shrink-0">
            {isSuperAdmin && companies.length > 0 && (
              <Select value={companyId || ""} onValueChange={handleCompanySwitch}>
                <SelectTrigger className="w-[180px] h-9">
                  <Building2 className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Velg selskap..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.navn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
                className="gap-2 relative"
                title="Administrator"
              >
                <Settings className="w-4 h-4" />
                <PendingApprovalsBadge isAdmin={isAdmin} />
              </Button>
            )}
            <ProfileDialog />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              title="Logg ut"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
};
