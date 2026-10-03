// ─── FinancasCentralDocumentos.tsx — Central de Documentos Contábeis (v1) ────
//
// Objetivo (Telma, 03/10/2026): selecionar uma PASTA com dezenas ou centenas de PDFs
// e concluir a vinculação em poucos minutos. Foco: velocidade, simplicidade,
// conferência visual e o mínimo de trabalho manual.
//
//   arrastar/escolher → leitura → casamento → revisão imediata → confirmação →
//   gravação direta → desfazer lote
//
// Fase 1, de propósito SEM tabela nova e SEM fila persistida: o que não foi
// confirmado vive só nesta tela, e nada vai ao armazenamento antes do "Gravar".
// Fechar a aba não perde nada — os arquivos continuam no computador (ou, se eram
// "soltos", no armazenamento). Fase 2 (só depois de alguns fechamentos reais):
// `fin_documentos_fila` ou equivalente.
//
// Primeiro elemento da tela: o card de COBERTURA DOCUMENTAL — o KPI oficial.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Download, FileStack, FolderOpen, Loader2, RotateCcw,
  Undo2, Upload, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CoberturaDocumentalCard } from "@/components/financas/CoberturaDocumentalCard";
import { CartaoDocumento } from "@/components/financas/CartaoDocumento";
import { EscolherLancamentoDialog } from "@/components/financas/EscolherLancamentoDialog";
import { casar } from "@/lib/documentos/casamento";
import { coletarDeLista, coletarDoArrasto, type Coleta } from "@/lib/documentos/coletarArquivos";
import {
  acaoInicial, contagens, destinosEfetivos, grupoDe, numeroParaGravar, podeGravar, tipoSugerido,
  type GrupoUI, type ItemCentral,
} from "@/lib/documentos/fluxo";
import { lerDocumento } from "@/lib/documentos/leitura";
import { lerNomeDeArquivo } from "@/lib/documentos/nomeArquivo";
import { csvDoLote } from "@/lib/documentos/relatorioLote";
import { comprovanteSignedUrl, brl, type FinAnexoTipo } from "@/services/finService";
import {
  baixarArquivo, carregarCandidatos, desfazerLote, gravarLote, hashDoArquivo, hashesDosAnexos,
  lerArquivo, listarOrfaos, type Candidatos, type Orfao, type ResultadoLote,
} from "@/services/centralDocumentosService";

const TAMANHO_PAGINA = 50;
const LIMITE_BYTES = 5 * 1024 * 1024;
const tick = () => new Promise<void>(r => setTimeout(r, 0));

type Filtro = GrupoUI | "todos";

function novoItem(p: Partial<ItemCentral> & Pick<ItemCentral, "id" | "nome" | "caminho" | "bytes" | "origem">): ItemCentral {
  return { etapa: "na_fila", tipo: "outro", acao: "pendente", parcelasExcluidas: [], ...p };
}

export default function FinancasCentralDocumentos() {
  const [itens, setItens] = useState<ItemCentral[]>([]);
  const [cand, setCand] = useState<Candidatos | null>(null);
  const [erroCand, setErroCand] = useState<string | null>(null);
  const [orfaos, setOrfaos] = useState<Orfao[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [visiveis, setVisiveis] = useState(TAMANHO_PAGINA);
  const [lendo, setLendo] = useState<{ feitos: number; total: number; fase: string } | null>(null);
  const [gravando, setGravando] = useState<[number, number] | null>(null);
  const [lotes, setLotes] = useState<ResultadoLote[]>([]);
  const [errosGravacao, setErrosGravacao] = useState<Map<string, string>>(new Map());
  const [kpi, setKpi] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [escolhendoId, setEscolhendoId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // espelhos que o laço de leitura precisa ver sempre atualizados
  const itensRef = useRef<ItemCentral[]>([]);
  const candRef = useRef<Candidatos | null>(null);
  const arquivos = useRef(new Map<string, File>());
  const cacheHashAnexos = useRef(new Map<string, string>());
  const hashesDoLote = useRef(new Map<string, string>());
  const precisaOcr = useRef(new Set<string>());
  const processando = useRef(false);
  const parar = useRef(false);
  const inputArquivos = useRef<HTMLInputElement>(null);
  const inputPasta = useRef<HTMLInputElement>(null);

  useEffect(() => { candRef.current = cand; }, [cand]);

  // O laço de leitura roda fora do ciclo do React e precisa ver a lista NA HORA: o
  // espelho `itensRef` é atualizado de forma síncrona aqui, e o estado acompanha.
  // (Atualizar o espelho só dentro de `setItens(prev => …)` não serve: o React
  // executa essa função depois, e a leitura começava com a lista vazia — medido na
  // primeira verificação ao vivo: 37 arquivos presos em "na fila".)
  const gravarItens = useCallback((n: ItemCentral[]) => {
    itensRef.current = n;
    setItens(n);
  }, []);
  const acrescentar = useCallback((novos: ItemCentral[]) => {
    gravarItens([...itensRef.current, ...novos]);
  }, [gravarItens]);
  const atualizar = useCallback((id: string, patch: Partial<ItemCentral>) => {
    gravarItens(itensRef.current.map(i => (i.id === id ? { ...i, ...patch } : i)));
  }, [gravarItens]);

  // ── candidatos e arquivos soltos ──────────────────────────────────────────
  const carregarTudo = useCallback(async () => {
    setErroCand(null);
    try {
      const c = await carregarCandidatos();
      setCand(c);
      candRef.current = c;
      setOrfaos(await listarOrfaos(c.urlsReferenciadas));
    } catch (e: any) {
      setErroCand(e?.message ?? "Erro ao carregar os lançamentos");
    }
  }, []);
  useEffect(() => { carregarTudo(); }, [carregarTudo]);

  // ── leitura e casamento de UM item ────────────────────────────────────────
  async function processarUm(it: ItemCentral, usarOcr: boolean): Promise<void> {
    const c = candRef.current!;
    try {
      const blob = it.origem === "upload" ? arquivos.current.get(it.id)! : await baixarArquivo(it.storagePath!);
      const hash = it.hash ?? await hashDoArquivo(blob);
      const ehXml = it.nome.toLowerCase().endsWith(".xml");

      const lei = await lerArquivo(blob, it.nome, usarOcr);
      if (!usarOcr && lei.fonte === "nao_lido" && !ehXml) {
        // digitalização/imagem: fica pra segunda passada (OCR é lento)
        precisaOcr.current.add(it.id);
        atualizar(it.id, { etapa: "na_fila", hash });
        return;
      }
      const leitura = lerDocumento(lei.texto ?? "");
      const nomeLido = it.origem === "upload" ? lerNomeDeArquivo(it.nome) : undefined;
      const entrada = {
        id: it.id, leitura, hash,
        nome: nomeLido ? { data: nomeLido.data, valor: nomeLido.valor, fornecedor: nomeLido.fornecedor } : undefined,
      };

      // o mesmo arquivo solto duas vezes neste lote?
      const repetido = hashesDoLote.current.get(hash);
      let resultado;
      if (repetido && repetido !== it.id) {
        resultado = { id: it.id, banda: "duplicata" as const, confianca: 100, candidatos: [], jaAnexadoEm: "este lote", resumo: "Este arquivo se repete neste lote." };
      } else {
        hashesDoLote.current.set(hash, it.id);
        resultado = casar(entrada, c.pool);
        // já está anexado a algum dos candidatos? (compara o conteúdo, não o nome)
        const ids = resultado.parcelamento ? resultado.parcelamento.lancamentos.map(l => l.id) : resultado.candidatos.slice(0, 3).map(x => x.lancamento.id);
        const comAnexo = ids.filter(id => c.anexosPorLancamento.has(id));
        if (comAnexo.length > 0) {
          const existentes = await hashesDosAnexos(comAnexo, c.anexosPorLancamento, cacheHashAnexos.current);
          if (existentes.has(hash)) resultado = casar(entrada, c.pool, { hashesExistentes: existentes });
        }
      }
      atualizar(it.id, {
        etapa: "lido", fonte: lei.fonte, hash, leitura, nomeLido, resultado,
        tipo: tipoSugerido(leitura, nomeLido, ehXml), acao: acaoInicial(resultado.banda),
      });
    } catch (e: any) {
      // o Tesseract às vezes rejeita com string, não com Error
      atualizar(it.id, { etapa: "erro", erro: (typeof e === "string" ? e : e?.message) || String(e) || "erro desconhecido" });
    }
  }

  async function processarFila() {
    if (processando.current) return;
    processando.current = true;
    parar.current = false;
    try {
      if (!candRef.current) { toast.error("Os lançamentos ainda não carregaram — tente de novo em instantes."); return; }
      // Fase 1: texto (rápido). Fase 2: OCR só dos digitalizados (lento).
      for (const fase of [false, true] as const) {
        const fila = itensRef.current.filter(i => i.etapa === "na_fila" && (fase ? precisaOcr.current.has(i.id) : !precisaOcr.current.has(i.id)));
        if (fila.length === 0) continue;
        let feitos = 0;
        for (const it of fila) {
          if (parar.current) break;
          setLendo({ feitos, total: fila.length, fase: fase ? "Lendo digitalizações por OCR (mais lento)" : "Lendo os documentos" });
          atualizar(it.id, { etapa: "lendo" });
          await processarUm(it, fase);
          if (fase) precisaOcr.current.delete(it.id);
          feitos += 1;
          await tick();
        }
      }
    } finally {
      setLendo(null);
      processando.current = false;
      // chegou arquivo novo enquanto lia? continua.
      if (!parar.current && itensRef.current.some(i => i.etapa === "na_fila" && !precisaOcr.current.has(i.id))) processarFila();
    }
  }

  // ── entrada de arquivos ───────────────────────────────────────────────────
  function adicionar(coleta: Coleta) {
    const novos: ItemCentral[] = [];
    const existentes = new Set(itensRef.current.map(i => i.id));
    for (const { file, caminho } of coleta.arquivos) {
      const id = `${caminho}|${file.size}|${file.lastModified}`;
      if (existentes.has(id)) continue;
      existentes.add(id);
      arquivos.current.set(id, file);
      novos.push(novoItem({
        id, nome: file.name, caminho, bytes: file.size, origem: "upload",
        ...(file.size > LIMITE_BYTES ? { etapa: "erro" as const, erro: "maior que 5 MB (limite do sistema para anexos)" } : {}),
      }));
    }
    if (coleta.ignorados.length) toast.warning(`${coleta.ignorados.length} arquivo(s) ignorado(s): o sistema só aceita PDF, JPG, PNG e XML.`);
    if (novos.length === 0) { if (coleta.arquivos.length) toast.info("Esses arquivos já estão na lista."); return; }
    acrescentar(novos);
    setVisiveis(TAMANHO_PAGINA);
    processarFila();
  }

  async function trazerOrfaos() {
    if (!orfaos?.length) return;
    const existentes = new Set(itensRef.current.map(i => i.id));
    const novos = orfaos.filter(o => !existentes.has(`orfao|${o.path}`)).map(o => {
      const base = o.path.split("/").pop() ?? o.path;
      const dd = o.criadoEm ? `${o.criadoEm.slice(8, 10)}/${o.criadoEm.slice(5, 7)}` : "?";
      // o nome original se perdeu no envio (virou timestamp.pdf): o nome gravado diz isso
      return novoItem({ id: `orfao|${o.path}`, nome: `Arquivo solto de ${dd} — ${base}`, caminho: o.path, bytes: o.bytes, origem: "orfao", storagePath: o.path });
    });
    if (novos.length === 0) { toast.info("Os arquivos soltos já estão na lista."); return; }
    acrescentar(novos);
    processarFila();
  }

  // ── gravação ──────────────────────────────────────────────────────────────
  const cont = useMemo(() => contagens(itens), [itens]);

  async function gravar() {
    setConfirmando(false);
    const vinculos = itensRef.current.filter(podeGravar).map(it => {
      const destinos = destinosEfetivos(it);
      const numero = numeroParaGravar(it);
      return {
        itemId: it.id, origem: it.origem, arquivo: arquivos.current.get(it.id), storagePath: it.storagePath,
        nome: it.nome, tipo: it.tipo, lancamentoIds: destinos.map(l => l.id),
        // o número do documento vai para os lançamentos que estão sem número
        documentoNumero: numero,
        semNumero: numero ? destinos.filter(l => !l.documentoNumero).map(l => l.id) : [],
      };
    });
    if (vinculos.length === 0) return;
    setGravando([0, vinculos.length]);
    try {
      const res = await gravarLote(vinculos, (f, t) => setGravando([f, t]));
      const gravados = new Set(res.criados.map(c => c.itemId));
      const erros = new Map(res.erros.map(e => [e.itemId, e.mensagem]));
      setErrosGravacao(prev => new Map([...prev, ...erros]));
      gravarItens(itensRef.current.map(i => (gravados.has(i.id) ? { ...i, gravado: true } : i)));
      if (res.criados.length) setLotes(prev => [...prev, res]);
      if (res.erros.length) toast.warning(`${gravados.size} documento(s) gravado(s); ${res.erros.length} com erro (veja nos cartões).`);
      else toast.success(
        `${res.criados.length} vínculo(s) gravado(s) em ${gravados.size} documento(s)` +
        (res.numerosGravados.length ? `; nº do documento registrado em ${res.numerosGravados.length} lançamento(s).` : "."));
      if (res.avisos.length) toast.warning(res.avisos.slice(0, 3).join(" ") + (res.avisos.length > 3 ? ` (+${res.avisos.length - 3})` : ""));
      setKpi(k => k + 1);
      carregarTudo();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gravar");
    } finally {
      setGravando(null);
    }
  }

  async function desfazer() {
    const ultimo = lotes[lotes.length - 1];
    if (!ultimo) return;
    setGravando([0, 1]);
    try {
      const r = await desfazerLote(ultimo);
      const ids = new Set(ultimo.criados.map(c => c.itemId));
      gravarItens(itensRef.current.map(i => (ids.has(i.id) ? { ...i, gravado: false, acao: "pendente" } : i)));
      setLotes(prev => prev.slice(0, -1));
      if (r.erros.length) toast.warning(`${r.removidos} vínculo(s) desfeito(s); ${r.erros.join(" · ")}`);
      else toast.success(`Lote desfeito: ${r.removidos} vínculo(s) removido(s).`);
      setKpi(k => k + 1);
      carregarTudo();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao desfazer");
    } finally {
      setGravando(null);
    }
  }

  function baixarRelatorio() {
    const csv = csvDoLote(itensRef.current, errosGravacao);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    const agora = new Date();
    a.href = url;
    a.download = `Central_Documentos_${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}_${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function abrir(it: ItemCentral) {
    if (it.origem === "upload") {
      const f = arquivos.current.get(it.id);
      if (f) window.open(URL.createObjectURL(f), "_blank", "noopener,noreferrer");
    } else if (it.storagePath) {
      const url = await comprovanteSignedUrl(it.storagePath);
      if (url) window.open(url, "_blank", "noopener,noreferrer"); else toast.error("Não foi possível abrir o arquivo");
    }
  }

  // ── avisar antes de sair com trabalho não gravado ─────────────────────────
  useEffect(() => {
    if (cont.confirmados === 0) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [cont.confirmados]);

  // ── lista ─────────────────────────────────────────────────────────────────
  const lista = useMemo(() => {
    const visivel = itens.filter(i => filtro === "todos" || grupoDe(i) === filtro);
    // o que já foi lido primeiro; o que ainda está na fila, depois
    return [...visivel].sort((a, b) => Number(a.etapa === "na_fila" || a.etapa === "lendo") - Number(b.etapa === "na_fila" || b.etapa === "lendo"));
  }, [itens, filtro]);
  useEffect(() => { setVisiveis(TAMANHO_PAGINA); }, [filtro]);

  const itemEscolhendo = itens.find(i => i.id === escolhendoId) ?? null;
  const tipoDe = (id: string, t: FinAnexoTipo) => atualizar(id, { tipo: t });

  const CHIPS: { id: Filtro; rotulo: string; n: number; Icone?: typeof CheckCircle2; cor?: string }[] = [
    { id: "todos", rotulo: "Todos", n: cont.total },
    { id: "automatico", rotulo: "Vinculação automática", n: cont.automatico, Icone: CheckCircle2, cor: "text-success-text" },
    { id: "revisao", rotulo: "Revisão necessária", n: cont.revisao, Icone: AlertTriangle, cor: "text-warning-text" },
    { id: "nao_identificado", rotulo: "Não identificado", n: cont.nao_identificado, Icone: XCircle, cor: "text-destructive-text" },
    { id: "ja_anexado", rotulo: "Já anexado", n: cont.ja_anexado, Icone: RotateCcw, cor: "text-muted-foreground" },
  ];

  const temItens = itens.length > 0;

  return (
    <div
      className="max-w-6xl mx-auto p-4 md:p-6 space-y-4 pb-0"
      onDragOver={e => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setArrastando(false); }}
      onDrop={async e => { e.preventDefault(); setArrastando(false); adicionar(await coletarDoArrasto(e.dataTransfer)); }}
    >
      {/* 1. O KPI oficial vem PRIMEIRO (pedido da Telma). */}
      <CoberturaDocumentalCard atualizacao={kpi} />

      <header className="flex items-start gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/financas/auditoria-anexos"><ArrowLeft className="w-3.5 h-3.5" /> Auditoria</Link>
        </Button>
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="font-serif text-2xl flex items-center gap-2"><FileStack className="w-5 h-5 text-gold shrink-0" /> Central de Documentos</h1>
          <p className="text-sm text-muted-foreground">Solte uma pasta com os documentos: o sistema lê, sugere o lançamento de cada um e você confere.</p>
        </div>
      </header>

      {/* 2. Entrada de arquivos */}
      <Card className={arrastando ? "border-gold ring-2 ring-gold/30" : "border-dashed"}>
        <CardContent className={temItens ? "p-3 flex flex-wrap items-center gap-2" : "p-8 text-center space-y-4"}>
          {!temItens && (
            <>
              <Upload className="w-8 h-8 mx-auto text-gold" aria-hidden />
              <div>
                <p className="font-medium">Arraste aqui uma pasta (ou vários arquivos)</p>
                <p className="text-sm text-muted-foreground">PDF, JPG, PNG ou XML, até 5 MB cada. Dezenas ou centenas de uma vez.</p>
              </div>
            </>
          )}
          <div className={`flex flex-wrap gap-2 ${temItens ? "" : "justify-center"}`}>
            <Button variant={temItens ? "outline" : "gold"} size="sm" className="gap-1.5" onClick={() => inputPasta.current?.click()} disabled={!cand}>
              <FolderOpen className="w-3.5 h-3.5" /> Escolher pasta
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => inputArquivos.current?.click()} disabled={!cand}>
              <Upload className="w-3.5 h-3.5" /> Escolher arquivos
            </Button>
            {!!orfaos?.length && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={trazerOrfaos} disabled={!cand}
                title="PDFs que já estão guardados no sistema mas não estão ligados a nenhum lançamento">
                <FileStack className="w-3.5 h-3.5" /> Arquivos soltos no armazenamento ({orfaos.length})
              </Button>
            )}
          </div>
          {!cand && !erroCand && <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 w-full"><Loader2 className="w-3 h-3 animate-spin" /> Carregando os lançamentos…</p>}
          {erroCand && (
            <p className="text-xs text-destructive-text w-full">
              {erroCand} <button type="button" className="underline" onClick={carregarTudo}>Tentar de novo</button>
            </p>
          )}
          <input ref={inputArquivos} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xml" className="hidden"
            onChange={e => { if (e.target.files) adicionar(coletarDeLista(e.target.files)); e.target.value = ""; }} />
          <input ref={inputPasta} type="file" multiple className="hidden"
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={e => { if (e.target.files) adicionar(coletarDeLista(e.target.files)); e.target.value = ""; }} />
        </CardContent>
      </Card>

      {/* progresso de leitura */}
      {lendo && (
        <Card><CardContent className="p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="flex-1">{lendo.fase} — {lendo.feitos} de {lendo.total}</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { parar.current = true; }}>Parar</Button>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-gold transition-all" style={{ width: `${Math.round((lendo.feitos / Math.max(1, lendo.total)) * 100)}%` }} />
          </div>
        </CardContent></Card>
      )}

      {/* 3. Grupos (filtros) */}
      {temItens && (
        <>
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Grupos">
            {CHIPS.map(c => (
              <Button key={c.id} size="sm" variant={filtro === c.id ? "default" : "outline"} className="h-8 text-xs gap-1.5"
                role="tab" aria-selected={filtro === c.id} onClick={() => setFiltro(c.id)}>
                {c.Icone && <c.Icone className={`w-3.5 h-3.5 ${filtro === c.id ? "" : c.cor}`} />}
                {c.rotulo} <span className="tabular-nums opacity-80">{c.n}</span>
              </Button>
            ))}
            <span className="flex-1" />
            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={baixarRelatorio}>
              <Download className="w-3.5 h-3.5" /> Relatório do lote (CSV)
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {lista.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Nenhum documento neste grupo.</p>
              ) : (
                <ul className="divide-y">
                  {lista.slice(0, visiveis).map(it => (
                    <CartaoDocumento key={it.id} item={it}
                      onConfirmar={() => atualizar(it.id, { acao: "confirmado" })}
                      onVoltarAPendente={() => atualizar(it.id, { acao: "pendente" })}
                      onIgnorar={() => atualizar(it.id, { acao: "ignorado" })}
                      onEscolherOutro={() => setEscolhendoId(it.id)}
                      onUsarPalpite={() => { const t = it.resultado?.candidatos[0]?.lancamento; if (t) atualizar(it.id, { escolhido: t, acao: "confirmado" }); }}
                      onTipo={t => tipoDe(it.id, t)}
                      onAlternarParcela={lid => atualizar(it.id, { parcelasExcluidas: it.parcelasExcluidas.includes(lid) ? it.parcelasExcluidas.filter(x => x !== lid) : [...it.parcelasExcluidas, lid] })}
                      onAbrir={() => abrir(it)} />
                  ))}
                </ul>
              )}
              {lista.length > visiveis && (
                <div className="p-3 border-t text-center">
                  <Button variant="outline" size="sm" onClick={() => setVisiveis(v => v + TAMANHO_PAGINA)}>
                    Mostrar mais {Math.min(TAMANHO_PAGINA, lista.length - visiveis)} de {lista.length - visiveis} restantes
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* 4. Rodapé fixo: gravar / desfazer */}
      {temItens && (
        // `sticky`, não `fixed`: o <main> do AppLayout é o contêiner de rolagem e tem
        // animação de entrada, o que desloca o `fixed` (medido ao vivo: a barra caiu no
        // meio da lista). No celular, sobe 4,25rem para não ficar sob a navegação inferior.
        <div className="sticky bottom-[4.25rem] md:bottom-0 z-20 -mx-4 md:-mx-6 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="px-4 md:px-6 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-sm tabular-nums flex-1 min-w-[12rem]">
              <strong>{cont.confirmados}</strong> documento(s) marcado(s) · <strong>{cont.vinculos}</strong> vínculo(s)
              {cont.revisao + cont.nao_identificado > 0 && (
                <span className="text-muted-foreground"> · {cont.revisao + cont.nao_identificado} ainda sem decisão</span>
              )}
              {cont.gravados > 0 && <span className="text-success-text"> · {cont.gravados} já gravado(s)</span>}
            </p>
            {lotes.length > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={desfazer} disabled={!!gravando}>
                <Undo2 className="w-3.5 h-3.5" /> Desfazer o último lote ({lotes[lotes.length - 1].criados.length})
              </Button>
            )}
            <Button size="sm" variant="gold" className="gap-1.5" onClick={() => setConfirmando(true)} disabled={cont.vinculos === 0 || !!gravando || !!lendo}>
              {gravando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {gravando ? `Gravando ${gravando[0]}/${gravando[1]}` : `Gravar ${cont.vinculos} vínculo(s)`}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gravar {cont.vinculos} vínculo(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              {cont.confirmados} documento(s) serão anexados a {cont.vinculos} lançamento(s) (uma compra parcelada leva o
              mesmo documento a todas as parcelas). Você poderá <strong>desfazer este lote</strong> logo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={gravar}>Gravar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {itemEscolhendo && cand && (
        <EscolherLancamentoDialog
          open onOpenChange={v => { if (!v) setEscolhendoId(null); }}
          pool={cand.pool} leitura={itemEscolhendo.leitura} nomeArquivo={itemEscolhendo.nome}
          onEscolher={l => atualizar(itemEscolhendo.id, { escolhido: l, acao: "confirmado" })}
        />
      )}
    </div>
  );
}
