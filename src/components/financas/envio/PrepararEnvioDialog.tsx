// ─── PrepararEnvioDialog — "Arquivos de pagamento" para os tesoureiros, em dois cliques ──────────────────────────────────────────────────────────────────
// Pedido dela (20/10/2026): os tesoureiros ainda não usam o sistema; ela copia, uma a uma, a linha digitável/Pix de cada obrigação para um e-mail. Aqui o sistema lista o que pode ir (atrasadas e de
// hoje já marcadas), confere (valor do boleto × obrigação, código de barras) e entrega o MESMO e-mail que ela manda hoje — formatado, para colar no Gmail — ou a versão do WhatsApp, mais o ZIP
// "13.OUT" com os boletos para a pasta do Drive. Nada é gravado. Prebenda/folha/Sustento nunca vêm marcados; o que não tem meio de pagamento aparece como "sem dado automático".
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, ExternalLink, Loader2, Mail, MessageCircle, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { montarLinkWhatsApp } from "@/lib/whatsapp";
import {
  INTRODUCAO_PADRAO, SAUDACAO_PADRAO, bancoDaLinha, formatarLinha, linkDoEmail, montarEnvio, tipoDaLinha, type GrupoDoEnvio, type ItemDeEnvio,
} from "@/lib/envioDePagamentos";
import {
  baixarBoletos, buscarPessoasComEmail, carregarItensDeEnvio, guardarPreferencias, lerPreferencias, type Destinatario,
} from "@/services/envioDePagamentosService";
import { brl, type FinVencimento } from "@/services/finService";

const dataBr = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");
const LIMITE_DO_WHATSAPP = 3500;

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** as obrigações que PODEM ir (a Mesa tira as automáticas e as quitadas por terceiros) com o valor a pagar de cada uma (o saldo, se parcial) */
  candidatas: { v: FinVencimento; valor: number }[];
  hojeYmd: string;
  onAbrirObrigacao: (id: string) => void;
}

const GRUPOS: { grupo: GrupoDoEnvio; titulo: string; dica?: string; tom?: "aviso" }[] = [
  { grupo: "padrao", titulo: "Prontos para enviar", dica: "têm linha digitável" },
  { grupo: "pix", titulo: "Pix — opcional", dica: "sem linha digitável; têm Pix do documento ou chave do favorecido" },
  { grupo: "sigiloso", titulo: "Prebenda, folha e Sustento — sigilosos", dica: "nunca vêm marcados; vão no corpo do e-mail se você marcar", tom: "aviso" },
  { grupo: "sem_dado", titulo: "Sem dado automático", dica: "sem linha digitável nem Pix: abra o documento" },
];

export function PrepararEnvioDialog({ aberto, onFechar, candidatas, hojeYmd, onAbrirObrigacao }: Props) {
  const [itens, setItens] = useState<ItemDeEnvio[] | null>(null);
  const [progresso, setProgresso] = useState<[number, number]>([0, 0]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [descricoes, setDescricoes] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(() => lerPreferencias());
  const [busca, setBusca] = useState("");
  const [achadas, setAchadas] = useState<Destinatario[]>([]);
  const [baixando, setBaixando] = useState(false);
  const sessao = useRef(0);

  // lê os documentos quando o painel abre (e de novo se a lista de candidatas mudar enquanto aberto não — só ao abrir)
  useEffect(() => {
    if (!aberto) return;
    const minha = ++sessao.current;
    setItens(null); setProgresso([0, candidatas.length]); setDescricoes({}); setEditando(null); setPrefs(lerPreferencias());
    void carregarItensDeEnvio(candidatas, (f, t) => { if (sessao.current === minha) setProgresso([f, t]); }).then(lidos => {
      if (sessao.current !== minha) return;
      const ordem = [...lidos].sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.fornecedor.localeCompare(b.fornecedor, "pt-BR"));
      setItens(ordem);
      setMarcados(new Set(ordem.filter(i => i.marcadoPorPadrao).map(i => i.id)));
    }).catch(e => { if (sessao.current === minha) { toast.error(e?.message ?? "Não foi possível ler os documentos"); setItens([]); } });
    return () => { sessao.current++; };
    // só ao abrir: reler a cada renderização da Mesa faria o painel piscar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  useEffect(() => { guardarPreferencias(prefs); }, [prefs]);

  // busca de destinatários no Cadastro de Pessoas
  useEffect(() => {
    if (busca.trim().length < 2) { setAchadas([]); return; }
    let vivo = true;
    const t = window.setTimeout(() => { buscarPessoasComEmail(busca).then(r => { if (vivo) setAchadas(r); }).catch(() => { if (vivo) setAchadas([]); }); }, 250);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [busca]);

  const porGrupo = useMemo(() => {
    const m: Record<GrupoDoEnvio, ItemDeEnvio[]> = { padrao: [], pix: [], sigiloso: [], sem_dado: [] };
    for (const i of itens ?? []) m[i.grupo].push(i);
    return m;
  }, [itens]);

  const escolhidos = useMemo(() => (itens ?? []).filter(i => marcados.has(i.id) && i.grupo !== "sem_dado"), [itens, marcados]);
  const envio = useMemo(() => montarEnvio(escolhidos, {
    hojeYmd, hora: new Date().getHours(), saudacao: prefs.saudacao ?? SAUDACAO_PADRAO, introducao: prefs.introducao ?? INTRODUCAO_PADRAO,
    linhasDeDescricao: descricoes, incluirResumo: prefs.incluirResumo, citarSemLinha: prefs.citarSemLinha, semDado: porGrupo.sem_dado,
  }), [escolhidos, hojeYmd, prefs, descricoes, porGrupo.sem_dado]);
  const temSigiloso = escolhidos.some(i => i.grupo === "sigiloso");

  const alternar = (id: string) => setMarcados(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarGrupo = (g: GrupoDoEnvio) => setMarcados(s => {
    const ids = porGrupo[g].map(i => i.id); const todos = ids.every(id => s.has(id)); const n = new Set(s);
    ids.forEach(id => (todos ? n.delete(id) : n.add(id))); return n;
  });

  async function copiarFormatado(): Promise<boolean> {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([envio.html], { type: "text/html" }), "text/plain": new Blob([envio.texto], { type: "text/plain" }) })]);
      } else await navigator.clipboard.writeText(envio.texto);
      return true;
    } catch { toast.error("O navegador não deixou copiar. Tente de novo ou use o WhatsApp."); return false; }
  }

  async function copiarEEnviarEmail() {
    if (escolhidos.length === 0) { toast.error("Marque ao menos um pagamento."); return; }
    if (!(await copiarFormatado())) return;
    toast.success(`Copiado: ${escolhidos.length} ${escolhidos.length === 1 ? "pagamento" : "pagamentos"} — cole no corpo do e-mail (Ctrl+V)`);
    const a = document.createElement("a");
    a.href = linkDoEmail(prefs.destinatarios.map(d => d.email), envio.assunto);
    a.click();
  }

  async function soCopiar() {
    if (escolhidos.length === 0) { toast.error("Marque ao menos um pagamento."); return; }
    if (await copiarFormatado()) toast.success("Copiado, com a formatação do e-mail");
  }

  async function paraWhatsApp() {
    if (escolhidos.length === 0) { toast.error("Marque ao menos um pagamento."); return; }
    if (envio.whatsapp.length > LIMITE_DO_WHATSAPP) {
      try { await navigator.clipboard.writeText(envio.whatsapp); toast.success("A mensagem é longa demais para abrir direto: copiada, cole no WhatsApp."); } catch { toast.error("Mensagem longa demais e o navegador não deixou copiar."); }
      return;
    }
    window.open(montarLinkWhatsApp({ texto: envio.whatsapp }), "_blank", "noopener");
  }

  async function zip() {
    if (escolhidos.length === 0) { toast.error("Marque ao menos um pagamento."); return; }
    setBaixando(true);
    try {
      const r = await baixarBoletos(escolhidos, hojeYmd);
      if (r.arquivos === 0) toast.error("Nenhum dos marcados tem documento anexado.");
      else toast.success(`${r.arquivos} ${r.arquivos === 1 ? "arquivo" : "arquivos"} no ZIP${r.semDocumento.length ? ` · sem documento: ${r.semDocumento.join(", ")}` : ""}`);
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível montar o ZIP"); }
    finally { setBaixando(false); }
  }

  const adicionar = (d: Destinatario) => {
    if (!prefs.destinatarios.some(x => x.email.toLowerCase() === d.email.toLowerCase())) setPrefs(p => ({ ...p, destinatarios: [...p.destinatarios, d] }));
    setBusca(""); setAchadas([]);
  };
  const emailDigitado = /^\S+@\S+\.\S+$/.test(busca.trim()) ? busca.trim() : null;

  const carregando = itens === null;
  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preparar envio — arquivos de pagamento</DialogTitle>
          <DialogDescription>Confira o que vai, e cole no e-mail que os tesoureiros já recebem. Nada é gravado.</DialogDescription>
        </DialogHeader>

        {carregando ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo os documentos… {progresso[0]} de {progresso[1]}
          </p>
        ) : itens!.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma obrigação para enviar agora.</p>
        ) : (
          <div className="space-y-4">
            {GRUPOS.map(g => porGrupo[g.grupo].length > 0 && (
              <section key={g.grupo} aria-label={g.titulo} data-grupo={g.grupo}>
                <header className="mb-1 flex flex-wrap items-baseline gap-x-2">
                  <h3 className={`text-sm font-bold ${g.tom === "aviso" ? "text-warning-text" : ""}`}>{g.titulo} · {porGrupo[g.grupo].length}</h3>
                  <span className="text-xs text-muted-foreground">{g.dica}</span>
                  {g.grupo !== "sem_dado" && (
                    <button type="button" className="ml-auto text-xs underline underline-offset-2" onClick={() => alternarGrupo(g.grupo)}>
                      {porGrupo[g.grupo].every(i => marcados.has(i.id)) ? "desmarcar todos" : "marcar todos"}
                    </button>
                  )}
                </header>
                <ul className="divide-y rounded-md border">
                  {porGrupo[g.grupo].map(i => (
                    <li key={i.id} className="px-3 py-2 text-sm" data-item={i.id}>
                      <div className="flex items-start gap-2">
                        {i.grupo !== "sem_dado" && <Checkbox className="mt-0.5" checked={marcados.has(i.id)} onCheckedChange={() => alternar(i.id)} aria-label={`Enviar ${i.fornecedor}`} />}
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium">{i.fornecedor}</span>
                            <span className="tabular-nums font-semibold">{brl(i.valor)}</span>
                            <span className={`text-xs ${i.atrasado ? "font-semibold text-destructive-text" : "text-muted-foreground"}`}>
                              vence {dataBr(i.vencimento)}{i.atrasado ? " · atrasada" : ""}
                            </span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {i.linha ? <>{tipoDaLinha(i.linha)}{bancoDaLinha(i.linha) ? ` · ${bancoDaLinha(i.linha)}` : ""} · <span className="font-mono">{formatarLinha(i.linha)}</span></>
                              : i.pix ? "Pix copia e cola" : "sem linha digitável nem Pix"}
                          </p>
                          {i.avisos.map(a => <p key={a} className="text-xs text-warning-text">⚠ {a}</p>)}
                          {editando === i.id && (
                            <Input autoFocus className="mt-1 h-8 text-xs" placeholder={i.fornecedor.toLocaleUpperCase("pt-BR")} aria-label={`Linha do beneficiário de ${i.fornecedor}`}
                              value={descricoes[i.id] ?? ""} onChange={e => setDescricoes(d => ({ ...d, [i.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditando(null); }} onBlur={() => setEditando(null)} />
                          )}
                          {descricoes[i.id]?.trim() && editando !== i.id && <p className="text-xs">texto no e-mail: <b>{descricoes[i.id].trim().toLocaleUpperCase("pt-BR")}</b></p>}
                        </div>
                        {i.grupo === "sem_dado" ? (
                          <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs" onClick={() => onAbrirObrigacao(i.id)}><ExternalLink className="h-3 w-3" /> Abrir</Button>
                        ) : (
                          <button type="button" className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted" title="Mudar a linha do beneficiário no e-mail" aria-label={`Mudar o texto de ${i.fornecedor}`} onClick={() => setEditando(i.id)}><Pencil className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <details className="rounded-md border px-3 py-2 text-sm" open={prefs.destinatarios.length === 0}>
              <summary className="cursor-pointer font-medium">
                Mensagem e destinatários <span className="text-xs font-normal text-muted-foreground">· {prefs.destinatarios.length === 0 ? "escolha quem recebe" : `${prefs.destinatarios.length} ${prefs.destinatarios.length === 1 ? "destinatário" : "destinatários"}`}</span>
              </summary>
              <div className="mt-2 space-y-3">
                <div>
                  <p className="mb-1 text-xs font-medium">Para</p>
                  <div className="flex flex-wrap gap-1.5">
                    {prefs.destinatarios.map(d => (
                      <span key={d.email} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs" title={d.email}>
                        {d.nome}
                        <button type="button" aria-label={`Tirar ${d.nome}`} className="rounded-full p-0.5 hover:bg-muted" onClick={() => setPrefs(p => ({ ...p, destinatarios: p.destinatarios.filter(x => x.email !== d.email) }))}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                  <Input className="mt-1.5 h-8 text-xs" placeholder="Buscar no Cadastro de Pessoas (nome) ou digitar um e-mail" aria-label="Adicionar destinatário" value={busca} onChange={e => setBusca(e.target.value)} />
                  {(achadas.length > 0 || emailDigitado) && (
                    <ul className="mt-1 divide-y rounded-md border text-xs">
                      {achadas.map(a => <li key={a.email}><button type="button" className="flex w-full justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-muted/50" onClick={() => adicionar(a)}><span>{a.nome}</span><span className="text-muted-foreground">{a.email}</span></button></li>)}
                      {emailDigitado && <li><button type="button" className="w-full px-2.5 py-1.5 text-left hover:bg-muted/50" onClick={() => adicionar({ nome: emailDigitado, email: emailDigitado })}>Adicionar {emailDigitado}</button></li>}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium">Saudação <span className="font-normal text-muted-foreground">({"{periodo}"} vira bom dia / boa tarde / boa noite)</span></p>
                  <Textarea rows={2} className="text-xs" value={prefs.saudacao ?? SAUDACAO_PADRAO} onChange={e => setPrefs(p => ({ ...p, saudacao: e.target.value }))} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium">Texto de abertura <span className="font-normal text-muted-foreground">(**assim** fica em negrito)</span></p>
                  <Textarea rows={3} className="text-xs" value={prefs.introducao ?? INTRODUCAO_PADRAO} onChange={e => setPrefs(p => ({ ...p, introducao: e.target.value }))} />
                </div>
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={prefs.incluirResumo} onCheckedChange={v => setPrefs(p => ({ ...p, incluirResumo: !!v }))} /> Incluir o quadro-resumo (fornecedor, categoria e valor)</label>
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={prefs.citarSemLinha} onCheckedChange={v => setPrefs(p => ({ ...p, citarSemLinha: !!v }))} /> Citar no fim o que está só na pasta (sem linha digitável)</label>
                <p className="text-[11px] text-muted-foreground">Destinatários e textos ficam guardados neste navegador.</p>
              </div>
            </details>

            <section aria-label="Pré-visualização">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Assunto: <span className="text-foreground">{envio.assunto}</span></p>
              <div className="max-h-64 overflow-y-auto rounded-md border bg-white p-3 text-black" data-previa dangerouslySetInnerHTML={{ __html: envio.html }} />
            </section>

            {temSigiloso && <p role="alert" className="rounded-md border border-warning-line bg-warning-soft/40 px-3 py-2 text-xs text-warning-text">Há prebenda, folha ou Sustento marcados: isto vai no corpo do e-mail.</p>}
          </div>
        )}

        {!carregando && itens!.length > 0 && (
          <footer className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-2 border-t bg-background px-6 py-3">
            <p className="text-sm tabular-nums"><b>{envio.quantidade}</b> {envio.quantidade === 1 ? "pagamento" : "pagamentos"} · <b>{brl(envio.total)}</b></p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={zip} disabled={baixando || envio.quantidade === 0}>
                {baixando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Baixar boletos (ZIP)
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={paraWhatsApp} disabled={envio.quantidade === 0}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={soCopiar} disabled={envio.quantidade === 0}><Copy className="h-3.5 w-3.5" /> Só copiar</Button>
              <Button type="button" variant="gold" size="sm" className="gap-1.5" onClick={copiarEEnviarEmail} disabled={envio.quantidade === 0}><Mail className="h-3.5 w-3.5" /> Copiar e abrir e-mail</Button>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
