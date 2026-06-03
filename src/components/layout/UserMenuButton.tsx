import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  User, LogOut, HeartHandshake, ShieldCheck,
  KeyRound, ShieldAlert, Church, FileText, Upload, Download, Flame,
} from "lucide-react";

export function UserMenuButton() {
  const { user, signOut, hasRole, roles } = useAuth();
  const navigate = useNavigate();
  const [nome, setNome] = useState<string>("");

  const primeiroNome = (valor: string | null | undefined): string => {
    if (!valor || valor.includes("@")) return "";
    const p = valor.trim().split(" ")[0];
    return p.charAt(0).toUpperCase() + p.slice(1);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles").select("nome").eq("id", user.id).maybeSingle();
      const nomePerfil = primeiroNome(prof?.nome);
      if (nomePerfil) { setNome(nomePerfil); return; }
      const { data: membro } = await supabase
        .from("membros").select("nome_completo")
        .eq("email", user.email ?? "").maybeSingle();
      const nomeMembro = primeiroNome(membro?.nome_completo);
      if (nomeMembro) {
        setNome(nomeMembro);
        await supabase.from("profiles").update({ nome: membro!.nome_completo }).eq("id", user.id);
        return;
      }
      const fallback = (user.email ?? "").split("@")[0];
      setNome(fallback.charAt(0).toUpperCase() + fallback.slice(1));
    })();
  }, [user]);

  if (!user) return null;

  const initials = nome
    ? nome.slice(0, 2).toUpperCase()
    : (user.email ?? "??").slice(0, 2).toUpperCase();

  const roleLabel: Record<string, string> = {
    admin: "Administrador", secretaria: "Secretaria",
    diakonia: "Pastor",     lideranca:  "Lideranca",
  };
  const principalRole = roles[0] ?? "lideranca";

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Menu do usuario"
          className="w-9 h-9 rounded-full ring-2 ring-gold/40 hover:ring-gold/80 active:scale-95 transition-all focus:outline-none"
        >
          <Avatar className="w-9 h-9">
            <AvatarFallback className="bg-gold/20 text-gold font-bold text-sm">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-56 shadow-elevated">
        <DropdownMenuLabel className="pb-2">
          <div className="flex items-center gap-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-gold/20 text-gold font-bold text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{nome || "Usuario"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <ShieldCheck className="w-3 h-3 text-gold" />
            <span className="text-[11px] text-muted-foreground">{roleLabel[principalRole] ?? principalRole}</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem className="gap-2 cursor-pointer py-2.5"
          onClick={() => navigate("/membros")}>
          <User className="w-4 h-4 text-muted-foreground" />
          <span>Meu Perfil</span>
        </DropdownMenuItem>

        {hasRole(["admin", "secretaria"]) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 py-1">
              Administracao
            </DropdownMenuLabel>
            {[
              { path: "/ministerios?novo=1",      label: "Criar Ministerio",       Icon: HeartHandshake },
              { path: "/admin/recuperacao-senha", label: "Recuperacao de Senhas",  Icon: KeyRound },
              { path: "/admin/lgpd",              label: "Painel LGPD",            Icon: ShieldAlert },
              { path: "/admin/identidade",        label: "Identidade da Igreja",   Icon: Church },
              { path: "/admin/documentos",        label: "Documentos",             Icon: FileText },
              { path: "/admin/importacao",        label: "Importacao de Membros",  Icon: Upload },
              { path: "/admin/exportacao",        label: "Exportacao de Dados",    Icon: Download },
              { path: "/admin/campanhas",         label: "Campanhas Espirituais",  Icon: Flame },
            ].map(({ path, label, Icon }) => (
              <DropdownMenuItem key={path} className="gap-2 cursor-pointer py-2.5"
                onClick={() => navigate(path)}>
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span>{label}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 cursor-pointer py-2.5 text-destructive focus:text-destructive focus:bg-destructive/10"
          onClick={handleSignOut}>
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserMenuButton;
