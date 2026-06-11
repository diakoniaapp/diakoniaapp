// ─── Dashboard — refatoração FASE 1 ──────────────────────────────────────
// Mantém: saudação + versículo + visitante rápido (já existiam)
// Acrescenta: estrutura modular dos 9 blocos com shells e Bloco 1 (Ações Rápidas)
// Fases seguintes vão preencher cada Bloco como widget próprio.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Quote, ShieldCheck, UserPlus, Users, Home, GraduationCap,
  CalendarCheck, DollarSign, FileText, Sparkles, Bell, Heart,
  CalendarDays, BarChart3, Lightbulb,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { verseOfTheDay } from "@/lib/agenda/verses";
import VisitanteRapidoDialog from "@/components/membros/VisitanteRapidoDialog";
import { AlertasInteligentes } from "@/components/dashboard/AlertasInteligentes";
import { VidaDasFamilias } from "@/components/dashboard/VidaDasFamilias";
import { AcoesDoDia } from "@/components/dashboard/AcoesDoDia";
import { AtencaoEmPessoas } from "@/components/dashboard/AtencaoEmPessoas";

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
          <div className="hidden md:flex gap-2 shrink-0">
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

        {/* Versículo do dia */}
        <Card className="overflow-hidden border-0 shadow-elevated bg-gradient-verse text-foreground relative">
          <div className="absolute -top-8 -right-8 opacity-10 pointer-events-none">
            <Quote className="w-36 h-36" />
          </div>
          <CardContent className="px-6 py-6 md:px-8 md:py-8 relative">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="hidden md:flex w-10 h-10 rounded-full bg-gold/20 ring-1 ring-gold/40 items-center justify-center shrink-0">
                <Quote className="w-4 h-4 text-gold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] tracking-[0.2em] uppercase text-gold/90 mb-2">Versículo do dia</div>
                <p className="font-serif text-lg md:text-xl leading-relaxed text-foreground/95 line-clamp-4">"{verse.texto}"</p>
                <div className="text-gold mt-3 text-sm font-medium tracking-wide">{verse.ref}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── BLOCO 1 — AÇÕES RÁPIDAS ───────────────────────────────────── */}
        <BlocoSecao titulo="Ações rápidas" icon={Sparkles}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <AcaoRapida to="/membros?abrir=novo"   icon={UserPlus}       label="Cadastrar pessoa" />
            <AcaoRapida to="/familias"             icon={Home}           label="Gerenciar famílias" />
            <AcaoRapida to="/ebd"                  icon={GraduationCap}  label="Abrir EBD" />
            <AcaoRapida to="/ebd"                  icon={CalendarCheck}  label="Fazer chamada" />
            <AcaoRapida to="/painel-pastoral"      icon={Sparkles}       label="Painel Pastoral" />
            <AcaoRapida to="/admin/documentos"     icon={FileText}       label="Documentos" />
          </div>
        </BlocoSecao>

        {/* ── BLOCO 2 — ALERTAS INTELIGENTES ───────────────────────────── */}
        <BlocoSecao titulo="Alertas inteligentes" icon={Bell} subtitulo="Coisas que precisam da sua decisão">
          <AlertasInteligentes />
        </BlocoSecao>

        {/* ── BLOCO 3 — VIDA DAS FAMÍLIAS ──────────────────────────────── */}
        <BlocoSecao titulo="Vida das famílias" icon={Heart} subtitulo="Aniversários e bodas da semana">
          <VidaDasFamilias />
        </BlocoSecao>

        {/* ── BLOCO 4 — AÇÕES DO DIA ───────────────────────────────────── */}
        <BlocoSecao titulo="Ações de hoje" icon={CalendarCheck} subtitulo="Aniversários e bodas que acontecem agora">
          <AcoesDoDia />
        </BlocoSecao>

        {/* ── BLOCO 5 — RESUMO DA EBD (placeholder) ─────────────────────── */}
        <BlocoSecao titulo="Resumo da EBD" icon={GraduationCap} subtitulo="Presença, crescimento e atenção pastoral">
          <Placeholder texto="Em construção (Fase 5): presença do último domingo, total de alunos por classe, faltas relevantes, comparativo semanal." />
        </BlocoSecao>

        {/* ── BLOCO 6 — CAMPANHAS (placeholder) ─────────────────────────── */}
        <BlocoSecao titulo="Campanhas em andamento" icon={DollarSign} subtitulo="Metas e arrecadação">
          <Placeholder texto="Em construção (Fase 6): cada campanha com meta vs arrecadado, porcentagem e barra de progresso. Requer EBD Fase C." />
        </BlocoSecao>

        {/* ── BLOCO 7 — PESSOAS ────────────────────────────────────────── */}
        <BlocoSecao titulo="Atenção em pessoas" icon={Users} subtitulo="Visitantes recentes, sem família, sem classe EBD">
          <AtencaoEmPessoas />
        </BlocoSecao>

        {/* ── BLOCO 8 — AGENDA DO DIA (placeholder) ─────────────────────── */}
        <BlocoSecao titulo="Agenda do dia" icon={CalendarDays} subtitulo="Eventos da igreja hoje">
          <Placeholder texto="Em construção (Fase 8): eventos de hoje da agenda da igreja + aniversários + bodas." />
        </BlocoSecao>

        {/* ── BLOCO 9 — INSIGHTS DO SISTEMA (placeholder) ───────────────── */}
        <BlocoSecao titulo="Insights do sistema" icon={Lightbulb} subtitulo="Sugestões automáticas para a liderança">
          <Placeholder texto="Em construção (Fase 9): inteligência cruzada — quedas de presença, padrões anômalos, áreas com poucos voluntários, sugestões de cuidado pastoral." />
        </BlocoSecao>

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

