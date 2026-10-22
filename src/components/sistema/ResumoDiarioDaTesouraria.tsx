// ─── ResumoDiarioDaTesouraria — liga, agenda e confere o e-mail diário de pagamentos (Fase 1, 22/10/2026) ───────────────────────────────────────────
//
// Pedido dela: o tesoureiro recebe todo dia, por e-mail, o que precisa para pagar — sem abrir o sistema. INTERRUPTOR PRÓPRIO, independente do resumo semanal: quem liga um não liga o outro.
// Aqui: ligar/desligar, os dias e o horário (Brasília), quantos dias à frente entram, se envia quando não há nada a pagar, e os DESTINATÁRIOS (pessoas do Cadastro de Pessoas com e-mail — os
// tesoureiros não precisam ter login). "Visualizar e-mail" e "Enviar teste para mim" conferem com os dados de hoje ANTES de ligar; o teste vai só para o e-mail cadastrado de quem está logado.
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, Eye, Loader2, Plus, Save, Search, Send, Undo2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import * as sistema from "@/services/sistemaService";
import type { PreviaDoDiario, ResumoDiarioConfig, ResumoDiarioDestinatario, ResumoDiarioStatus } from "@/services/sistemaService";
import { buscarPessoasComEmail, type Destinatario } from "@/services/envioDePagamentosService";
import { DIAS_CURTOS, alternarDia, descreverAgenda, houveMudancaNoDiario, problemasDoDiario, rotuloDaJanela } from "@/lib/resumoDiarioConfig";

/** As chamadas ao servidor; a tela usa as reais, e quem monta a tela por fora (teste, pré-visualização) pode injetar as dela. */
export interface ServicoDoDiario {
  carregarStatusResumoDiario: typeof sistema.carregarStatusResumoDiario;
  salvarResumoDiario: typeof sistema.salvarResumoDiario;
  previaDoResumoDiario: typeof sistema.previaDoResumoDiario;
  enviarTesteDoResumoDiario: typeof sistema.enviarTesteDoResumoDiario;
  buscarPessoasComEmail: (termo: string) => Promise<Destinatario[]>;
}
const SERVICO_REAL: ServicoDoDiario = {
  carregarStatusResumoDiario: sistema.carregarStatusResumoDiario, salvarResumoDiario: sistema.salvarResumoDiario,
  previaDoResumoDiario: sistema.previaDoResumoDiario, enviarTesteDoResumoDiario: sistema.enviarTesteDoResumoDiario, buscarPessoasComEmail,
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ResumoDiarioDaTesouraria({ servico = SERVICO_REAL }: { servico?: ServicoDoDiario } = {}) {
  const [status, setStatus] = useState<ResumoDiarioStatus | null>(null);
  const [config, setConfig] = useState<ResumoDiarioConfig | null>(null);
  const [destinatarios, setDestinatarios] = useState<ResumoDiarioDestinatario[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [previa, setPrevia] = useState<{ carregando: boolean; dados?: PreviaDoDiario; erro?: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Destinatario[]>([]);
  const sequencia = useRef(0);

  async function carregar() {
    setErro(null);
    try {
      const s = await servico.carregarStatusResumoDiario();
      setStatus(s); setConfig(s.config); setDestinatarios(s.destinatarios);
    } catch (e: any) { setErro(e?.message ?? "Não foi possível carregar o resumo diário"); }
  }
  useEffect(() => { void carregar(); }, []);

  // busca de pessoas do Cadastro (com e-mail), com uma pequena espera entre as teclas
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) { setAchados([]); return; }
    const minha = ++sequencia.current;
    const t = window.setTimeout(() => {
      servico.buscarPessoasComEmail(termo).then(r => { if (minha === sequencia.current) setAchados(r); }).catch(() => { if (minha === sequencia.current) setAchados([]); });
    }, 250);
    return () => window.clearTimeout(t);
  }, [busca]);

  const salvo = useMemo(() => (status ? { config: status.config, destinatarios: status.destinatarios } : null), [status]);
  const mudou = !!config && !!salvo && houveMudancaNoDiario({ config, destinatarios }, salvo);
  const problemas = config ? problemasDoDiario(config, destinatarios) : [];

  if (erro) {
    return (
      <Card className="shadow-card-soft">
        <CardHeader className="pb-3"><CardTitle className="font-serif flex items-center gap-2 text-lg"><CalendarClock className="w-4 h-4 text-gold" /> Resumo diário da Tesouraria</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-destructive-text" role="alert">{erro}</p></CardContent>
      </Card>
    );
  }
  if (!config || !status) return <div className="flex items-center justify-center h-24 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando o resumo diário…</div>;

  const mudar = (parcial: Partial<ResumoDiarioConfig>) => setConfig({ ...config, ...parcial });
  const jaEsta = (email: string) => destinatarios.some(d => d.email.trim().toLowerCase() === email.trim().toLowerCase());
  const adicionar = (p: Destinatario) => { if (!jaEsta(p.email)) setDestinatarios([...destinatarios, { nome: p.nome, email: p.email }]); setBusca(""); setAchados([]); };

  async function salvar() {
    setSalvando(true);
    try {
      await servico.salvarResumoDiario(config!, destinatarios);
      toast.success(config!.ativo ? "Resumo diário salvo e LIGADO" : "Resumo diário salvo (desligado)");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível salvar"); } finally { setSalvando(false); }
  }
  async function visualizar() {
    setPrevia({ carregando: true });
    try { setPrevia({ carregando: false, dados: await servico.previaDoResumoDiario(config!.incluir_sigilosos) }); }
    catch (e: any) { setPrevia({ carregando: false, erro: e?.message ?? "Não foi possível montar a prévia" }); }
  }
  async function testar() {
    setTestando(true);
    try { const r = await servico.enviarTesteDoResumoDiario(config!.incluir_sigilosos); toast.success(`Teste enviado para ${r.enviadoPara}`); }
    catch (e: any) { toast.error(e?.message ?? "Não foi possível enviar o teste"); } finally { setTestando(false); }
  }

  return (
    <Card className="shadow-card-soft" data-resumo-diario>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif flex items-center gap-2 text-lg"><CalendarClock className="w-4 h-4 text-gold" /> Resumo diário da Tesouraria</CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Todo dia, por e-mail, o que há para pagar: favorecido, valor, vencimento, linha digitável, Pix e <b>de onde veio cada dado</b> (🧾 documento · 💳 Pix do documento · 👤 Pix do cadastro).
          É independente do resumo semanal. Nesta primeira etapa os documentos ainda não vão anexados.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5 cursor-pointer">
          <div>
            <p className="text-sm font-medium">Resumo diário</p>
            <p className="text-xs text-muted-foreground">{config.ativo ? `Ligado — ${descreverAgenda(config)}` : "Desligado — nada é enviado"}</p>
          </div>
          <Switch checked={config.ativo} onCheckedChange={v => mudar({ ativo: v })} aria-label="Resumo diário" />
        </label>

        <div className="space-y-1.5">
          <Label className="text-xs">Dias do envio</Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
            {DIAS_CURTOS.map((nome, d) => {
              const ligado = config.dias_semana.includes(d);
              return (
                <button key={d} type="button" aria-pressed={ligado} onClick={() => mudar({ dias_semana: alternarDia(config.dias_semana, d, !ligado) })}
                  className={`h-8 min-w-[3rem] rounded-md border px-2 text-xs font-medium ${ligado ? "bg-gold text-gold-foreground border-gold" : "bg-card text-muted-foreground hover:bg-muted"}`}>{nome}</button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><Label className="text-xs">Hora</Label><Input type="number" min={0} max={23} value={config.hora} onChange={e => mudar({ hora: Number(e.target.value) })} aria-label="Hora do envio" /></div>
          <div><Label className="text-xs">Minuto</Label><Input type="number" min={0} max={59} value={config.minuto} onChange={e => mudar({ minuto: Number(e.target.value) })} aria-label="Minuto do envio" /></div>
          <div className="col-span-2">
            <Label className="text-xs">O que entra</Label>
            <select value={config.janela_dias} onChange={e => mudar({ janela_dias: Number(e.target.value) })} aria-label="O que entra" className="h-10 w-full rounded-md border bg-background px-2 text-sm">
              {[0, 1, 2, 3, 5, 7, 14].map(n => <option key={n} value={n}>{rotuloDaJanela(n)}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Horário de Brasília. Fora do e-mail, sempre: pagamento automático (débito, Pix recorrente, transferência programada) e reembolso.</p>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={config.enviar_sem_pagamentos} onChange={e => mudar({ enviar_sem_pagamentos: e.target.checked })} />
          Enviar mesmo quando não há nada a pagar <span className="text-xs text-muted-foreground">(“Não há pagamentos em aberto para hoje.”)</span>
        </label>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="mt-1" checked={config.incluir_sigilosos} onChange={e => mudar({ incluir_sigilosos: e.target.checked })} aria-label="Incluir pagamentos sigilosos" />
          <span>Incluir os pagamentos sigilosos <span className="text-xs text-muted-foreground">(prebenda, folha, Sustento, RPA — vêm marcados 🔒 e com o aviso de não encaminhar). Desligue se algum destinatário não deve ver remuneração.</span></span>
        </label>

        {/* destinatários */}
        <div className="space-y-1.5">
          <Label className="text-xs">Quem recebe <span className="font-normal text-muted-foreground">(pessoas do Cadastro de Pessoas com e-mail; não precisam ter login)</span></Label>
          {destinatarios.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">Ninguém ainda. Busque o nome abaixo para adicionar.</p>
          ) : destinatarios.map(d => (
            <div key={d.email} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm" data-destinatario={d.email}>
              <div className="min-w-0"><p className="truncate font-medium">{d.nome}</p><p className="truncate text-xs text-muted-foreground">{d.email}</p></div>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Remover ${d.nome}`} onClick={() => setDestinatarios(destinatarios.filter(x => x.email !== d.email))}><X className="w-4 h-4" /></Button>
            </div>
          ))}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-muted-foreground" aria-hidden />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa pelo nome (com e-mail cadastrado)…" className="pl-8" aria-label="Buscar destinatário" />
          </div>
          {achados.length > 0 && (
            <ul className="rounded-md border divide-y" aria-label="Pessoas encontradas">
              {achados.map(p => (
                <li key={p.email} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0"><p className="truncate">{p.nome}</p><p className="truncate text-xs text-muted-foreground">{p.email}</p></div>
                  {jaEsta(p.email) ? <Badge variant="outline" className="text-xs">já está</Badge>
                    : <Button type="button" size="sm" variant="outline" className="h-7 gap-1" aria-label={`Adicionar ${p.nome}`} onClick={() => adicionar(p)}><Plus className="w-3.5 h-3.5" /> Adicionar</Button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {problemas.length > 0 && <ul className="space-y-0.5" role="alert">{problemas.map(p => <li key={p} className="text-xs text-destructive-text">{p}</li>)}</ul>}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button type="button" onClick={salvar} disabled={!mudou || salvando || problemas.length > 0} className="gap-1.5">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar resumo diário
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setConfig(status.config); setDestinatarios(status.destinatarios); }} disabled={!mudou || salvando} className="gap-1.5"><Undo2 className="w-4 h-4" /> Descartar</Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={visualizar} disabled={previa?.carregando}>
            {previa?.carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Visualizar e-mail
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={testar} disabled={testando}>
            {testando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar teste para mim
          </Button>
          {mudou && <span className="text-xs text-warning-text" role="status">Há mudanças ainda não salvas.</span>}
        </div>
        <p className="text-[11px] text-muted-foreground">Visualizar e testar usam os dados de hoje (o que vence hoje e o que está atrasado). O teste vai só para o seu e-mail cadastrado e não conta como envio.</p>

        {/* estado do agendamento e últimas execuções */}
        <div className="space-y-1.5 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Agendamento e histórico</p>
          <p className="text-xs text-muted-foreground" data-agendamento>
            {status.agendamento_existe ? (status.agendamento_ativo ? `Ativo no servidor — ${descreverAgenda(status.config)} (Brasília).` : "Pausado no servidor.") : "O agendamento ainda não foi criado no banco."}
            {status.ultimo_envio?.em ? ` Último envio: ${fmt(status.ultimo_envio.em)}${status.ultimo_envio.itens ? ` · ${status.ultimo_envio.itens} ${status.ultimo_envio.itens === 1 ? "pagamento" : "pagamentos"}` : ""}.` : " Nenhum envio ainda."}
          </p>
          {status.execucoes.slice(0, 5).map((e, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-md border px-3 py-1.5 text-xs">
              {e.status === "succeeded" ? <CheckCircle2 className="w-3.5 h-3.5 text-success-text shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-destructive-text shrink-0" />}
              <span className="text-muted-foreground shrink-0">{fmt(e.inicio)}</span><span className="truncate">{e.mensagem ?? e.status}</span>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={!!previa} onOpenChange={v => { if (!v) setPrevia(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>E-mail diário da Tesouraria</DialogTitle>
            <DialogDescription>
              {previa?.dados
                ? <>Assunto: <b>{previa.dados.assunto}</b> · nada foi enviado{previa.dados.total.quantidade > 0 ? ` · ${previa.dados.total.quantidade} para pagar (${brl(previa.dados.total.valor)})` : ""}{previa.dados.contagem.conferir > 0 ? ` · ${previa.dados.contagem.conferir} a conferir` : ""}{previa.dados.contagem.semMeio > 0 ? ` · ${previa.dados.contagem.semMeio} sem meio automático` : ""}</>
                : "Como o e-mail sairia agora"}
            </DialogDescription>
          </DialogHeader>
          {previa?.carregando && <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Montando…</div>}
          {previa?.erro && <p className="text-sm text-destructive-text" role="alert">{previa.erro}</p>}
          {previa?.dados?.html && <iframe title="Prévia do e-mail diário" srcDoc={previa.dados.html} sandbox="" className="h-[30rem] w-full rounded-md border bg-white" />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
