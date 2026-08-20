// ─── MinisterioVoluntarios.tsx ───────────────────────────────────────────────
// Quem serve neste ministério, e em que estado cada um está.
//
// Sprint 1 do plano de escalas. É uma tela SÓ DE LEITURA sobre
// `v_voluntarios_completo` — uma view que já existia no banco e que nenhuma
// tela tinha aberto. Nenhum cálculo novo, nenhuma tabela nova.
//
// Ela responde quatro das cinco perguntas que um líder não conseguia fazer:
// quem serve, quem está sobrecarregado, quem está afastado, quem sumiu. A
// quinta — "quem está disponível domingo à noite?" — depende de as pessoas
// preencherem o passo "Quando serve" no cadastro.
//
// ── A REGRA QUE MANDA NESTA TELA ─────────────────────────────────────────────
//
// Ela nunca afirma o que ninguém verificou. Quem não tem perfil de serviço
// aparece como "Sem disponibilidade", não como "indisponível", e sem barra de
// carga — porque o teto de 4 escalas/mês é um padrão do banco, não uma decisão
// da pessoa. Ver o comentário longo em services/voluntariosPainel.ts.

import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { PaginaSkeleton, EmptyState } from "@/components/ListState";
import { ArrowLeft, Search, MessageCircle, Users } from "lucide-react";
import { formatarTelefoneSemDDI } from "@/lib/telefone";
import { buildWhatsAppLink } from "@/lib/visitantesFluxo";
import { useAuth } from "@/hooks/useAuth";
import { DisponibilidadeDialog } from "@/components/membros/DisponibilidadeDialog";
import { CalendarClock } from "lucide-react";
import {
  voluntariosDoMinisterio, estadoDe, ROTULO_ESTADO, quandoServe,
  type VoluntarioDoPainel, type EstadoVoluntario,
} from "@/services/voluntariosPainel";

/** Cada estado tem cor E forma — a cor sozinha não é acessível. */
const COR_ESTADO: Record<EstadoVoluntario, string> = {
  descanso:   "bg-warning-soft text-warning-text border-warning-line",
  no_limite:  "bg-destructive-soft text-destructive-text border-destructive-line",
  sumido:     "bg-info-soft text-info-text border-info-line",
  sem_perfil: "bg-muted text-muted-foreground border-border",
  disponivel: "bg-success-soft text-success-text border-success-line",
};

/**
 * A barra de carga.
 *
 * Só aparece para quem tem perfil. Sem perfil, o "de 4" seria um teto que a
 * pessoa nunca escolheu — e a barra viraria uma medida inventada.
 */
function BarraDeCarga({ v }: { v: VoluntarioDoPainel }) {
  // Sem perfil, a barra simplesmente NÃO aparece. Um travessão solto numa
  // pilha de quatro itens parece dado faltando, e não pergunta não feita —
  // e a linha "Ninguém perguntou ainda" já diz isso, com palavras.
  if (!v.temPerfil) return null;
  const pct = Math.min(100, Math.round((v.cargaMes / Math.max(v.maxMes, 1)) * 100));
  const tom = pct >= 100 ? "bg-destructive" : pct >= 60 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-16 h-1.5 rounded-full bg-muted overflow-hidden shrink-0"
        role="img"
        aria-label={`${v.cargaMes} de ${v.maxMes} escalas no mês`}
      >
        <div className={`h-full ${tom}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {v.cargaMes}/{v.maxMes}
      </span>
    </div>
  );
}

/**
 * "Onde serve" — áreas, e a função só quando ela informa alguma coisa.
 *
 * A coluna `funcao` de `area_voluntarios` guarda três coisas misturadas,
 * contadas no banco: "Voluntário" 46 vezes (o padrão que o formulário grava),
 * nomes de ÁREA que vazaram para lá — "Recepção" 16, "Introdução" 1 — e as
 * funções de verdade: Líder, Co-líder, Apoio, Planejamento, Atendimento.
 *
 * Sem filtrar, a linha saía "Recepção · Recepção" e "Introdução · Voluntário".
 * Repetir o nome da área e anunciar o padrão genérico não dizem nada — e uma
 * linha de apoio que não diz nada rouba a atenção de uma que diz.
 */
function onde(v: VoluntarioDoPainel): string {
  const areas = v.atuacoes.map(a => a.area_nome);
  const areasNorm = new Set(areas.map(x => x.toLowerCase()));
  const funcoes = [...new Set(
    v.atuacoes
      .map(a => (a.funcao ?? "").trim())
      .filter(f => f && f.toLowerCase() !== "voluntário" && f.toLowerCase() !== "voluntario")
      .filter(f => !areasNorm.has(f.toLowerCase())),
  )];
  return [...areas, ...funcoes].join(" · ");
}

export default function MinisterioVoluntarios() {
  const { ministerioId = "" } = useParams();
  const [nomeMinisterio, setNome] = useState<string>("");
  const [lista, setLista] = useState<VoluntarioDoPainel[]>([]);
  const [loading, setLoading] = useState(true);
  const [versao, setVersao] = useState(0);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<EstadoVoluntario | "todos">("todos");
  const [editando, setEditando] = useState<VoluntarioDoPainel | null>(null);

  // O portão é o da POLÍTICA, não o `canEdit` do app.
  //
  // `canEdit` é admin+secretaria. A política de escrita de `perfil_servico`
  // (ps_admin) cobre admin, secretaria E liderança. Usar `canEdit` aqui
  // esconderia o botão justamente do papel que mais precisa dele — o líder
  // que está olhando o painel do próprio ministério.
  const { hasRole } = useAuth();
  const podeEditar = hasRole(["admin", "secretaria", "lideranca"]);

  useEffect(() => {
    if (!ministerioId) return;
    (async () => {
      setLoading(true);
      const [{ data: m }, vols] = await Promise.all([
        supabase.from("ministerios").select("nome").eq("id", ministerioId).maybeSingle(),
        voluntariosDoMinisterio(ministerioId),
      ]);
      setNome(m?.nome ?? "");
      setLista(vols);
      setLoading(false);
    })();
  }, [ministerioId, versao]);

  // Recarrega a lista depois de salvar uma disponibilidade, para o chip e a
  // barra mudarem na hora — sem isso a pessoa salva e a linha continua
  // dizendo "ninguém perguntou ainda".
  const recarregar = () => setVersao(v => v + 1);

  const comEstado = useMemo(
    () => lista.map(v => ({ v, estado: estadoDe(v) })),
    [lista],
  );

  /** Quantos em cada estado — vira o número da ficha de filtro. */
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: comEstado.length };
    for (const { estado } of comEstado) c[estado] = (c[estado] ?? 0) + 1;
    return c;
  }, [comEstado]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return comEstado.filter(({ v, estado }) => {
      if (filtro !== "todos" && estado !== filtro) return false;
      if (!termo) return true;
      return v.nome_completo.toLowerCase().includes(termo)
        || v.atuacoes.some(a => a.area_nome.toLowerCase().includes(termo));
    });
  }, [comEstado, filtro, busca]);

  // A ordem das fichas é a de urgência para quem monta escala.
  const fichas: (EstadoVoluntario | "todos")[] =
    ["todos", "disponivel", "sumido", "no_limite", "descanso", "sem_perfil"];

  if (loading) return <PaginaSkeleton />;

  return (
    <div>
      <PageHeader
        title={nomeMinisterio || "Voluntários"}
        description={`${lista.length} ${lista.length === 1 ? "pessoa serve" : "pessoas servem"} neste ministério`}
        actions={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/ministerios"><ArrowLeft className="w-4 h-4" /> Ministérios</Link>
          </Button>
        }
      />

      <div className="p-4 md:p-8 space-y-4 max-w-5xl">

        {/* ── Busca e filtros ─────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou área…"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {fichas.map(f => {
            const n = contagem[f] ?? 0;
            if (f !== "todos" && n === 0) return null;   // ficha vazia é ruído
            const ativa = filtro === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={ativa}
                className={`min-h-[36px] px-3 rounded-full border text-xs font-medium transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  ativa ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="tabular-nums font-semibold">{n}</span>{" "}
                {f === "todos" ? "Todos" : ROTULO_ESTADO[f]}
              </button>
            );
          })}
        </div>

        {/* ── A lista ─────────────────────────────────────────────────── */}
        {visiveis.length === 0 ? (
          <EmptyState
            variante={lista.length === 0 ? "vazio" : "busca"}
            message={lista.length === 0 ? "Ninguém serve neste ministério ainda" : "Ninguém com esses filtros"}
            descricao={lista.length === 0
              ? "Os voluntários entram pelas áreas do ministério, ou pela ficha da pessoa, no passo Vínculos."
              : "Tente outro filtro, ou limpe a busca."}
          />
        ) : (
          <div className="space-y-1.5">
            {visiveis.map(({ v, estado }) => {
              const zap = buildWhatsAppLink(v.telefone, "");
              return (
                <Card key={v.pessoa_id} className="shadow-card-soft">
                  <CardContent className="p-3 flex items-start gap-3">

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="font-medium leading-snug truncate">{v.nome_completo}</p>

                      {/* Onde serve. Uma pessoa em duas áreas do mesmo
                          ministério aparece UMA vez, com as duas áreas. */}
                      <p className="text-xs text-muted-foreground truncate">
                        {onde(v)}
                      </p>

                      <p className="text-xs text-muted-foreground truncate">
                        {quandoServe(v)}
                        {v.diasSemServir !== null && v.diasSemServir >= 60 && (
                          <span className="text-info-text"> · última escala há {v.diasSemServir} dias</span>
                        )}
                      </p>

                      {v.restricoes && (
                        <p className="text-xs text-warning-text truncate">⚠ {v.restricoes}</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge variant="outline" className={`text-xs ${COR_ESTADO[estado]}`}>
                        {ROTULO_ESTADO[estado]}
                      </Badge>
                      <BarraDeCarga v={v} />
                      <div className="flex items-center gap-1">
                      {podeEditar && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditando(v)}
                          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <CalendarClock className="w-3 h-3" />
                          {v.temPerfil ? "Editar" : "Informar"}
                        </Button>
                      )}
                      {zap && (
                        <a
                          href={zap}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Conversar com ${v.nome_completo} no WhatsApp`}
                          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          <MessageCircle className="w-3 h-3" />
                          {formatarTelefoneSemDDI(v.telefone)}
                        </a>
                      )}
                      </div>
                    </div>

                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── O aviso que evita a tela mentir ─────────────────────────── */}
        {contagem.sem_perfil > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p className="leading-relaxed">
              <strong className="text-foreground">
                {contagem.sem_perfil} {contagem.sem_perfil === 1 ? "pessoa ainda não disse" : "pessoas ainda não disseram"} quando pode servir.
              </strong>{" "}
              Isso não quer dizer que não possam — quer dizer que ninguém perguntou. O passo
              “Quando serve”, na ficha de cada uma, é o que preenche essa coluna e faz as
              sugestões de escala pararem de empatar.
            </p>
          </div>
        )}

      </div>

      <DisponibilidadeDialog
        pessoaId={editando?.pessoa_id ?? null}
        nome={editando?.nome_completo ?? ""}
        open={!!editando}
        onOpenChange={v => { if (!v) setEditando(null); }}
        onSalvo={recarregar}
      />
    </div>
  );
}
