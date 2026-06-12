// ─── Dashboard — refatoração FASE 1 ──────────────────────────────────────
// Mantém: saudação + versículo + visitante rápido (já existiam)
// Acrescenta: estrutura modular dos 9 blocos com shells e Bloco 1 (Ações Rápidas)
// Fases seguintes vão preencher cada Bloco como widget próprio.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Quote, ShieldCheck, UserPlus, Users, Home, GraduationCap,
  CalendarCheck, DollarSign, FileText, Sparkles, Bell, Heart,
  CalendarDays, BarChart3, Lightbulb,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { verseOfTheDay } from "@/lib/agenda/verses";
import { usePermissoes } from "@/hooks/usePermissoes";
import VisitanteRapidoDialog from "@/components/membros/VisitanteRapidoDialog";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { getWidgetsParaUsuario } from "@/dashboard/widgetRegistry";

// ─── Saudação por horário ────────────────────────────────────────────────
function getSaudacao(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12)  return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador", secretaria: "Secretaria",
  diakonia: "Pastor", pastor: "Pastor",
  lideranca: "Liderança", voluntario: "Voluntário",
};

const ROLE_VALORES = [
  "Administrador","Secretaria","Pastor","Lideranca","Liderança",
  "admin","secretaria","diakonia","lideranca","pastor","voluntario",
];

export default function Dashboard() {
  const { user, roles } = useAuth();
  const { podeFazer, permissoes } = usePermissoes();
  const principalRole = roles[0] ?? "lideranca";
  const [nome, setNome] = useState<string>("Visitante");
  const [openVisitanteRapido, setOpenVisitanteRapido] = useState(false);
  const verse = verseOfTheDay();

  // Nome bonito do usuário (vinda de profiles.nome)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles").select("nome").eq("id", user.id).maybeSingle();
      const valor = prof?.nome?.trim() ?? "";
      const invalido = !valor || valor.includes("@") || /^\d+$/.test(valor) || ROLE_VALORES.includes(valor);
      if (!invalido) {
        const p = valor.split(" ")[0];
        setNome(p.charAt(0).toUpperCase() + p.slice(1));
      } else {
        setNome("Visitante");
      }
    })();
  }, [user]);

  return (
    <div>
      {/* ── HEADER: Saudação ─────────────────────────────────────────────── */}
      <div className="border-b bg-card">
        <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-gold shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/80">
                {ROLE_LABEL[principalRole] ?? principalRole}
              </span>
            </div>
            <h1 className="font-serif text-2xl md:text-4xl text-foreground">
              {getSaudacao()}, {nome}! 🙏
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              O que precisa da sua atenção hoje?
            </p>
          </div>
          <div className="flex gap-2 shrink-0 self-end md:self-auto">
                        <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="text-gold hover:bg-gold/10 shrink-0" title="Versículo do dia">
                  <Quote className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 bg-gradient-verse border-0 shadow-elevated">
                <div className="space-y-2">
                  <div className="text-[10px] tracking-[0.2em] uppercase text-gold/90">Versículo do dia</div>
                  <p className="font-serif text-base leading-relaxed text-foreground/95">&ldquo;{verse.texto}&rdquo;</p>
                  <div className="text-gold text-sm font-medium tracking-wide">{verse.ref}</div>
                </div>
              </PopoverContent>
            </Popover>
            <Button onClick={() => setOpenVisitanteRapido(true)}
              className="gap-2 bg-gold hover:bg-gold/90 text-white border-0 shadow-sm">
              <UserPlus className="w-4 h-4" />
              <span translate="no">Visitante Rápido</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── CORPO ───────────────────────────────────────────────────────── */}
      <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">


        {/* ── BLOCO 1 — AÇÕES RÁPIDAS (adaptado ao perfil) ────────────── */}
        <BlocoSecao titulo="Ações rápidas" icon={Sparkles} subtitulo="Atalhos relevantes para você">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {podeFazer("criar_pessoa") && <AcaoRapida to="/membros?abrir=novo" icon={UserPlus} label="Cadastrar pessoa" />}
            {podeFazer("ver_familias") && <AcaoRapida to="/familias" icon={Home} label="Gerenciar famílias" />}
            {podeFazer("ver_ebd") && <AcaoRapida to="/ebd" icon={GraduationCap} label="Abrir EBD" />}
            {podeFazer("ver_pgm") && <AcaoRapida to="/pgm" icon={Users} label="Pequenos Grupos" />}
            {podeFazer("ver_painel_pastoral") && <AcaoRapida to="/painel-pastoral" icon={Sparkles} label="Painel Pastoral" />}
            {podeFazer("ver_painel_secretaria") && <AcaoRapida to="/painel-secretaria" icon={Sparkles} label="Painel Secretaria" />}
            {podeFazer("ver_membresia") && <AcaoRapida to="/membresia" icon={FileText} label="Membresia" />}
            {podeFazer("ver_governanca") && <AcaoRapida to="/governanca" icon={FileText} label="Governança" />}
            {podeFazer("ver_assuntos") && <AcaoRapida to="/assuntos" icon={FileText} label="Assuntos" />}
            {podeFazer("ver_financeiro") && <AcaoRapida to="/financas" icon={FileText} label="Finanças" />}
          </div>
        </BlocoSecao>

        {/* ── WIDGETS DINÂMICOS (registry) ─────────────────────────────── */}
        {getWidgetsParaUsuario({ permissoes }).map(w => {
          const Icon = w.icone;
          const Comp = w.component;
          return (
            <BlocoSecao key={w.id} titulo={w.label} icon={Icon} subtitulo={w.subtitulo}>
              <Suspense fallback={
                <div className="py-4 text-center text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" /> Carregando...
                </div>
              }>
                <Comp />
              </Suspense>
            </BlocoSecao>
          );
        })}

      </div>

      <VisitanteRapidoDialog open={openVisitanteRapido} onOpenChange={setOpenVisitanteRapido} onSaved={() => {}} />
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────────

interface BlocoSecaoProps {
  titulo: string;
  subtitulo?: string;
  icon: typeof Sparkles;
  children: React.ReactNode;
}
function BlocoSecao({ titulo, subtitulo, icon: Icon, children }: BlocoSecaoProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <div>
          <h2 className="font-serif text-lg flex items-center gap-2">
            <Icon className="w-4 h-4 text-gold" />
            {titulo}
          </h2>
          {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

interface AcaoRapidaProps {
  to: string;
  icon: typeof Sparkles;
  label: string;
}
function AcaoRapida({ to, icon: Icon, label }: AcaoRapidaProps) {
  return (
    <Link to={to}>
      <Card className="shadow-card-soft hover:shadow-elevated hover:border-gold/40 transition-all cursor-pointer group">
        <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
          <div className="w-9 h-9 rounded-md bg-gold/15 ring-1 ring-gold/30 flex items-center justify-center group-hover:bg-gold/25 transition-colors">
            <Icon className="w-4 h-4 text-gold" />
          </div>
          <span className="text-xs font-medium leading-tight">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

function Placeholder({ texto }: { texto: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-5 text-center">
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xl mx-auto">
          {texto}
        </p>
      </CardContent>
    </Card>
  );
}

