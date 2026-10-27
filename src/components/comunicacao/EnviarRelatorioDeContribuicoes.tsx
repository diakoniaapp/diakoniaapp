// ─── EnviarRelatorioDeContribuicoes — a gaveta "Enviar por e-mail" do relatório de Doadores e dizimistas (27/10/2026) ────────────────────────────────────────────────────────────────────────
// Escolher o período → destinatários → VISUALIZAR (obrigatório) → enviar. O botão Enviar só habilita depois de abrir a prévia DO MESMO período (mudou o período, a prévia perde a validade). O e-mail leva
// só números agregados — nenhum nome —, e a tela diz isso antes de enviar. Os números são calculados pela Edge Function, não por esta tela.
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, Loader2, Send, X } from "lucide-react";
import { hojeLocal } from "@/lib/data";
import { BASES_ANALISADAS, CATEGORIAS_DE_CONTRIBUICAO, FILTROS_PADRAO, PISO_DE_IDENTIFICACAO, PRESETS_DE_PERIODO, ROTULO_DA_BASE, ajustarAoPiso, intervaloDoPreset, rotuloDasCategorias, type BaseAnalisada, type PresetDePeriodo, type TipoDeContribuicao } from "@/lib/contribuicoes";
import { emailDeRespostaValido } from "@/lib/comunicacao";
import { BLOCOS_DE_CONTRIBUICOES, IDS_DOS_BLOCOS, IDS_NOMINAIS, MODELOS_DE_RELATORIO, ORDENACAO_PADRAO, ORDENACOES_DAS_LISTAS, type OrdenacaoDasListas, blocosDoModelo, modeloDaSelecao, modeloPadrao, temBlocoNominal, type IdDoBloco, type IdDoModelo } from "@/lib/contribuicoesBlocos";
import {
  enviarRelatorioDeContribuicoes, enviarTesteDoRelatorioDeContribuicoes, previaDoRelatorioDeContribuicoes,
  type FiltrosDoRelatorio, type PeriodoDoRelatorio, type PreviaDoRelatorio, type ResultadoDoEnvio,
} from "@/services/comunicacaoService";

export const MAXIMO_DE_DESTINATARIOS = 10;
export interface ServicoDoEnvio {
  previa: (p: PeriodoDoRelatorio, blocos: string[], filtros: FiltrosDoRelatorio) => Promise<PreviaDoRelatorio>;
  teste: (p: PeriodoDoRelatorio, blocos: string[], filtros: FiltrosDoRelatorio) => Promise<{ enviadoPara: string }>;
  enviar: (p: PeriodoDoRelatorio, blocos: string[], filtros: FiltrosDoRelatorio, destinatarios: string[]) => Promise<ResultadoDoEnvio>;
}
const SERVICO_REAL: ServicoDoEnvio = { previa: previaDoRelatorioDeContribuicoes, teste: enviarTesteDoRelatorioDeContribuicoes, enviar: enviarRelatorioDeContribuicoes };
const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

interface Props {
  aberto: boolean; aoFechar: () => void; aoEnviar?: () => void;
  /** o período com que a gaveta abre (vindo da tela Doadores); sem ele, os últimos 6 meses */
  periodoInicial?: { ini: string; fim: string } | null;
  servico?: ServicoDoEnvio;
}

export function EnviarRelatorioDeContribuicoes({ aberto, aoFechar, aoEnviar, periodoInicial, servico = SERVICO_REAL }: Props) {
  const hoje = hojeLocal();
  const [preset, setPreset] = useState<PresetDePeriodo>(periodoInicial ? "personalizado" : "6m");
  const [de, setDe] = useState(periodoInicial?.ini ?? PISO_DE_IDENTIFICACAO);
  const [ate, setAte] = useState(periodoInicial?.fim ?? hoje);
  const [blocos, setBlocos] = useState<IdDoBloco[]>(() => blocosDoModelo(modeloPadrao));
  const [base, setBase] = useState<BaseAnalisada>(FILTROS_PADRAO.base);
  const [categorias, setCategorias] = useState<TipoDeContribuicao[]>(FILTROS_PADRAO.categorias);
  const [ordenacao, setOrdenacao] = useState<OrdenacaoDasListas>(ORDENACAO_PADRAO);   // o padrão do modelo Pastor: quantidade de contribuições, maior para menor
  const [destinatarios, setDestinatarios] = useState<string[]>([]);
  const [campo, setCampo] = useState("");
  const [erroDoCampo, setErroDoCampo] = useState("");
  const [previa, setPrevia] = useState<{ chave: string; dados: PreviaDoRelatorio } | null>(null);
  const [ocupado, setOcupado] = useState<"" | "previa" | "teste" | "enviar">("");
  const [confirmando, setConfirmando] = useState(false);

  const pedido = useMemo(() => {
    const bruto = preset === "personalizado" ? { ini: de, fim: ate } : intervaloDoPreset(preset, hoje);
    const p = ajustarAoPiso(bruto.ini, bruto.fim > hoje ? hoje : bruto.fim);
    return { ini: p.ini, fim: p.fim, ajustado: p.ajustado, vazio: p.vazio || !/^\d{4}-\d{2}-\d{2}$/.test(p.ini) || !/^\d{4}-\d{2}-\d{2}$/.test(p.fim) };
  }, [preset, de, ate, hoje]);
  const chave = `${pedido.ini}|${pedido.fim}|${[...blocos].sort().join("+")}|${base}|${[...categorias].sort().join("+")}|${ordenacao}`;   // período, blocos, base E contribuições: mudou qualquer um, a prévia perde a validade
  const modeloAtual = modeloDaSelecao(blocos);
  const comNomes = temBlocoNominal(blocos);
  const previaValida = previa?.chave === chave;

  /** os blocos na ordem canônica (a mesma que o servidor usa) */
  const ordenados = IDS_DOS_BLOCOS.filter(id => blocos.includes(id));
  const filtros: FiltrosDoRelatorio = { base, categorias: CATEGORIAS_DE_CONTRIBUICAO.map(c => c.id).filter(id => categorias.includes(id)), ordenacao };
  const alternarCategoria = (id: TipoDeContribuicao) => setCategorias(atual => (atual.includes(id) ? atual.filter(c => c !== id) : [...atual, id]));
  const semCategoria = categorias.length === 0;
  const alternar = (id: IdDoBloco) => setBlocos(atual => (atual.includes(id) ? atual.filter(b => b !== id) : [...atual, id]));
  const escolherModelo = (id: IdDoModelo) => setBlocos(blocosDoModelo(id));

  function adicionar(texto: string) {
    const partes = texto.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    if (partes.length === 0) return;
    const novos = [...destinatarios];
    for (const p of partes) {
      const e = emailDeRespostaValido(p);
      if (!e) { setErroDoCampo(`“${p}” não parece um e-mail.`); return; }
      if (!novos.includes(e.toLowerCase())) novos.push(e.toLowerCase());
    }
    if (novos.length > MAXIMO_DE_DESTINATARIOS) { setErroDoCampo(`No máximo ${MAXIMO_DE_DESTINATARIOS} destinatários.`); return; }
    setDestinatarios(novos); setCampo(""); setErroDoCampo("");
  }

  async function visualizar() {
    setOcupado("previa");
    try { setPrevia({ chave, dados: await servico.previa({ ini: pedido.ini, fim: pedido.fim }, ordenados, filtros) }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível montar a prévia."); }
    finally { setOcupado(""); }
  }
  async function testar() {
    setOcupado("teste");
    try { const r = await servico.teste({ ini: pedido.ini, fim: pedido.fim }, ordenados, filtros); toast.success(`Teste enviado para ${r.enviadoPara}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível enviar o teste."); }
    finally { setOcupado(""); }
  }
  async function enviar() {
    setConfirmando(false); setOcupado("enviar");
    try {
      const r = await servico.enviar({ ini: pedido.ini, fim: pedido.fim }, ordenados, filtros, destinatarios);
      if (r.motivo === "enviado_ha_pouco") { toast.info("Este mesmo relatório já foi enviado há menos de 10 minutos. Nada foi enviado de novo."); return; }
      if (r.falharam > 0) toast.warning(`Enviado para ${r.enviados}; falhou para ${r.falharam}. Veja o Histórico.`); else toast.success(`Relatório enviado para ${r.enviados} ${r.enviados === 1 ? "destinatário" : "destinatários"}`);
      if (!r.historicoGravado) toast.warning("O envio saiu, mas o histórico não foi gravado (migration pendente).");
      aoEnviar?.(); aoFechar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível enviar o relatório."); }
    finally { setOcupado(""); }
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={v => { if (!v && !ocupado) aoFechar(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-gaveta="relatorio-contribuicoes">
          <DialogHeader>
            <DialogTitle className="font-serif">Enviar o relatório de contribuições por e-mail</DialogTitle>
            <DialogDescription>Escolha o modelo e os blocos. Valor individual, telefone e e-mail nunca vão por e-mail; nomes só nos blocos marcados com ⚠.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Período</Label>
              <div className="flex flex-wrap gap-1.5" data-presets>
                {PRESETS_DE_PERIODO.map(p => (
                  <button key={p.id} type="button" data-preset={p.id} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${preset === p.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>{p.rotulo}</button>
                ))}
              </div>
              {preset === "personalizado" && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5">De <Input type="date" value={de} min={PISO_DE_IDENTIFICACAO} max={hoje} onChange={e => setDe(e.target.value)} className="h-8 w-[9.5rem] text-xs" data-campo="de" /></label>
                  <label className="flex items-center gap-1.5">até <Input type="date" value={ate} min={PISO_DE_IDENTIFICACAO} max={hoje} onChange={e => setAte(e.target.value)} className="h-8 w-[9.5rem] text-xs" data-campo="ate" /></label>
                </div>
              )}
              {pedido.vazio
                ? <p className="text-xs text-warning-text" data-aviso="periodo-invalido">Escolha um período a partir de {dataBr(PISO_DE_IDENTIFICACAO)}.</p>
                : <p className="text-xs text-muted-foreground" data-periodo>Período do relatório: <strong>{dataBr(pedido.ini)} a {dataBr(pedido.fim)}</strong>{pedido.ajustado ? ` (ajustado: a análise começa em ${dataBr(PISO_DE_IDENTIFICACAO)})` : ""}</p>}
            </div>

            <div className="space-y-2" data-secao="filtros">
              <Label className="text-xs">Base analisada</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1" data-bases>
                {BASES_ANALISADAS.map(b => (
                  <label key={b} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" name="base-analisada" checked={base === b} onChange={() => setBase(b)} data-base={b} /> {ROTULO_DA_BASE[b]}
                  </label>
                ))}
              </div>
              <Label className="text-xs">Contribuições consideradas</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-1" data-categorias>
                {CATEGORIAS_DE_CONTRIBUICAO.map(c => (
                  <label key={c.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={categorias.includes(c.id)} onChange={() => alternarCategoria(c.id)} data-categoria={c.id} /> {c.rotulo}
                  </label>
                ))}
              </div>
              {semCategoria && <p className="text-xs text-warning-text" data-aviso="sem-categoria">Escolha ao menos uma categoria de contribuição.</p>}
              <p className="text-xs text-muted-foreground" data-resumo-criterios>Critérios: {ROTULO_DA_BASE[base]} (ativos) · {semCategoria ? "nenhuma categoria" : rotuloDasCategorias(categorias)}. Quem contribuiu e está fora da base aparece à parte e não entra nos indicadores.</p>
            </div>

            <div className="space-y-2" data-secao="conteudo">
              <Label className="text-xs">O que mostrar <span className="text-muted-foreground font-normal">— só agregados por padrão; marque ⚠ para incluir a lista nominal</span></Label>
              <div className="flex flex-wrap gap-1.5" data-modelos>
                {MODELOS_DE_RELATORIO.map(m => (
                  <button key={m.id} type="button" data-modelo={m.id} aria-pressed={modeloAtual === m.id} title={m.descricao} onClick={() => escolherModelo(m.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${modeloAtual === m.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>{m.rotulo}</button>
                ))}
                <span className={`rounded-full border px-3 py-1 text-xs ${modeloAtual === null ? "bg-primary text-primary-foreground border-primary" : "opacity-60"}`} data-modelo="personalizado" aria-pressed={modeloAtual === null}>Personalizado</span>
              </div>
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2" data-blocos>
                {BLOCOS_DE_CONTRIBUICOES.map(b => (
                  <label key={b.id} className="flex items-start gap-2 text-xs cursor-pointer" title={b.descricao}>
                    <input type="checkbox" className="mt-0.5" checked={blocos.includes(b.id)} onChange={() => alternar(b.id)} data-bloco={b.id} />
                    <span><strong className="font-medium">{IDS_NOMINAIS.includes(b.id) ? "⚠ " : ""}{b.titulo}</strong><span className="block text-muted-foreground">{b.descricao}</span></span>
                  </label>
                ))}
              </div>
              {blocos.length === 0 && <p className="text-xs text-warning-text" data-aviso="sem-blocos">Escolha ao menos um bloco.</p>}
              {comNomes && (
                <div className="space-y-1" data-secao="ordenacao">
                  <Label className="text-xs" htmlFor="ordenacao-das-listas">Ordenação das listas com nomes</Label>
                  <select id="ordenacao-das-listas" value={ordenacao} onChange={e => setOrdenacao(e.target.value as OrdenacaoDasListas)} data-campo="ordenacao"
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    {ORDENACOES_DAS_LISTAS.map(o => (<option key={o.id} value={o.id}>{o.rotulo}</option>))}
                  </select>
                  <p className="text-xs text-muted-foreground" data-ordem-descricao>{ORDENACOES_DAS_LISTAS.find(o => o.id === ordenacao)!.descricao}. Cada linha leva a classificação (#).</p>
                </div>
              )}
              {comNomes && <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-text" data-aviso="nominal">⚠ Este relatório contém dados nominais (nomes, última contribuição e situação, sem valores). O acesso e envio serão registrados para auditoria. Não encaminhe o e-mail.</p>}
              <p className="text-xs text-muted-foreground" data-aviso="so-agregado">Valor individual, média individual, telefone e e-mail nunca vão por e-mail. Os blocos sem ⚠ levam só números.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="destinatario-novo">Destinatários</Label>
              <div className="flex flex-wrap gap-1.5" data-destinatarios>
                {destinatarios.map(d => (
                  <span key={d} data-destinatario={d} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-2.5 pr-1 py-0.5 text-xs">
                    {d}<button type="button" aria-label={`Remover ${d}`} onClick={() => setDestinatarios(destinatarios.filter(x => x !== d))} className="rounded-full p-0.5 hover:bg-muted"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input id="destinatario-novo" value={campo} onChange={e => { setCampo(e.target.value); setErroDoCampo(""); }} placeholder="e-mail do destinatário" className="h-9 text-base md:text-sm" inputMode="email" autoComplete="off"
                  onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); adicionar(campo); } }} onBlur={() => campo.trim() && adicionar(campo)} />
                <Button type="button" variant="outline" size="sm" onClick={() => adicionar(campo)} disabled={!campo.trim()}>Adicionar</Button>
              </div>
              {erroDoCampo && <p className="text-xs text-destructive-text" data-erro="destinatario">{erroDoCampo}</p>}
              <p className="text-xs text-muted-foreground">Cada pessoa recebe o seu e-mail; ninguém vê os outros destinatários. Até {MAXIMO_DE_DESTINATARIOS}.</p>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={visualizar} disabled={pedido.vazio || blocos.length === 0 || semCategoria || !!ocupado} data-acao="visualizar">
                  {ocupado === "previa" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Visualizar e-mail
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={testar} disabled={pedido.vazio || blocos.length === 0 || semCategoria || !!ocupado} data-acao="teste">
                  {ocupado === "teste" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar teste para mim
                </Button>
                {!previaValida && <span className="text-xs text-muted-foreground" data-aviso="previa-obrigatoria">Visualize o e-mail para liberar o envio.</span>}
              </div>
              {previa && (
                <div className={`rounded-md border overflow-hidden ${previaValida ? "" : "opacity-50"}`} data-previa={previaValida ? "valida" : "antiga"}>
                  <p className="px-3 py-1.5 text-xs bg-muted/40 border-b truncate">Assunto: <strong>{previa.dados.assunto}</strong></p>
                  {/* sandbox sem permissões: o HTML do e-mail não executa nada */}
                  <iframe title="Prévia do e-mail" srcDoc={previa.dados.html} sandbox="" className="w-full h-[360px] bg-white" />
                </div>
              )}
              {previa && !previaValida && <p className="text-xs text-warning-text">O período, a base, as contribuições ou os blocos mudaram depois desta prévia: visualize de novo.</p>}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={aoFechar} disabled={!!ocupado}>Fechar</Button>
            <Button type="button" onClick={() => setConfirmando(true)} disabled={!previaValida || destinatarios.length === 0 || !!ocupado} className="gap-1.5" data-acao="enviar">
              {ocupado === "enviar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmando} onOpenChange={v => !v && setConfirmando(false)}>
        <AlertDialogContent data-confirmacao="envio">
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar o relatório agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Período {dataBr(pedido.ini)} a {dataBr(pedido.fim)}, {ordenados.length} {ordenados.length === 1 ? "bloco" : "blocos"}, para {destinatarios.join(", ")}. {comNomes ? "ATENÇÃO: o e-mail contém NOMES de pessoas (sem valores)." : "O e-mail leva só números agregados, sem nomes."} O envio fica registrado no Histórico e não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); enviar(); }}>Enviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
