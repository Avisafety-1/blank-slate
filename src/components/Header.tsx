import { Shield, LogOut, Settings, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileDialog } from "@/components/ProfileDialog";
import { PendingApprovalsBadge } from "@/components/PendingApprovalsBadge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Header = () => {
  const navigate = useNavigate();
  const { signOut, companyName, isSuperAdmin } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const { user } = useAuth();

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
      setIsAdmin(data || false);
    } catch (error) {
      console.error("Error checking admin status:", error);
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
          
          {/* Mobile Navigation - Hamburger Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="md:hidden">
              <Button variant="ghost" size="sm">
                <Menu className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-card/95 backdrop-blur-md border-glass z-50">
              <DropdownMenuItem onClick={() => navigate("/kart")}>Kart</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/dokumenter")}>Dokumenter</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/kalender")}>Kalender</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/hendelser")}>Hendelser</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/status")}>Status</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/ressurser")}>Ressurser</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 flex-shrink">
            <Button variant="ghost" size="sm" onClick={() => navigate("/kart")}>Kart</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/dokumenter")}>Dokumenter</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/kalender")}>Kalender</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/hendelser")}>Hendelser</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/status")}>Status</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/ressurser")}>Ressurser</Button>
          </nav>
          
          <nav className="flex items-center gap-1 sm:gap-2 lg:gap-4 flex-shrink-0">
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
