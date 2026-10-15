// ─── DocumentosDoFechamento — a seção "Documentos do fechamento" da aba Fechamento ─────────────────────────────────────────────────────────────────────
//
// Pedido dela (15/10/2026): extratos, OFX, cartões, relatórios Cielo e Rede, aplicações, rendimentos e outros documentos do mês pertencem ao FECHAMENTO, não a uma despesa.
// Aqui: o CHECKLIST (extrato, OFX, cartão, adquirente), anexar, listar, abrir, excluir (com motivo) e o HISTÓRICO de inclusão (quem, data e hora, vindos do banco).
// Item sem arquivo é atenção, não bloqueio; "Não se aplica neste mês" dispensa o item, com motivo. Tudo isto acompanha o pacote contábil (pasta "Documentos do fechamento").
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, History, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  GRUPOS_DO_CHECKLIST, TIPOS_DE_DOCUMENTO, checklistDeDocumentos, infoDoTipo, problemaDoArquivo, resumoDoChecklist, rotuloDoTipo, sugerirTipo,
  type GrupoDoChecklist, type TipoDeDocumento,
} from "@/lib/fechamentoDocumentos";
import { mensagemErro } from "@/lib/erroRede";
import { listarContas, type FinConta } from "@/services/finService";
import {
  anexarDocumentoDoFechamento, desfazerDispensa, dispensarItemDoChecklist, listarDispensasDoFechamento, listarDocumentosDoFechamento, removerDocumentoDoFechamento, urlDoDocumentoDoFechamento,
  type DispensaDoFechamento, type DocumentoDoFechamento,
} from "@/services/fechamentoDocumentosService";

const dataHora = (iso: string) => {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const tamanho = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

interface Props {
  ano: number;
  mes: number;
  rotulo: string;
  /** Avisa quem está em volta (o checklist do fechamento) que algo mudou. */
  onMudou?: (resumo: { completo: boolean; faltando: number; documentos: number }) => void;
}

export function DocumentosDoFechamento({ ano, mes, rotulo, onMudou }: Props) {
  const [docs, setDocs] = useState<DocumentoDoFechamento[]>([]);
  const [historico, setHistorico] = useState<DocumentoDoFechamento[] | null>(null);
  const [dispensas, setDispensas] = useState<DispensaDoFechamento[]>([]);
  const [contas, setContas] = useState<FinConta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [arquivos, setArquivos] = useState<File[]>([]);
  const [tipo, setTipo] = useState<TipoDeDocumento | "">("");
  const [contaId, setContaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const [excluindo, setExcluindo] = useState<DocumentoDoFechamento | null>(null);
  const [dispensando, setDispensando] = useState<GrupoDoChecklist | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [d, s] = await Promise.all([listarDocumentosDoFechamento(ano, mes), listarDispensasDoFechamento(ano, mes)]);
      setDocs(d); setDispensas(s);
      if (historico) setHistorico(await listarDocumentosDoFechamento(ano, mes, true));
      const itens = resumoDoChecklist(checklistDeDocumentos(d, s));
      onMudou?.({ completo: itens.completo, faltando: itens.faltando, documentos: d.length });
    } catch (e) { setErro(mensagemErro(e)); } finally { setCarregando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes, historico === null]);
  useEffect(() => { setCarregando(true); setHistorico(null); void carregar(); }, [ano, mes]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listarContas().then(setContas).catch(() => setContas([])); }, []);

  const itens = checklistDeDocumentos(docs, dispensas);

  function escolher(lista: FileList | null) {
    const arr = lista ? Array.from(lista) : [];
    setArquivos(arr);
    if (arr.length > 0 && !tipo) setTipo(sugerirTipo(arr[0].name) ?? "");
  }

  async function anexar() {
    if (!tipo || arquivos.length === 0) return;
    setEnviando(true);
    let feitos = 0; const falhas: string[] = [];
    for (const a of arquivos) {
      try { await anexarDocumentoDoFechamento({ ano, mes, tipo, contaId: contaId || null, descricao: descricao || null, arquivo: a }); feitos++; }
      catch (e) { falhas.push(`${a.name}: ${mensagemErro(e)}`); }
    }
    setEnviando(false);
    if (feitos > 0) toast.success(feitos === 1 ? "Documento anexado ao fechamento." : `${feitos} documentos anexados ao fechamento.`);
    falhas.forEach(f => toast.error(f));
    if (falhas.length === 0) { setArquivos([]); setTipo(""); setContaId(""); setDescricao(""); if (entrada.current) entrada.current.value = ""; }
    else setArquivos(arquivos.filter(a => falhas.some(f => f.startsWith(a.name + ":"))));
    await carregar();
  }

  async function abrir(d: DocumentoDoFechamento) {
    try { window.open(await urlDoDocumentoDoFechamento(d.storagePath), "_blank", "noopener"); } catch (e) { toast.error(mensagemErro(e)); }
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    setOcupado(true);
    try { await removerDocumentoDoFechamento(excluindo, motivo); toast.success("Documento excluído. A exclusão fica no histórico."); setExcluindo(null); setMotivo(""); await carregar(); }
    catch (e) { toast.error(mensagemErro(e)); } finally { setOcupado(false); }
  }
  async function confirmarDispensa() {
    if (!dispensando) return;
    setOcupado(true);
    try { await dispensarItemDoChecklist(ano, mes, dispensando, motivo); toast.success("Item marcado como não aplicável neste mês."); setDispensando(null); setMotivo(""); await carregar(); }
    catch (e) { toast.error(mensagemErro(e)); } finally { setOcupado(false); }
  }
  async function desfazer(s: DispensaDoFechamento) {
    try { await desfazerDispensa(s.id); await carregar(); } catch (e) { toast.error(mensagemErro(e)); }
  }
  async function verHistorico() {
    if (historico) { setHistorico(null); return; }
    try { setHistorico(await listarDocumentosDoFechamento(ano, mes, true)); } catch (e) { toast.error(mensagemErro(e)); }
  }

  const problemaDosArquivos = arquivos.map(a => problemaDoArquivo(a)).find(Boolean) ?? null;
  const podeAnexar = !!tipo && arquivos.length > 0 && !problemaDosArquivos && !enviando;
  const removidos = (historico ?? []).filter(d => d.removidoEm);

  if (carregando) return <p className="basis-full text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando os documentos de {rotulo}…</p>;
  if (erro) return <p className="basis-full text-sm text-destructive-text">Não foi possível carregar os documentos do fechamento: {erro}</p>;

  return (
    <div className="basis-full w-full space-y-3" aria-label={`Documentos do fechamento de ${rotulo}`}>
      <p className="text-[11px] text-muted-foreground">
        Extratos, OFX, faturas de cartão, relatórios de adquirentes e outros documentos do mês. Eles pertencem ao <b>fechamento</b>, não a uma despesa, e vão no malote, na pasta “Documentos do fechamento”.
      </p>

      {/* ── o checklist ── */}
      <ul className="divide-y rounded-md border" aria-label="Checklist de documentos do fechamento">
        {itens.map(i => (
          <li key={i.grupo} className="flex items-center gap-2 px-3 py-2 text-sm">
            {i.estado === "anexado" ? <CheckCircle2 className="w-4 h-4 text-success-text shrink-0" /> : i.estado === "dispensado" ? <CircleDashed className="w-4 h-4 text-muted-foreground shrink-0" /> : <AlertTriangle className="w-4 h-4 text-warning-text shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="font-medium">{i.estado === "anexado" ? "[x]" : "[ ]"} {i.rotulo}</span>
              <span className="block text-xs text-muted-foreground">
                {i.estado === "anexado" && `${i.arquivos} arquivo${i.arquivos === 1 ? "" : "s"}`}
                {i.estado === "dispensado" && `Não se aplica neste mês: ${i.motivoDaDispensa ?? ""}`}
                {i.estado === "faltando" && `Falta: ${GRUPOS_DO_CHECKLIST.find(g => g.grupo === i.grupo)?.aceita}`}
              </span>
            </span>
            {i.estado === "faltando" && <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => { setMotivo(""); setDispensando(i.grupo); }}>Não se aplica</Button>}
            {i.estado === "dispensado" && (
              <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => { const s = dispensas.find(x => x.grupo === i.grupo && !x.desfeitaEm); if (s) void desfazer(s); }}>Desfazer</Button>
            )}
          </li>
        ))}
      </ul>

      {/* ── anexar ── */}
      <div className="rounded-md border p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> Anexar documentos de {rotulo}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="fd-arquivo" className="text-xs">Arquivo(s)</Label>
            <input id="fd-arquivo" ref={entrada} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.ofx,.qfx,.csv,.xls,.xlsx,.txt,.xml,.zip" onChange={e => escolher(e.target.files)}
              className="block w-full text-xs file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1 file:text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fd-tipo" className="text-xs">Tipo do documento</Label>
            <select id="fd-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoDeDocumento | "")} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Escolha…</option>
              {TIPOS_DE_DOCUMENTO.map(t => <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fd-conta" className="text-xs">Conta a que se refere (opcional)</Label>
            <select id="fd-conta" value={contaId} onChange={e => setContaId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Nenhuma</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fd-desc" className="text-xs">Descrição (opcional)</Label>
            <Input id="fd-desc" className="h-9" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: extrato do período 01 a 30" />
          </div>
        </div>
        {problemaDosArquivos && <p className="text-xs text-destructive-text" role="alert">{problemaDosArquivos}</p>}
        <div className="flex justify-end">
          <Button size="sm" className="h-8 gap-1.5" disabled={!podeAnexar} onClick={() => void anexar()}>
            {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
            {enviando ? "Anexando…" : arquivos.length > 1 ? `Anexar ${arquivos.length} arquivos` : "Anexar"}
          </Button>
        </div>
      </div>

      {/* ── os anexos do mês ── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">Anexos de {rotulo} ({docs.length})</p>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => void verHistorico()}><History className="w-3.5 h-3.5" /> {historico ? "Ocultar histórico" : "Ver histórico"}</Button>
        </div>
        {docs.length === 0
          ? <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">Nenhum documento anexado ao fechamento de {rotulo}.</p>
          : (
            <ul className="divide-y rounded-md border">
              {docs.map(d => (
                <li key={d.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">{rotuloDoTipo(d.tipo)}</span>
                      <span className="font-medium break-all">{d.arquivoNome}</span>
                      <span className="text-xs text-muted-foreground">{tamanho(d.tamanhoBytes)}</span>
                    </span>
                    {(d.descricao || d.contaId) && <span className="block text-xs text-muted-foreground">{d.descricao}{d.descricao && d.contaId ? " · " : ""}{d.contaId ? contas.find(c => c.id === d.contaId)?.nome ?? "" : ""}</span>}
                    <span className="block text-[11px] text-muted-foreground">Incluído por {d.incluidoPorNome ?? "usuário não identificado"} em {dataHora(d.incluidoEm)} · pasta “{infoDoTipo(d.tipo).pasta}”</span>
                  </span>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0" onClick={() => void abrir(d)}><ExternalLink className="w-3 h-3" /> Abrir</Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0 text-destructive-text" onClick={() => { setMotivo(""); setExcluindo(d); }}><Trash2 className="w-3 h-3" /> Excluir</Button>
                </li>
              ))}
            </ul>
          )}
        {historico && (
          <div className="rounded-md border bg-muted/20 p-3 space-y-1" aria-label="Histórico de inclusão">
            <p className="text-xs font-semibold">Histórico de inclusão e exclusão</p>
            {historico.length === 0 ? <p className="text-xs text-muted-foreground">Nada registrado neste mês.</p> : (
              <ul className="space-y-1 text-xs">
                {historico.map(d => (
                  <li key={d.id} className={d.removidoEm ? "text-muted-foreground" : ""}>
                    <span className={d.removidoEm ? "line-through" : "font-medium"}>{rotuloDoTipo(d.tipo)} — {d.arquivoNome}</span>
                    {" · incluído por "}{d.incluidoPorNome ?? "—"} em {dataHora(d.incluidoEm)}
                    {d.removidoEm && <> · <b>excluído</b> por {d.removidoPorNome ?? "—"} em {dataHora(d.removidoEm)}: {d.removidoMotivo}</>}
                  </li>
                ))}
              </ul>
            )}
            {removidos.length > 0 && <p className="text-[11px] text-muted-foreground">O arquivo excluído sai do armazenamento; o registro fica para sempre.</p>}
          </div>
        )}
      </div>

      {/* ── excluir (com motivo) ── */}
      <Dialog open={!!excluindo} onOpenChange={o => { if (!o && !ocupado) { setExcluindo(null); setMotivo(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir documento do fechamento</DialogTitle>
            <DialogDescription>{excluindo?.arquivoNome}. O arquivo sai do armazenamento e do malote; o registro (quem incluiu, quando e este motivo) fica no histórico.</DialogDescription>
          </DialogHeader>
          <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus placeholder="Por que está sendo excluído? (pelo menos 5 caracteres)" />
          <DialogFooter>
            <Button variant="outline" disabled={ocupado} onClick={() => { setExcluindo(null); setMotivo(""); }}>Cancelar</Button>
            <Button variant="destructive" disabled={ocupado || motivo.trim().length < 5} onClick={() => void confirmarExclusao()}>{ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── não se aplica neste mês ── */}
      <Dialog open={!!dispensando} onOpenChange={o => { if (!o && !ocupado) { setDispensando(null); setMotivo(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Não se aplica neste mês</DialogTitle>
            <DialogDescription>{GRUPOS_DO_CHECKLIST.find(g => g.grupo === dispensando)?.rotulo} em {rotulo}. Fica registrado quem marcou, quando e por quê; dá para desfazer.</DialogDescription>
          </DialogHeader>
          <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} autoFocus placeholder="Ex.: nenhum cartão foi usado em setembro" />
          <DialogFooter>
            <Button variant="outline" disabled={ocupado} onClick={() => { setDispensando(null); setMotivo(""); }}>Cancelar</Button>
            <Button disabled={ocupado || motivo.trim().length < 5} onClick={() => void confirmarDispensa()}>{ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : "Marcar como não aplicável"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
