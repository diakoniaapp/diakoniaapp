import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  User,
  Settings,
  LogOut,
  HeartHandshake,
  ShieldCheck,
  KeyRound,
} from "lucide-react";

/**
 * Botão de usuário com menu dropdown — aparece no topo direito do header mobile.
 * Mostra: Perfil, Configurações, (admin: Criar Ministério, Recuperação de Senhas), Sair.
 */
export function UserMenuButton() {
  const { user, signOut, hasRole, roles } = useAuth();
  const navigate = useNavigate();
  const [nome, setNome] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("nome")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.nome) setNome(data.nome.split(" ")[0]);
        else if (user.email) setNome(user.email.split("@")[0]);
      });
  }, [user]);

  if (!user) return null;

  const initials = nome
    ? nome.slice(0, 2).toUpperCase()
    : (user.email ?? "??").slice(0, 2).toUpperCase();

  const roleLabel: Record<string, string> = {
    admin: "Administrador",
    secretaria: "Secretaria",
    diakonia: "Diakonia",
    lideranca: "Liderança",
    pastor: "Pastor",
    tesoureiro: "Tesoureiro",
    professor_ebd: "Prof. EBD",
    voluntario: "Voluntário",
    membro: "Membro",
  };
  const principalRole = roles[0] ?? "membro";

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Menu do usuário"
          className="w-9 h-9 rounded-full ring-2 ring-gold/40 hover:ring-gold/80 active:scale-95 transition-all focus:outline-none"
        >
          <Avatar className="w-9 h-9">
            <AvatarFallback className="bg-gold/20 text-gold font-bold text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-56 shadow-elevated">
        {/* Cabeçalho com info do usuário */}
        <DropdownMenuLabel className="pb-2">
          <div className="flex items-center gap-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-gold/20 text-gold font-bold text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{nome || "Usuário"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2 ml-0.5">
            <ShieldCheck className="w-3 h-3 text-gold" />
            <span className="text-[11px] text-muted-foreground">{roleLabel[principalRole] ?? principalRole}</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Ações comuns */}
        <DropdownMenuItem
          className="gap-2 cursor-pointer py-2.5"
          onClick={() => navigate("/membros")}
        >
          <User className="w-4 h-4 text-muted-foreground" />
          <span>Meu Perfil</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="gap-2 cursor-pointer py-2.5"
          onClick={() => navigate("/ministerios")}
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
          <span>Configurações</span>
        </DropdownMenuItem>

        {/* Ações exclusivas para admin/secretaria */}
        {hasRole(["admin", "secretaria"]) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 py-1">
              Administração
            </DropdownMenuLabel>
            <DropdownMenuItem
              className="gap-2 cursor-pointer py-2.5"
              onClick={() => navigate("/ministerios?novo=1")}
            >
              <HeartHandshake className="w-4 h-4 text-muted-foreground" />
              <span>Criar Ministério</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 cursor-pointer py-2.5"
              onClick={() => navigate("/admin/recuperacao-senha")}
            >
              <KeyRound className="w-4 h-4 text-muted-foreground" />
              <span>Recuperação de Senhas</span>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        {/* Sair */}
        <DropdownMenuItem
          className="gap-2 cursor-pointer py-2.5 text-destructive focus:text-destructive focus:bg-destructive/10"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserMenuButton;
