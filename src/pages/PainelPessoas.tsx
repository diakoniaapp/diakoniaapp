// ─── PainelPessoas.tsx — o workspace de quem cuida do cadastro ─────────────
//
// Fase 3 do roadmap (Diagnóstico de 29/09/2026, "do menu ao workspace"): o
// item de maior benefício isolado, porque cadastrar pessoa é o fluxo mais
// repetido do sistema — hoje 2 cliques até o Catálogo, mais um formulário de
// 6 passos em outra tela. Não reescreve `Membros.tsx` (1.609 linhas, "o
// componente mais frágil do sistema" segundo o CLAUDE.md): esta tela é a
// bancada de entrada, não o catálogo em si.
//
// ── ESCOPO DA v1 (confirmado com a Telma, 29/09/2026) ───────────────────────
//
// Cabeçalho + "Meu trabalho" (Nova pessoa / Novo visitante, ambos INLINE via
// `MembroForm` — mesmo padrão já usado em `Home.tsx`/`EbdChamada.tsx`, nunca
// navega) + os dois widgets que já existiam prontos no registry
// (`atencao-pessoas`, `vida-das-familias` — só ganharam o painel "pessoas"
// no próprio registry, zero código novo neles) + atalhos pro resto do grupo
// Pessoas. Ficou de fora, de propósito, a v2 maior (abas para Famílias/
// Ministérios/Organograma/Membresia) — decisão dela, não limitação técnica.
//
// Mesmo esqueleto de `PainelSecretaria.tsx`: cabeçalho fixo, sem frase-resumo
// nem faixa de indicadores própria (os dois widgets embutidos já cobrem o que
// uma frase diria — "X visitantes recentes", "Y aniversários da semana" —,
// repetir seria a mesma competição de números que a Secretaria já resolveu
// uma vez tirando os números da faixa).

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Users, UserPlus, UserCheck, Home, HeartHandshake, Building2, FileText, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TituloDaSecao } from "@/components/painel/blocos";
import { MembroForm } from "@/components/membros/MembroForm";
import { WidgetsDoPainel } from "@/dashboard/WidgetsDoPainel";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";

export default function PainelPessoas() {
  // Mesmo portão de `Membros.tsx` — ver o comentário de lá sobre por que o
  // papel fixo é só o piso (conjunto de permissões vazio = consulta falhou,
  // não "sem direito nenhum").
  const { podeEditarPessoas } = useAuth();
  const { podeFazer, permissoes: permsCarregadas, loading: permsCarregando } = usePermissoes();
  const naoSabemos = permsCarregando || permsCarregadas.size === 0;
  const canEdit = naoSabemos ? podeEditarPessoas : podeFazer("editar_pessoa");

  const [novaPessoaOpen, setNovaPessoaOpen] = useState(false);
  const [novoVisitanteOpen, setNovoVisitanteOpen] = useState(false);

  return (
    <div className="p-6 space-y-4 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
      <div className="sticky top-0 z-20 bg-background -mx-6 px-6 -mt-6 pt-6 pb-3 space-y-3 border-b">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <Users className="w-6 h-6 text-gold shrink-0" />
            Painel de Pessoas
          </h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>

        {/* ── Meu trabalho ──────────────────────────────────────────────────
            Mesmo padrão da Tesouraria: ações que abrem INLINE, sem navegar.
            É isto que leva "cadastrar pessoa"/"cadastrar visitante" de 2
            cliques + formulário em outra tela para 1 clique. */}
        {canEdit && (
          <section className="flex flex-wrap items-center gap-1.5">
            <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground mr-1 shrink-0">
              Meu trabalho
            </span>
            <Button type="button" variant="outline" size="sm" className="h-7 rounded-full gap-1.5 text-xs"
              onClick={() => setNovaPessoaOpen(true)}>
              <UserPlus className="w-3 h-3" /> Nova pessoa
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 rounded-full gap-1.5 text-xs"
              onClick={() => setNovoVisitanteOpen(true)}>
              <UserCheck className="w-3 h-3" /> Novo visitante
            </Button>
          </section>
        )}
      </div>

      {/* ── Ir para ────────────────────────────────────────────────────────
          v1 não embute Famílias/Ministérios/Organograma/Membresia como
          abas — atalho pra cada rota existente, como `PainelSecretaria.tsx`
          já faz pro próprio grupo. */}
      <section>
        <TituloDaSecao icone={Users} tom="neutro">Ir para</TituloDaSecao>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Link to="/membros"
            className="flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-md border bg-card group">
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">Catálogo completo</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <Link to="/visitantes"
            className="flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-md border bg-card group">
            <UserCheck className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">Visitantes</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <Link to="/familias"
            className="flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-md border bg-card group">
            <Home className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">Famílias</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <Link to="/ministerios"
            className="flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-md border bg-card group">
            <HeartHandshake className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">Ministérios</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <Link to="/organograma"
            className="flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-md border bg-card group">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">Organograma</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <Link to="/membresia"
            className="flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-md border bg-card group">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">Membresia</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
        </div>
      </section>

      {/* Os dois widgets que já existiam prontos no registry — ver o
          comentário do topo. Quem decide se aparecem é o registry, pelo
          campo `paineis`; a permissão de quem olha continua valendo por
          cima (mesmo mecanismo de `WidgetsDoPainel`). */}
      <WidgetsDoPainel painel="pessoas" />

      <MembroForm
        open={novaPessoaOpen} onOpenChange={setNovaPessoaOpen}
        membro={null} onSaved={() => {}}
      />
      <MembroForm
        open={novoVisitanteOpen} onOpenChange={setNovoVisitanteOpen}
        membro={null} tipoInicial="visitante" onSaved={() => {}}
      />
    </div>
  );
}
