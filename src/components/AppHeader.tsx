import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, Users, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AppHeader() {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
            {profile?.nome?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || "?"}
          </div>
          <span className="text-sm hidden sm:inline">{profile?.nome || profile?.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{profile?.nome}</div>
          <div className="text-xs text-muted-foreground font-normal">{profile?.email}</div>
          {isAdmin && <div className="text-xs text-primary font-semibold mt-1">Administrador</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/")} className="gap-2">
          <Home className="w-4 h-4" /> Início
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onClick={() => navigate("/admin/usuarios")} className="gap-2">
            <Users className="w-4 h-4" /> Gerenciar usuários
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => { await signOut(); navigate("/auth"); }} className="gap-2 text-destructive">
          <LogOut className="w-4 h-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
