// ─── PendentesDeIdentificacao — a aba "Pendentes de Identificação" da tela Doadores (27/10/2026, Fase 3) ────────────────────────────────────────────────────────────────────────────────────────
// Transforma as contribuições sem pessoa em FILA DE TRABALHO: indicadores de progresso (taxa de identificação em quatro partes, meta de 95%), a fila com o nome que veio do extrato e a melhor sugestão, e as
// ações Aceitar sugestão, Vincular pessoa, Vincular família, Marcar como anônimo, Ignorar — todas com Desfazer. Vincular grava `pessoa_id` (e `familia_id`) no próprio lançamento: o painel, o Excel, os
// relatórios e os envios passam a contar a pessoa sozinhos (um só cálculo). Anônimo e ignorado ficam na trilha de triagem (migration 20261027220000).
// A fila mostra NOME (do extrato) e VALOR: é dado nominal; só aparece depois de registrar o acesso (`ver_pendentes`), como as outras listas com nomes.
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, EyeOff, Info, Loader2, Search, Target, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { brl } from "@/services/finService";
import { PISO_DE_IDENTIFICACAO } from "@/lib/contribuicoes";
import {
  META_DE_IDENTIFICACAO_PCT, NOTA_DE_CONTRIBUICAO_CONFIRMADA, motivoDePossivelMovimentacaoInterna, nomeProprio, prepararPendentes, taxaDeIdentificacao, type ContribuicaoParaTriagem, type DecisaoDeTriagem, type Dificuldade, type PendenteComSugestao,
} from "@/lib/identificacaoDeContribuicoes";
import type { CandidatoNome } from "@/lib/fuzzyNome";
import * as servicoReal from "@/services/pendentesDeIdentificacaoService";
import type { FamiliaParaVincular, PessoaParaVincular, ResultadoDaEscrita, TriagemCarregada, TriagemVigente } from "@/services/pendentesDeIdentificacaoService";
import { textoDoRegistro, useRegistroDeAcesso } from "./useRegistroDeAcesso";
import { useAuthOpcional } from "@/hooks/useAuth";

/** O formulário de cadastro de pessoa, carregado só quando se abre (é grande e só quem pode cadastrar o usa). */
const MembroForm = lazy(() => import("@/components/membros/MembroForm").then(m => ({ default: m.MembroForm })));

export interface ServicoDePendentes {
  carregarContribuicoes: () => Promise<ContribuicaoParaTriagem[]>;
  carregarTriagem: () => Promise<TriagemCarregada>;
  carregarCandidatos: () => Promise<CandidatoNome[]>;
  vincular: (lancamentoId: string, pessoaId: string, familiaId: string | null) => Promise<ResultadoDaEscrita>;
  desvincular: (lancamentoId: string, pessoaId: string, tinhaFamilia: boolean) => Promise<ResultadoDaEscrita>;
  triar: (lancamentoId: string, decisao: DecisaoDeTriagem | "desfeita") => Promise<ResultadoDaEscrita>;
  buscarPessoas: (termo: string) => Promise<PessoaParaVincular[]>;
  buscarFamilias: (termo: string) => Promise<FamiliaParaVincular[]>;
  familiaDaPessoa: (pessoaId: string) => Promise<string | null>;
  /** "É contribuição — não avisar mais" (possível movimentação interna) */
  confirmarContribuicao?: (lancamentoId: string) => Promise<ResultadoDaEscrita>;
}
const SERVICO_REAL: ServicoDePendentes = {
  carregarContribuicoes: servicoReal.carregarContribuicoesParaTriagem, carregarTriagem: servicoReal.carregarTriagem, carregarCandidatos: servicoReal.carregarCandidatosDeNome,
  vincular: servicoReal.vincularContribuicao, desvincular: servicoReal.desvincularContribuicao, triar: (id, d) => servicoReal.triarContribuicao(id, d),
  buscarPessoas: servicoReal.buscarPessoas, buscarFamilias: servicoReal.buscarFamilias, familiaDaPessoa: servicoReal.familiaDaPessoa, confirmarContribuicao: servicoReal.confirmarComoContribuicao,
};

const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const ROTULO_DIFICULDADE: Record<Dificuldade, string> = { facil: "Fáceis", media: "Médias", dificil: "Difíceis" };
const ROTULO_ORIGEM: Record<string, string> = { importado_omie: "Omie", importado_ofx: "Extrato (OFX)", manual: "Manual" };
const POR_PAGINA = 50;

type Alvo = { pendente: PendenteComSugestao; modo: "pessoa" | "familia" } | null;
/** Cadastro de pessoa aberto a partir da fila: `pendente` = a contribuição a vincular à pessoa assim que for criada (ausente = cadastro avulso). */
type Cadastro = { pendente: PendenteComSugestao | null; nome: string } | null;

export function PendentesDeIdentificacao({ servico = SERVICO_REAL, aoMudar }: { servico?: ServicoDePendentes; aoMudar?: () => void }) {
  const [contribuicoes, setContribuicoes] = useState<ContribuicaoParaTriagem[] | null>(null);
  const [triagem, setTriagem] = useState<Map<string, TriagemVigente>>(new Map());
  const [triagemIndisponivel, setTriagemIndisponivel] = useState(false);
  const [candidatos, setCandidatos] = useState<CandidatoNome[]>([]);
  const [erro, setErro] = useState("");
  const [vista, setVista] = useState<"pendentes" | "classificadas">("pendentes");
  const [dificuldade, setDificuldade] = useState<"todas" | Dificuldade>("todas");
  const [origem, setOrigem] = useState("todas");
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Alvo>(null);
  const [cadastro, setCadastro] = useState<Cadastro>(null);
  const podeCadastrar = !!useAuthOpcional()?.podeEditarPessoas;

  const carregar = useCallback(async () => {
    try {
      const [c, t, cand] = await Promise.all([servico.carregarContribuicoes(), servico.carregarTriagem(), servico.carregarCandidatos()]);
      setContribuicoes(c); setTriagem(new Map(t.vigentes.map(v => [v.lancamento_id, v]))); setTriagemIndisponivel(t.indisponivel); setCandidatos(cand); setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar as contribuições"); setContribuicoes([]); }
  }, [servico]);
  useEffect(() => { carregar(); }, [carregar]);

  const decisoes = useMemo(() => new Map([...triagem].map(([id, v]) => [id, v.decisao])), [triagem]);
  const taxa = useMemo(() => (contribuicoes ? taxaDeIdentificacao(contribuicoes, decisoes) : null), [contribuicoes, decisoes]);
  const todosPendentes = useMemo(
    () => (contribuicoes ? prepararPendentes(contribuicoes.filter(c => !c.pessoa_id && !decisoes.has(c.id)), candidatos) : []),
    [contribuicoes, decisoes, candidatos],
  );
  /** contribuições que parecem movimentação interna (conta de aplicação/poupança ou texto de resgate): só avisa, a pessoa confere */
  const paraConferir = useMemo(
    () => (contribuicoes ?? []).map(c => ({ c, motivo: motivoDePossivelMovimentacaoInterna(c) })).filter(x => x.motivo !== null) as { c: ContribuicaoParaTriagem; motivo: string }[],
    [contribuicoes],
  );
  const classificadas = useMemo(() => (contribuicoes ?? []).filter(c => !c.pessoa_id && decisoes.has(c.id)), [contribuicoes, decisoes]);
  const contagem = (d: Dificuldade) => todosPendentes.filter(p => p.dificuldade === d).length;
  const origens = useMemo(() => [...new Set(todosPendentes.map(p => p.contribuicao.origem ?? "manual"))], [todosPendentes]);
  const filtrados = useMemo(
    () => todosPendentes.filter(p => (dificuldade === "todas" || p.dificuldade === dificuldade) && (origem === "todas" || (p.contribuicao.origem ?? "manual") === origem)),
    [todosPendentes, dificuldade, origem],
  );

  const registro = useRegistroDeAcesso("ver_pendentes", { desde: PISO_DE_IDENTIFICACAO }, todosPendentes.length, contribuicoes !== null && !erro);

  // ── as ações ──
  const aposMudar = () => { aoMudar?.(); };
  const marcarVinculo = (id: string, pessoaId: string | null, familiaId: string | null) =>
    setContribuicoes(atual => (atual ?? []).map(c => (c.id === id ? { ...c, pessoa_id: pessoaId, familia_id: familiaId ?? (pessoaId ? c.familia_id : null) } : c)));

  async function vincular(p: PendenteComSugestao, pessoa: PessoaParaVincular, familiaId: string | null) {
    setOcupado(p.contribuicao.id);
    try {
      const familia = familiaId ?? (await servico.familiaDaPessoa(pessoa.id));
      const r = await servico.vincular(p.contribuicao.id, pessoa.id, familia);
      if (!r.ok) { toast.error(r.erro ?? "Não foi possível vincular."); return; }
      marcarVinculo(p.contribuicao.id, pessoa.id, familia);
      aposMudar();
      toast.success(`Vinculada a ${pessoa.nome}`, { action: { label: "Desfazer", onClick: () => desfazerVinculo(p.contribuicao.id, pessoa.id, !!familia) } });
    } finally { setOcupado(null); }
  }
  /** A pessoa foi cadastrada: entra nos candidatos (as próximas sugestões já a enxergam) e, se o cadastro veio de uma contribuição, ela é vinculada na hora. */
  async function aoCadastrarPessoa(id: string, nome: string) {
    const origemDoCadastro = cadastro;
    setCandidatos(c => (c.some(x => x.id === id) ? c : [...c, { id, nome }]));
    if (origemDoCadastro?.pendente) await vincular(origemDoCadastro.pendente, { id, nome }, null);
    else toast.success(`${nome} cadastrada. Já aparece nas sugestões.`);
  }
  async function confirmarComoContribuicao(id: string) {
    if (!servico.confirmarContribuicao) return;
    const r = await servico.confirmarContribuicao(id);
    if (!r.ok) { toast.error(r.erro ?? "Não foi possível confirmar."); return; }
    setContribuicoes(lista => (lista ?? []).map(c => (c.id === id ? { ...c, conferencia_nota: NOTA_DE_CONTRIBUICAO_CONFIRMADA } : c)));
    toast.success("Confirmada como contribuição. O aviso não aparece mais para ela.");
  }
  async function desfazerVinculo(id: string, pessoaId: string, tinhaFamilia: boolean) {
    const r = await servico.desvincular(id, pessoaId, tinhaFamilia);
    if (!r.ok) { toast.error(r.erro ?? "Não foi possível desfazer."); return; }
    marcarVinculo(id, null, null);
    toast.success("Vínculo desfeito");
    aposMudar();
  }
  async function triar(p: PendenteComSugestao, decisao: DecisaoDeTriagem) {
    setOcupado(p.contribuicao.id);
    try {
      const r = await servico.triar(p.contribuicao.id, decisao);
      if (!r.ok) { toast.error(r.erro ?? "Não foi possível classificar."); return; }
      setTriagem(t => new Map(t).set(p.contribuicao.id, { lancamento_id: p.contribuicao.id, decisao, motivo: null, por_nome: null, em: new Date().toISOString() }));
      aposMudar();
      toast.success(decisao === "anonimo" ? "Marcada como anônima" : "Ignorada", { action: { label: "Desfazer", onClick: () => desfazerTriagem(p.contribuicao.id) } });
    } finally { setOcupado(null); }
  }
  async function desfazerTriagem(id: string) {
    const r = await servico.triar(id, "desfeita");
    if (!r.ok) { toast.error(r.erro ?? "Não foi possível desfazer."); return; }
    setTriagem(t => { const n = new Map(t); n.delete(id); return n; });
    toast.success("Classificação desfeita");
    aposMudar();
  }

  if (contribuicoes === null) return <div className="flex items-center justify-center h-24 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando…</div>;
  if (erro) return <Card className="border-dashed"><CardContent className="py-6 text-center text-sm text-destructive-text" data-erro="pendentes">{erro}</CardContent></Card>;
  if (registro.estado === "erro") {
    return (
      <Card className="border-dashed" data-registro="erro"><CardContent className="py-6 text-center space-y-2">
        <p className="text-sm">Não foi possível registrar este acesso, então a fila com nomes não é mostrada.</p>
        <p className="text-xs text-muted-foreground">{registro.erro}</p>
        {/check|violates|23514/i.test(registro.erro) && <p className="text-xs text-warning-text" data-dica="migration">O banco ainda não conhece a ação "ver_pendentes": aplique a migration 20261027220000 e tente de novo.</p>}
        <Button size="sm" variant="outline" onClick={registro.tentarDeNovo}>Tentar de novo</Button>
      </CardContent></Card>
    );
  }
  if (!registro.liberado) return <div className="flex items-center justify-center h-24 text-sm text-muted-foreground" data-registro="aguardando"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Registrando o acesso…</div>;

  const aviso = textoDoRegistro(registro.estado);
  const visiveis = filtrados.slice(0, mostrar);
  const barra = Math.min(100, taxa?.taxaPct ?? 0);

  return (
    <div className="space-y-4" data-aba="pendentes">
      {aviso && <p className={`text-xs ${registro.estado === "indisponivel" ? "text-warning-text" : "text-muted-foreground"}`} data-registro={registro.estado}>{aviso}</p>}
      {triagemIndisponivel && (
        <p className="flex items-start gap-1.5 text-xs text-warning-text" data-aviso="triagem-indisponivel"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          A classificação como anônima ou ignorada ainda não está ativa no banco (migration pendente). Dá para vincular pessoa e família normalmente.</p>
      )}

      {/* ── o progresso ── */}
      {taxa && (
        <Card className="shadow-card-soft" data-card="taxa-de-identificacao">
          <CardHeader className="pb-2"><CardTitle className="font-serif text-base flex items-center gap-2"><Target className="w-4 h-4 text-gold" /> Identificação das contribuições</CardTitle>
            <p className="text-xs text-muted-foreground">Desde {dataBr(PISO_DE_IDENTIFICACAO)} · só &ldquo;tem pessoa&rdquo; conta como identificada; anônimas e ignoradas saem da fila, mas ficam à parte.</p></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-serif text-2xl font-semibold tabular-nums" data-taxa>{pct(taxa.taxaPct)}</p>
                <p className="text-xs text-muted-foreground" data-meta>Meta {META_DE_IDENTIFICACAO_PCT}% · {taxa.atingiuAMeta ? "meta atingida" : `faltam ${brl(taxa.valorParaAMeta)}`}</p>
              </div>
              <div className="relative mt-1.5 h-2.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={Math.round(barra)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-gold" style={{ width: `${barra}%` }} data-barra />
                <div className="absolute top-0 h-full w-0.5 bg-foreground/60" style={{ left: `${META_DE_IDENTIFICACAO_PCT}%` }} title={`Meta de ${META_DE_IDENTIFICACAO_PCT}%`} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-partes>
              {([["identificadas", "Identificadas", taxa.identificadas], ["anonimas", "Anônimas", taxa.anonimas], ["ignoradas", "Ignoradas", taxa.ignoradas], ["pendentes", "Pendentes", taxa.pendentes]] as const).map(([id, rotulo, p]) => (
                <div key={id} data-parte={id} className="rounded-md border bg-muted/20 px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
                  <p className="font-serif text-lg font-semibold tabular-nums" data-valor>{pct(p.pctValor)}</p>
                  <p className="text-xs text-muted-foreground">{p.quantidade} {p.quantidade === 1 ? "contribuição" : "contribuições"} · {brl(p.valor)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {paraConferir.length > 0 && (
        <Card className="border-warning/40 bg-warning/5" data-card="movimentacao-interna">
          <CardContent className="p-3.5 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="w-4 h-4 text-warning-text" />Possível movimentação interna — conferir ({paraConferir.length})</p>
            <p className="text-xs text-muted-foreground">Estas contribuições parecem dinheiro da própria igreja mudando de conta, não dízimo nem oferta. Nada foi alterado: se for movimentação interna, reclassifique o lançamento (ela não deve contar como contribuição).</p>
            <ul className="space-y-1" data-conferir>
              {paraConferir.map(({ c, motivo }) => (
                <li key={c.id} data-conferir-item={c.id} className="flex items-center justify-between gap-2 text-sm min-w-0">
                  <span className="min-w-0 truncate"><span className="text-muted-foreground">{dataBr(c.data)}</span> · {c.categoria ?? "—"} · {motivo}{c.pessoa_id ? " · com pessoa vinculada" : ""}</span>
                  <span className="flex shrink-0 items-center gap-2"><span className="font-semibold tabular-nums">{brl(c.valor)}</span>
                    {servico.confirmarContribuicao && <Button size="sm" variant="outline" className="h-7 text-xs" data-acao="confirmar-contribuicao" onClick={() => confirmarComoContribuicao(c.id)}>É contribuição — não avisar mais</Button>}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── a fila ── */}
      <div className="flex flex-wrap items-center gap-1.5" data-vistas>
        <button type="button" data-vista="pendentes" aria-pressed={vista === "pendentes"} onClick={() => setVista("pendentes")}
          className={`rounded-full border px-3 py-1 text-xs ${vista === "pendentes" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>Pendentes {todosPendentes.length}</button>
        <button type="button" data-vista="classificadas" aria-pressed={vista === "classificadas"} onClick={() => setVista("classificadas")}
          className={`rounded-full border px-3 py-1 text-xs ${vista === "classificadas" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>Classificadas {classificadas.length}</button>
      </div>

      {podeCadastrar && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-cadastro-avulso>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" data-acao="cadastrar-pessoa-avulso" onClick={() => setCadastro({ pendente: null, nome: "" })}><UserPlus className="w-3.5 h-3.5" /> Cadastrar pessoa</Button>
          <span>Quem contribuiu e ainda não está no cadastro (um visitante, por exemplo): cadastre aqui e a sugestão já passa a enxergá-la.</span>
        </div>
      )}

      {vista === "pendentes" ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5" data-dificuldades>
            {(["todas", "facil", "media", "dificil"] as const).map(d => (
              <button key={d} type="button" data-dificuldade={d} aria-pressed={dificuldade === d} onClick={() => { setDificuldade(d); setMostrar(POR_PAGINA); }}
                className={`rounded-full border px-3 py-1 text-xs ${dificuldade === d ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>
                {d === "todas" ? `Todas ${todosPendentes.length}` : `${ROTULO_DIFICULDADE[d]} ${contagem(d)}`}
              </button>
            ))}
            {origens.length > 1 && (
              <select value={origem} onChange={e => { setOrigem(e.target.value); setMostrar(POR_PAGINA); }} data-campo="origem" className="h-7 rounded-md border bg-background px-2 text-xs ml-auto">
                <option value="todas">Qualquer origem</option>
                {origens.map(o => (<option key={o} value={o}>{ROTULO_ORIGEM[o] ?? o}</option>))}
              </select>
            )}
          </div>
          <p className="text-xs text-muted-foreground" data-explicacao-dificuldade>
            Fácil: o nome do extrato casa com UMA pessoa do cadastro. Média: a sugestão pede confirmação. Difícil: sem nome no extrato ou sem pessoa única.
          </p>

          {filtrados.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2" data-vazio>
              <CheckCircle2 className="w-5 h-5 text-success-text" />{todosPendentes.length === 0 ? "Nenhuma contribuição pendente de identificação." : "Nenhuma pendente com esse filtro."}
            </CardContent></Card>
          ) : (
            <div className="space-y-1.5" data-fila>
              {visiveis.map(p => {
                const c = p.contribuicao, trabalhando = ocupado === c.id;
                return (
                  <div key={c.id} data-pendente={c.id} data-dificuldade-da-linha={p.dificuldade} className="border rounded-md px-3 py-2 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <p className="text-sm min-w-0 truncate"><span className="text-muted-foreground">{dataBr(c.data)}</span> · {c.categoria ?? "—"} · <span className="text-muted-foreground">{ROTULO_ORIGEM[c.origem ?? "manual"] ?? c.origem}</span></p>
                      <span className="text-sm font-semibold tabular-nums shrink-0">{brl(c.valor)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground break-words" data-remetente>
                      {p.remetente ? <>No extrato: <strong className="text-foreground">{p.remetente}</strong></> : "Sem nome no extrato"}
                      {p.sugestao && <> · <span data-sugestao>Sugestão: <strong className="text-foreground">{p.sugestao.nome}</strong> ({p.sugestao.nivel === "favorecido" ? "favorecido ligado à pessoa" : p.sugestao.confianca === "alta" ? "alta confiança" : "confirme"})</span></>}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.sugestao && <Button size="sm" className="h-7 gap-1 text-xs" disabled={trabalhando} data-acao="aceitar" onClick={() => vincular(p, { id: p.sugestao!.pessoaId, nome: p.sugestao!.nome }, null)}><UserCheck className="w-3.5 h-3.5" /> Aceitar sugestão</Button>}
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={trabalhando} data-acao="pessoa" onClick={() => setAlvo({ pendente: p, modo: "pessoa" })}><Search className="w-3.5 h-3.5" /> Vincular pessoa</Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={trabalhando} data-acao="familia" onClick={() => setAlvo({ pendente: p, modo: "familia" })}><Users className="w-3.5 h-3.5" /> Vincular família</Button>
                      {podeCadastrar && <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={trabalhando} data-acao="cadastrar-pessoa" onClick={() => setCadastro({ pendente: p, nome: nomeProprio(p.remetente) })}><UserPlus className="w-3.5 h-3.5" /> Cadastrar pessoa</Button>}
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={trabalhando || triagemIndisponivel} data-acao="anonimo" onClick={() => triar(p, "anonimo")}><UserX className="w-3.5 h-3.5" /> Anônimo</Button>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={trabalhando || triagemIndisponivel} data-acao="ignorar" onClick={() => triar(p, "ignorado")}><EyeOff className="w-3.5 h-3.5" /> Ignorar</Button>
                    </div>
                  </div>
                );
              })}
              {filtrados.length > visiveis.length && <Button variant="outline" size="sm" className="w-full" data-acao="mostrar-mais" onClick={() => setMostrar(m => m + POR_PAGINA)}>Mostrar mais ({filtrados.length - visiveis.length} restantes)</Button>}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-1.5" data-classificadas>
          {classificadas.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground" data-vazio>Nenhuma contribuição classificada como anônima ou ignorada.</CardContent></Card>
          ) : classificadas.map(c => {
            const t = triagem.get(c.id)!;
            return (
              <div key={c.id} data-classificada={c.id} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm truncate"><span className="text-muted-foreground">{dataBr(c.data)}</span> · {c.categoria ?? "—"} · {brl(c.valor)}</p>
                  <p className="text-xs text-muted-foreground">{t.decisao === "anonimo" ? "Anônima" : "Ignorada"}{t.por_nome ? ` por ${t.por_nome}` : ""}</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" data-acao="desfazer-classificacao" onClick={() => desfazerTriagem(c.id)}>Desfazer</Button>
              </div>
            );
          })}
        </div>
      )}

      {alvo && <DialogoDeVinculo alvo={alvo} servico={servico} aoFechar={() => setAlvo(null)} aoEscolher={async (pessoa, familiaId) => { const p = alvo.pendente; setAlvo(null); await vincular(p, pessoa, familiaId); }} />}

      {cadastro && podeCadastrar && (
        <Suspense fallback={null}>
          {/* o mesmo formulário de pessoa do resto do sistema, aberto como visitante e com o nome do extrato; ao salvar, a contribuição já é vinculada */}
          <MembroForm open onOpenChange={v => { if (!v) setCadastro(null); }} membro={null} tipoInicial="visitante" nomeInicial={cadastro.nome} onSaved={() => undefined} onCreated={aoCadastrarPessoa} />
        </Suspense>
      )}
    </div>
  );
}

/** Procura a pessoa (ou a família e, dentro dela, quem contribuiu) e devolve a escolha. */
function DialogoDeVinculo({ alvo, servico, aoFechar, aoEscolher }: { alvo: NonNullable<Alvo>; servico: ServicoDePendentes; aoFechar: () => void; aoEscolher: (p: PessoaParaVincular, familiaId: string | null) => void }) {
  const [termo, setTermo] = useState(alvo.pendente.remetente ?? "");
  const [pessoas, setPessoas] = useState<PessoaParaVincular[]>([]);
  const [familias, setFamilias] = useState<FamiliaParaVincular[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) { setPessoas([]); setFamilias([]); return; }
    let vivo = true; setBuscando(true);
    const h = setTimeout(() => {
      (alvo.modo === "pessoa" ? servico.buscarPessoas(t).then(r => { if (vivo) setPessoas(r); }) : servico.buscarFamilias(t).then(r => { if (vivo) setFamilias(r); }))
        .catch(() => { if (vivo) { setPessoas([]); setFamilias([]); } }).finally(() => { if (vivo) setBuscando(false); });
    }, 250);
    return () => { vivo = false; clearTimeout(h); };
  }, [termo, alvo.modo, servico]);

  return (
    <Dialog open onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-dialogo={alvo.modo}>
        <DialogHeader>
          <DialogTitle className="font-serif">{alvo.modo === "pessoa" ? "Vincular pessoa" : "Vincular família"}</DialogTitle>
          <DialogDescription>{brl(alvo.pendente.contribuicao.valor)} em {dataBr(alvo.pendente.contribuicao.data)}{alvo.pendente.remetente ? ` · no extrato: ${alvo.pendente.remetente}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-muted-foreground" />
            <Input autoFocus value={termo} onChange={e => setTermo(e.target.value)} placeholder={alvo.modo === "pessoa" ? "Nome da pessoa…" : "Nome da família…"} className="pl-8 text-base md:text-sm" data-campo="busca-vinculo" />
          </div>
          {buscando && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Buscando…</p>}
          {alvo.modo === "pessoa" ? (
            <div className="space-y-1" data-resultados>
              {pessoas.map(p => (<button key={p.id} type="button" data-escolha={p.id} onClick={() => aoEscolher(p, null)} className="w-full text-left rounded-md border px-3 py-2 text-sm hover:bg-muted/50">{p.nome}</button>))}
              {!buscando && termo.trim().length >= 2 && pessoas.length === 0 && <p className="text-xs text-muted-foreground">Ninguém encontrado com esse nome.</p>}
            </div>
          ) : (
            <div className="space-y-2" data-resultados>
              {familias.map(f => (
                <div key={f.id} className="rounded-md border p-2 space-y-1" data-familia={f.id}>
                  <p className="text-sm font-medium">Família {f.nome}</p>
                  <p className="text-xs text-muted-foreground">Escolha quem contribuiu:</p>
                  {f.membros.map(m => (<button key={m.id} type="button" data-escolha={m.id} onClick={() => aoEscolher({ id: m.id, nome: m.nome }, f.id)} className="w-full text-left rounded border px-2.5 py-1.5 text-sm hover:bg-muted/50">{m.nome}{m.responsavel ? " · responsável" : ""}</button>))}
                </div>
              ))}
              {!buscando && termo.trim().length >= 2 && familias.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma família encontrada.</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
