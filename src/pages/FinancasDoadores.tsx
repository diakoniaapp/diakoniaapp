// ─── FinancasDoadores.tsx — Doadores e dizimistas (evoluída em 27/10/2026) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// A tela já existia (12/09/2026: histórico de contribuição por pessoa, fechada a `ROLES_DOADORES` depois que ela respondeu "os tesoureiros e administrador podem ver tudo sobre as doações"). Em
// 27/10/2026 ela pediu para EVOLUIR esta tela — sem criar outra — com indicadores, gráficos, o bloco "Sem contribuição no período" e auditoria de quem vê os nomes. Três abas na mesma rota:
//   · Painel — só agregados (nenhum nome): indicadores, gráficos, destaques. É o que o e-mail ao pastor levará.
//   · Pessoas — a lista nominal de antes, sobre o período, com grupos. NOMINAL: exige o registro do acesso.
//   · Sem contribuição — quem não contribuiu no período (base: membros e congregados ativos). NOMINAL: exige o registro do acesso.
//   · Pendentes de identificação (Fase 3) — a fila das contribuições SEM pessoa: vincular pessoa/família, aceitar sugestão, anônimo, ignorar, desfazer; taxa em quatro partes e meta de 95%.
//     Independe dos filtros de período/base (olha tudo desde 01/01/2026) e, ao mudar algo, recarrega as contribuições para o painel refletir na hora.
// O PISO (decisão dela): toda análise começa em 01/01/2026 — antes disso só ~30–35% dos dízimos têm pessoa ligada. O período pedido é ajustado ao piso e a tela diz que foi.
// FILTROS GLOBAIS (Fase 2B, 27/10/2026): a BASE analisada (membros / membros e congregados / + visitantes ativos) e as CONTRIBUIÇÕES consideradas (dízimos, ofertas, missões) valem para as três abas; quem contribuiu
// fora da base não entra nos indicadores e aparece à parte ("fora da base"). O card "Saúde da base" fica fixo no painel. A lista de Pessoas ordena por TOTAL (maior para menor) por padrão e tem "Top N"
// — decisão dela, só aqui dentro, com registro de acesso e nunca por e-mail (antes era por nome: "não virar ranking", nota de 12/09).
// O que mora na URL: aba, período, filtros — abrir uma pessoa e voltar devolve a tela como estava (`useEstadoNaUrl`). Links antigos com `?ano=&mes=` continuam funcionando.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEstadoNaUrl } from "@/hooks/useEstadoNaUrl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileSpreadsheet, Info, Mail, RefreshCw, Users } from "lucide-react";
import { PaginaSkeleton } from "@/components/ListState";
import { hojeLocal } from "@/lib/data";
import { gerarXlsx } from "@/lib/xlsxSimples";
import {
  BASES_ANALISADAS, CATEGORIAS_DE_CONTRIBUICAO, DIAS_NO_MES_MEDIO, FILTROS_PADRAO, PISO_DE_IDENTIFICACAO, PRESETS_DE_PERIODO, ROTULO_DA_BASE, VERSAO_DOS_CRITERIOS, VINCULOS_DA_BASE,
  ajustarAoPiso, analisarContribuicoes, analisarSemContribuicao, aplicarFiltros, diasEntre, idsDaBase, intervaloDoPreset, linhasDoCabecalho, resumirBase, resumirPessoas,
  type BaseAnalisada, type LinhaDeContribuicao, type PessoaDaBase, type PresetDePeriodo, type TipoDeContribuicao,
} from "@/lib/contribuicoes";
import { carregarBaseDePessoas, carregarContribuicoes, carregarNomes, registrarAcessoNominal, type AcaoDoRegistro } from "@/services/contribuicoesService";
import { downloadCSV } from "@/services/finService";
import { PainelDeContribuicoes } from "@/components/contribuicoes/PainelDeContribuicoes";
import { ListaDePessoas, ordemDaUrl, topDaUrl, type GrupoDePessoas, type PessoaDaLista } from "@/components/contribuicoes/ListaDePessoas";
import { SemContribuicao, type FiltrosDosSem } from "@/components/contribuicoes/SemContribuicao";
import { PendentesDeIdentificacao } from "@/components/contribuicoes/PendentesDeIdentificacao";
import { useRegistroDeAcesso } from "@/components/contribuicoes/useRegistroDeAcesso";
import { abaDePessoas, abasDoPainel, abasDosSemContribuicao, paraCSV, textoDoPeriodo } from "@/components/contribuicoes/exportacoes";

type Aba = "painel" | "pessoas" | "sem" | "pendentes";
const ABAS: { id: Aba; rotulo: string }[] = [{ id: "painel", rotulo: "Painel" }, { id: "pessoas", rotulo: "Pessoas" }, { id: "sem", rotulo: "Sem contribuição" }, { id: "pendentes", rotulo: "Pendentes de identificação" }];
const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const ultimoDia = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;

const PADRAO = {
  aba: "painel", p: "6m", de: "", ate: "", q: "", ordem: "total_desc", top: "todos", grupo: "todos",
  base: "membros_congregados", cats: "dizimo,oferta,missoes",
  menores: "", tipo: "todos", classe: "todos", faixa: "", familia: "",
  ano: "", mes: "",   // só os links antigos (?ano=2026&mes=3)
};

export default function FinancasDoadores() {
  const hoje = hojeLocal();
  const { hasRole } = useAuth();
  const podeEnviar = hasRole(["admin", "diakonia"]);   // a Central de Comunicação é só deles
  const [url, mudar] = useEstadoNaUrl(PADRAO);
  const aba: Aba = ABAS.some(a => a.id === url.aba) ? (url.aba as Aba) : "painel";

  // ── o período pedido (atalho, personalizado ou link antigo) e o período EFETIVO (ajustado ao piso) ──
  const pedido = useMemo(() => {
    if (url.ano && /^\d{4}$/.test(url.ano)) {
      const ano = Number(url.ano), mes = /^\d{1,2}$/.test(url.mes) ? Number(url.mes) : 0;
      return mes >= 1 && mes <= 12 ? { ini: `${ano}-${String(mes).padStart(2, "0")}-01`, fim: ultimoDia(ano, mes) } : { ini: `${ano}-01-01`, fim: `${ano}-12-31` };
    }
    if (url.p === "personalizado") return { ini: /^\d{4}-\d{2}-\d{2}$/.test(url.de) ? url.de : PISO_DE_IDENTIFICACAO, fim: /^\d{4}-\d{2}-\d{2}$/.test(url.ate) ? url.ate : hoje };
    const id = PRESETS_DE_PERIODO.some(x => x.id === url.p && x.id !== "personalizado") ? (url.p as Exclude<PresetDePeriodo, "personalizado">) : "6m";
    return intervaloDoPreset(id, hoje);
  }, [url.ano, url.mes, url.p, url.de, url.ate, hoje]);
  const periodo = useMemo(() => ajustarAoPiso(pedido.ini, pedido.fim), [pedido]);
  const presetAtivo = url.ano ? "personalizado" : PRESETS_DE_PERIODO.some(x => x.id === url.p) ? url.p : "6m";

  // ── os filtros globais: a base analisada e as contribuições consideradas ──
  const baseEscolhida: BaseAnalisada = (BASES_ANALISADAS as string[]).includes(url.base) ? (url.base as BaseAnalisada) : FILTROS_PADRAO.base;
  const categoriasEscolhidas = useMemo<TipoDeContribuicao[]>(() => {
    const pedidas = url.cats.split(",");
    const ok = CATEGORIAS_DE_CONTRIBUICAO.map(c => c.id).filter(id => pedidas.includes(id));
    return ok.length > 0 ? ok : FILTROS_PADRAO.categorias;   // lixo na URL volta ao padrão; "nenhuma" não existe (a caixa da última categoria não desmarca)
  }, [url.cats]);
  const alternarCategoria = (id: TipoDeContribuicao) => {
    const atual = categoriasEscolhidas.includes(id) ? categoriasEscolhidas.filter(c => c !== id) : [...categoriasEscolhidas, id];
    if (atual.length === 0) return;   // ao menos uma categoria
    mudar({ cats: CATEGORIAS_DE_CONTRIBUICAO.map(c => c.id).filter(c => atual.includes(c)).join(",") });
  };

  // ── os dados ──
  const [linhasBrutas, setLinhas] = useState<LinhaDeContribuicao[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setLinhas(await carregarContribuicoes(hoje)); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao carregar as contribuições"); } finally { setCarregando(false); }
  }, [hoje]);
  useEffect(() => { carregar(); }, [carregar]);

  // a base de pessoas (membros, congregados e visitantes ativos): é ela que diz quem está "dentro" da base escolhida
  const [pessoasDaBase, setPessoasDaBase] = useState<PessoaDaBase[] | null>(null);
  const [baseFalhou, setBaseFalhou] = useState(false);
  useEffect(() => {
    if (pessoasDaBase || baseFalhou) return;
    carregarBaseDePessoas().then(setPessoasDaBase).catch(e => { setBaseFalhou(true); toast.error(e instanceof Error ? e.message : "Erro ao carregar os membros"); });
  }, [pessoasDaBase, baseFalhou]);
  const idsBase = useMemo(() => (pessoasDaBase ? idsDaBase(pessoasDaBase, baseEscolhida) : null), [pessoasDaBase, baseEscolhida]);
  const pronto = !!linhasBrutas && (!!pessoasDaBase || baseFalhou);
  const filtrado = useMemo(
    () => (linhasBrutas ? aplicarFiltros(linhasBrutas, { base: baseEscolhida, categorias: categoriasEscolhidas }, idsBase, periodo) : null),
    [linhasBrutas, baseEscolhida, categoriasEscolhidas, idsBase, periodo],
  );
  const linhas = pronto && filtrado ? filtrado.linhas : null;
  const foraDaBase = filtrado?.foraDaBase ?? { pessoas: 0, valor: 0 };

  const analise = useMemo(() => (linhas && !periodo.vazio ? analisarContribuicoes(linhas, periodo) : null), [linhas, periodo]);
  // a análise da base (quem contribuiu e quem não): alimenta o card "Saúde da base" e a aba Sem contribuição
  const semAnalise = useMemo(
    () => (linhas && pessoasDaBase && !periodo.vazio
      ? analisarSemContribuicao(linhas, pessoasDaBase, periodo, { considerar: "qualquer", incluirMenores: url.menores === "1", vinculos: VINCULOS_DA_BASE[baseEscolhida] })
      : null),
    [linhas, pessoasDaBase, periodo, url.menores, baseEscolhida],
  );
  const saude = useMemo(() => (semAnalise ? resumirBase(semAnalise) : null), [semAnalise]);
  const recorteDosFiltros = { base: baseEscolhida, categorias: categoriasEscolhidas };
  // o cabeçalho de rastreabilidade (o mesmo do e-mail): período, base, contribuições, pessoas consideradas, quando e versão
  const cabecalho = useMemo(() => {
    if (periodo.vazio) return [];
    const agora = new Date();
    return linhasDoCabecalho({
      periodo: { ini: periodo.ini, fim: periodo.fim }, base: baseEscolhida, categorias: categoriasEscolhidas, pessoasNaBase: semAnalise ? semAnalise.base : null,
      contribuiram: semAnalise ? semAnalise.contribuiram : null, foraDaBase: foraDaBase.pessoas, geradoEm: agora.toISOString(), geradoPor: null, versao: VERSAO_DOS_CRITERIOS,
    }, agora.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }));
  }, [periodo, baseEscolhida, categoriasEscolhidas, semAnalise, foraDaBase.pessoas]);

  // ── Pessoas ──
  const resumos = useMemo(() => (linhas && !periodo.vazio ? resumirPessoas(linhas, periodo) : []), [linhas, periodo]);
  const nomes = useRef(new Map<string, string>());
  const [nomesProntos, setNomesProntos] = useState(0);   // muda quando chegam nomes novos
  useEffect(() => {
    if (aba !== "pessoas") return;
    const faltam = resumos.map(r => r.pessoaId).filter(id => !nomes.current.has(id));
    if (faltam.length === 0) { setNomesProntos(n => n + 1); return; }
    let vivo = true;
    carregarNomes(faltam).then(m => { if (!vivo) return; m.forEach((v, k) => nomes.current.set(k, v)); setNomesProntos(n => n + 1); }).catch(e => toast.error(e instanceof Error ? e.message : "Erro ao carregar os nomes"));
    return () => { vivo = false; };
  }, [aba, resumos]);
  const mesesDoPeriodo = Math.max(1, (diasEntre(periodo.ini, periodo.fim) + 1) / DIAS_NO_MES_MEDIO);
  const pessoasDaLista = useMemo<PessoaDaLista[]>(() => resumos.map(r => ({
    ...r, nome: nomes.current.get(r.pessoaId) ?? "—",
    mediaMensal: Math.round((r.total / mesesDoPeriodo) * 100) / 100, valorMedio: r.quantidade > 0 ? Math.round((r.total / r.quantidade) * 100) / 100 : 0,
    diasSemContribuir: diasEntre(r.ultima, periodo.fim),
  })), [resumos, nomesProntos, mesesDoPeriodo, periodo.fim]);   // eslint-disable-line react-hooks/exhaustive-deps
  const nomesCompletos = aba === "pessoas" && resumos.every(r => nomes.current.has(r.pessoaId));
  const registroPessoas = useRegistroDeAcesso("ver_pessoas", { ini: periodo.ini, fim: periodo.fim, ...recorteDosFiltros }, resumos.length, aba === "pessoas" && !!linhas && nomesCompletos);

  // ── Sem contribuição ──
  const filtrosSem: FiltrosDosSem = {
    considerar: "qualquer", incluirMenores: url.menores === "1",
    tipo: url.tipo === "membro" || url.tipo === "congregado" || url.tipo === "visitante" ? url.tipo : "todos", classe: url.classe === "nunca" || url.classe === "antes" ? url.classe : "todos",
    faixa: (["ate30", "de31a60", "de61a90", "de91a180", "mais180"] as const).find(f => f === url.faixa) ?? "", semFamilia: url.familia === "1",
  };
  const registroSem = useRegistroDeAcesso("ver_nao_contribuiram", { ini: periodo.ini, fim: periodo.fim, ...recorteDosFiltros, menores: filtrosSem.incluirMenores }, semAnalise?.naoContribuiram ?? null, aba === "sem" && !!semAnalise);

  // ── exportar: nominal só depois de gravar o registro ──
  const [exportando, setExportando] = useState(false);
  async function registrarOuAvisar(acao: AcaoDoRegistro, recorte: Record<string, unknown>, total: number): Promise<boolean> {
    const r = await registrarAcessoNominal(acao, recorte, total);
    if (r.ok || r.indisponivel) return true;
    toast.error(`Não foi possível registrar a exportação, então o arquivo não foi gerado. ${r.erro}`);
    return false;
  }
  const nomeDoArquivo = (base: string, ext: string) => `${base}_${periodo.ini}_a_${periodo.fim}.${ext}`;

  async function exportarPainel() {
    if (!analise) return;
    setExportando(true);
    try { saveAs(await gerarXlsx(abasDoPainel(analise, "", hoje, cabecalho)), nomeDoArquivo("contribuicoes_resumo", "xlsx")); toast.success("Excel exportado"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível gerar o Excel."); }
    finally { setExportando(false); }
  }
  async function exportarPessoas(formato: "xlsx" | "csv", visiveis: PessoaDaLista[]) {
    setExportando(true);
    try {
      if (!(await registrarOuAvisar("exportar_pessoas", { ini: periodo.ini, fim: periodo.fim, ...recorteDosFiltros, ordem: ordemDaUrl(url.ordem), top: topDaUrl(url.top), formato }, visiveis.length))) return;
      const linhasP = visiveis.map((p, i) => ({ posicao: i + 1, nome: p.nome, quantidade: p.quantidade, ultima: p.ultima, total: p.total, mediaMensal: p.mediaMensal, valorMedio: p.valorMedio, dizimista: p.dizimista, recorrente: p.recorrente, nova: p.nova }));
      if (formato === "xlsx") saveAs(await gerarXlsx([abaDePessoas(linhasP, periodo)]), nomeDoArquivo("contribuicoes_pessoas", "xlsx"));
      else downloadCSV(nomeDoArquivo("contribuicoes_pessoas", "csv"), paraCSV([["#", "Nome", "Contribuições", "Última", "Total", "Média mensal", "Valor médio", "Dizimista", "Recorrente", "Novo"], ...linhasP.map(p => [p.posicao, p.nome, p.quantidade, dataBr(p.ultima), p.total, p.mediaMensal, p.valorMedio, p.dizimista ? "Sim" : "Não", p.recorrente === null ? "—" : p.recorrente ? "Sim" : "Não", p.nova === null ? "—" : p.nova ? "Sim" : "Não"])]));
      toast.success("Arquivo exportado");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível gerar o arquivo."); } finally { setExportando(false); }
  }
  async function exportarSem(formato: "xlsx" | "csv", visiveis: import("@/lib/contribuicoes").PessoaSemContribuicao[]) {
    if (!semAnalise) return;
    setExportando(true);
    try {
      if (!(await registrarOuAvisar("exportar_nao_contribuiram", { ini: periodo.ini, fim: periodo.fim, ...recorteDosFiltros, menores: filtrosSem.incluirMenores, formato }, visiveis.length))) return;
      const quemEntra = `${ROTULO_DA_BASE[baseEscolhida]} (ativos); ${categoriasEscolhidas.length === 3 ? "dízimos, ofertas e missões" : categoriasEscolhidas.join(", ")}`;
      if (formato === "xlsx") saveAs(await gerarXlsx(abasDosSemContribuicao({ ...semAnalise, lista: visiveis }, periodo, quemEntra)), nomeDoArquivo("sem_contribuicao", "xlsx"));
      else downloadCSV(nomeDoArquivo("sem_contribuicao", "csv"), paraCSV([["Nome", "Tipo", "Situação", "Última contribuição", "Dias", "Família contribuiu", "Menor de 18", "Sem nascimento"], ...visiveis.map(p => [p.nome, p.tipo === "membro" ? "Membro" : "Congregado", p.classificacao === "nunca" ? "Sem registro anterior ao período" : "Contribuiu antes do período", p.ultima ? dataBr(p.ultima) : "", p.dias, p.familiaContribui ? "Sim" : "Não", p.menor ? "Sim" : "Não", p.semNascimento ? "Sim" : "Não"])]));
      toast.success("Arquivo exportado");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível gerar o arquivo."); } finally { setExportando(false); }
  }

  if ((carregando && !linhasBrutas) || (!!linhasBrutas && !pronto)) return <PaginaSkeleton />;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2"><Users className="w-5 h-5 text-gold" /> Doadores</h1>
          <p className="text-xs text-muted-foreground">Contribuições por período, dizimistas e quem ainda não contribuiu — visível só para tesouraria e administração.</p>
        </div>
        <Button size="sm" variant="outline" onClick={carregar} disabled={carregando} className="gap-1.5 shrink-0"><RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar</Button>
        {aba === "painel" && podeEnviar && !periodo.vazio && (
          <Button asChild size="sm" variant="outline" className="gap-1.5 shrink-0" data-acao="enviar-relatorio">
            <Link to={`/comunicacao?aba=relatorios&enviar=doadores&de=${periodo.ini}&ate=${periodo.fim}`}><Mail className="w-3.5 h-3.5" /> Enviar relatório</Link>
          </Button>
        )}
        {aba === "painel" && <Button size="sm" variant="outline" onClick={exportarPainel} disabled={exportando || !analise} className="gap-1.5 shrink-0"><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</Button>}
      </div>

      {/* ── o período ── */}
      <Card><CardContent className="py-2.5 px-3 space-y-2" data-periodo>
        <div className="flex flex-wrap gap-1.5" data-presets>
          {PRESETS_DE_PERIODO.map(p => (
            <button key={p.id} type="button" data-preset={p.id} aria-pressed={presetAtivo === p.id}
              onClick={() => mudar({ p: p.id, ano: "", mes: "", de: p.id === "personalizado" ? periodo.ini : "", ate: p.id === "personalizado" ? periodo.fim : "" })}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${presetAtivo === p.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>{p.rotulo}</button>
          ))}
        </div>
        {presetAtivo === "personalizado" && (
          <div className="flex flex-wrap items-center gap-2 text-xs" data-personalizado>
            <label className="flex items-center gap-1.5">De <Input type="date" value={url.de || periodo.ini} min={PISO_DE_IDENTIFICACAO} max={hoje} onChange={e => mudar({ p: "personalizado", ano: "", mes: "", de: e.target.value })} className="h-8 w-[9.5rem] text-xs" /></label>
            <label className="flex items-center gap-1.5">até <Input type="date" value={url.ate || periodo.fim} min={PISO_DE_IDENTIFICACAO} max={hoje} onChange={e => mudar({ p: "personalizado", ano: "", mes: "", ate: e.target.value })} className="h-8 w-[9.5rem] text-xs" /></label>
          </div>
        )}
        <p className="text-xs text-muted-foreground" data-periodo-efetivo>Período analisado: <strong>{textoDoPeriodo(periodo.ini, periodo.fim)}</strong></p>
        {periodo.ajustado && (
          <p className="flex items-start gap-1.5 text-xs text-warning-text" data-aviso="piso"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            O período pedido começa antes de {dataBr(PISO_DE_IDENTIFICACAO)}. Antes dessa data só cerca de um terço dos dízimos tem a pessoa identificada, então a análise começa em {dataBr(PISO_DE_IDENTIFICACAO)}.</p>
        )}
      </CardContent></Card>

      {/* ── a base e as contribuições consideradas (valem para as três abas) ── */}
      <Card><CardContent className="py-2.5 px-3 space-y-2" data-filtros-globais>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" data-bases>
          <span className="text-muted-foreground">Base</span>
          {BASES_ANALISADAS.map(b => (
            <label key={b} className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="base-da-tela" checked={baseEscolhida === b} onChange={() => mudar({ base: b })} data-base={b} /> {ROTULO_DA_BASE[b]}</label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" data-categorias>
          <span className="text-muted-foreground">Contribuições</span>
          {CATEGORIAS_DE_CONTRIBUICAO.map(c => (
            <label key={c.id} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={categoriasEscolhidas.includes(c.id)} onChange={() => alternarCategoria(c.id)} data-categoria={c.id} /> {c.rotulo}</label>
          ))}
        </div>
        {baseFalhou && <p className="text-xs text-warning-text" data-aviso="base-falhou">Não foi possível carregar a base de pessoas: o filtro de base não foi aplicado.</p>}
        {!periodo.vazio && cabecalho.length > 0 && (
          <dl className="grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2" data-criterios>
            {cabecalho.filter(c => ["Base analisada", "Contribuições consideradas", "Pessoas consideradas", "Versão dos critérios"].includes(c.rotulo)).map(c => (
              <div key={c.rotulo} className="flex gap-1.5"><dt className="shrink-0">{c.rotulo}:</dt><dd className="text-foreground">{c.valor}</dd></div>
            ))}
          </dl>
        )}
      </CardContent></Card>

      {periodo.vazio ? (
        <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground" data-vazio-piso>Este período termina antes de {dataBr(PISO_DE_IDENTIFICACAO)}, início da análise. Escolha um período a partir dessa data.</CardContent></Card>
      ) : (
        <Tabs value={aba} onValueChange={v => mudar({ aba: v })}>
          <TabsList className="w-full justify-start overflow-x-auto" data-abas="doadores">
            {ABAS.map(a => (<TabsTrigger key={a.id} value={a.id}>{a.rotulo}</TabsTrigger>))}
          </TabsList>
          <TabsContent value="painel" className="mt-4">{analise && <PainelDeContribuicoes analise={analise} saude={saude} rotuloDaBase={ROTULO_DA_BASE[baseEscolhida]} foraDaBase={foraDaBase} aoVerPendencias={() => mudar({ aba: "pendentes" })} />}</TabsContent>
          <TabsContent value="pessoas" className="mt-4">
            <ListaDePessoas pessoas={pessoasDaLista} grupo={(["dizimistas", "recorrentes", "novos", "novosDizimistas"].includes(url.grupo) ? url.grupo : "todos") as GrupoDePessoas}
              aoMudarGrupo={g => mudar({ grupo: g })} busca={url.q} aoMudarBusca={v => mudar({ q: v })} ordem={ordemDaUrl(url.ordem)} aoMudarOrdem={o => mudar({ ordem: o })} top={topDaUrl(url.top)} aoMudarTop={t => mudar({ top: t })}
              registro={registroPessoas} aoExportar={exportarPessoas} exportando={exportando}
              novosDisponivel={resumos.some(r => r.nova !== null)} recorrentesDisponivel={resumos.some(r => r.recorrente !== null)} />
          </TabsContent>
          <TabsContent value="pendentes" className="mt-4"><PendentesDeIdentificacao aoMudar={carregar} /></TabsContent>
          <TabsContent value="sem" className="mt-4">
            {!semAnalise ? <PaginaSkeleton linhas={3} comCabecalho={false} /> : (
              <SemContribuicao analise={semAnalise} filtros={filtrosSem}
                aoMudarFiltros={p => mudar({
                  ...(p.incluirMenores !== undefined && { menores: p.incluirMenores ? "1" : "" }),
                  ...(p.tipo !== undefined && { tipo: p.tipo }), ...(p.classe !== undefined && { classe: p.classe }), ...(p.faixa !== undefined && { faixa: p.faixa }), ...(p.semFamilia !== undefined && { familia: p.semFamilia ? "1" : "" }),
                })}
                registro={registroSem} aoExportar={exportarSem} exportando={exportando} coberturaDoPeriodo={analise?.cobertura.pctDoValor ?? null} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
