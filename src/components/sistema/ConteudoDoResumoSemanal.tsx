// ─── ConteudoDoResumoSemanal — a igreja decide QUEM recebe, O QUE recebe e EM QUE ORDEM o resumo semanal (22/10/2026) ─────────────────────────────────
//
// Pedido dela: o resumo semanal deixa de depender do desenvolvedor. Por perfil (Administração, Tesouraria, Secretaria, Pastoral): o interruptor "recebe", a lista de blocos (liga/desliga e
// sobe/desce) e, para conferir antes de salvar, "Visualizar e-mail" (com os números de agora e a configuração que está na tela, mesmo ainda não salva) e "Enviar teste para mim".
// Os blocos vêm de `lib/resumoSemanalCatalogo` — o MESMO arquivo que a Edge Function usa —, então a tela só oferece o que o e-mail sabe montar. Os "em preparação" aparecem travados.
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Loader2, Mail, Save, Send, Undo2, UserX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import * as sistema from "@/services/sistemaService";
import type { PessoaDoResumo } from "@/services/sistemaService";
import {
  MOTIVO_EM_PREPARACAO, PAPEIS_DO_PERFIL, PERFIS, ROTULO_DO_PERFIL, definicaoDoBloco, type Perfil, type PerfilConfigurado,
} from "@/lib/resumoSemanalCatalogo";
import { alternarBloco, houveMudanca, moverBloco, quantosAtivos, trocarPerfil } from "@/lib/resumoSemanalEdicao";

/** As cinco chamadas ao servidor; a tela usa as reais, e quem monta a tela por fora (pré-visualização, teste) pode injetar as dela. */
export type ServicoDoResumo = Pick<typeof sistema, "carregarConfigDoResumo" | "carregarPessoasDoResumo" | "enviarTesteDoResumo" | "previaDoResumo" | "salvarConfigDoResumo">;

export function ConteudoDoResumoSemanal({ servico = sistema }: { servico?: ServicoDoResumo } = {}) {
  const { carregarConfigDoResumo, carregarPessoasDoResumo, enviarTesteDoResumo, previaDoResumo, salvarConfigDoResumo } = servico;
  const [salvo, setSalvo] = useState<PerfilConfigurado[] | null>(null);
  const [config, setConfig] = useState<PerfilConfigurado[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaDoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<Perfil>("tesouraria");
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<{ carregando: boolean; assunto?: string; html?: string; erro?: string } | null>(null);
  const [testando, setTestando] = useState(false);

  async function carregar() {
    setErro(null);
    try {
      const [c, p] = await Promise.all([carregarConfigDoResumo(), carregarPessoasDoResumo().catch(() => [] as PessoaDoResumo[])]);
      setSalvo(c); setConfig(c); setPessoas(p);
    } catch (e: any) {
      setErro(e?.message ?? "Não foi possível carregar a configuração do conteúdo");
    }
  }
  useEffect(() => { void carregar(); }, []);

  const mudou = useMemo(() => !!config && !!salvo && houveMudanca(config, salvo), [config, salvo]);

  if (erro) {
    return (
      <Card className="shadow-card-soft">
        <CardHeader className="pb-3"><CardTitle className="font-serif flex items-center gap-2 text-lg"><Mail className="w-4 h-4 text-gold" /> Conteúdo do e-mail</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-destructive-text" role="alert">{erro}</p></CardContent>
      </Card>
    );
  }
  if (!config || !salvo) {
    return <div className="flex items-center justify-center h-24 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando o conteúdo…</div>;
  }

  const atual = config.find(p => p.perfil === perfil)!;
  const pessoasDoPerfil = pessoas.filter(p => p.perfil === perfil);

  const blocosParaOServidor = () => atual.blocos;

  async function salvar() {
    setSalvando(true);
    try {
      await salvarConfigDoResumo(config!);
      toast.success("Conteúdo do resumo salvo — vale a partir do próximo envio");
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar");
    } finally { setSalvando(false); }
  }

  async function visualizar() {
    setPrevia({ carregando: true });
    try {
      const r = await previaDoResumo(perfil, blocosParaOServidor());
      setPrevia({ carregando: false, assunto: r.assunto, html: r.html });
    } catch (e: any) {
      setPrevia({ carregando: false, erro: e?.message ?? "Não foi possível montar a prévia" });
    }
  }

  async function testar() {
    setTestando(true);
    try {
      const r = await enviarTesteDoResumo(perfil, blocosParaOServidor());
      toast.success(`Teste enviado para ${r.enviadoPara}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar o teste");
    } finally { setTestando(false); }
  }

  return (
    <Card className="shadow-card-soft" data-conteudo-do-resumo>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif flex items-center gap-2 text-lg"><Mail className="w-4 h-4 text-gold" /> Conteúdo do e-mail</CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Escolha, por perfil, quem recebe e o que entra no resumo — e em que ordem. Quem tem mais de um perfil recebe um e-mail só, com os blocos dos perfis dele somados, sem repetir.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={perfil} onValueChange={v => setPerfil(v as Perfil)}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
            {PERFIS.map(p => {
              const c = config.find(x => x.perfil === p)!;
              return (
                <TabsTrigger key={p} value={p} className="gap-1.5">
                  {ROTULO_DO_PERFIL[p]}
                  <span className={`text-[10px] tabular-nums ${c.ativo ? "" : "line-through opacity-60"}`}>{c.ativo ? quantosAtivos(c) : "off"}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {PERFIS.map(p => (
            <TabsContent key={p} value={p} className="space-y-4 pt-2">
              {p === perfil && (
                <>
                  <label className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium">{ROTULO_DO_PERFIL[p]} recebe o resumo</p>
                      <p className="text-xs text-muted-foreground">
                        {atual.ativo ? "Ligado — quem é deste perfil recebe a cada envio." : "Desligado — ninguém recebe por este perfil."}
                      </p>
                    </div>
                    <Switch checked={atual.ativo} onCheckedChange={v => setConfig(trocarPerfil(config, p, x => ({ ...x, ativo: v })))} aria-label={`${ROTULO_DO_PERFIL[p]} recebe o resumo`} />
                  </label>

                  {/* quem é deste perfil */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Quem é deste perfil <span className="font-normal">(papéis: {PAPEIS_DO_PERFIL[p].join(", ")})</span>
                    </p>
                    {pessoasDoPerfil.length === 0 ? (
                      <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">Ninguém tem este papel agora.</p>
                    ) : pessoasDoPerfil.map((x, i) => (
                      <div key={`${x.nome}-${i}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                        <span className="min-w-0 truncate font-medium">{x.nome}</span>
                        {x.email
                          ? <span className="min-w-0 truncate text-xs text-muted-foreground">{x.email}</span>
                          : <Badge variant="outline" className="shrink-0 gap-1 text-xs bg-warning-soft text-warning-text border-warning-line"><UserX className="w-3 h-3" /> sem e-mail — não recebe</Badge>}
                      </div>
                    ))}
                    {p === "administracao" && (
                      <p className="text-[11px] text-muted-foreground">Além das pessoas acima, o endereço fixo da dona do sistema (guardado em Secrets) recebe como Administração.</p>
                    )}
                  </div>

                  {/* os blocos */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">O que entra no e-mail, na ordem em que aparece</p>
                    <ul className="space-y-1.5" aria-label={`Blocos do perfil ${ROTULO_DO_PERFIL[p]}`}>
                      {[...atual.blocos].sort((a, b) => a.ordem - b.ordem).map((b, i, lista) => {
                        const def = definicaoDoBloco(b.bloco);
                        if (!def) return null;
                        const travado = !def.disponivel;
                        return (
                          <li key={b.bloco} data-bloco={b.bloco} className={`flex items-center gap-2.5 rounded-md border px-3 py-2 ${travado ? "opacity-60 bg-muted/20" : ""}`}>
                            <Switch checked={b.ativo && !travado} disabled={travado} aria-label={`Incluir ${def.titulo}`}
                              onCheckedChange={v => setConfig(trocarPerfil(config, p, x => ({ ...x, blocos: alternarBloco(x.blocos, b.bloco, v) })))} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium flex flex-wrap items-center gap-1.5">
                                {def.titulo}
                                {p === "administracao" && <Badge variant="outline" className="text-[10px] font-normal">{ROTULO_DO_PERFIL[def.grupo]}</Badge>}
                                {travado && <Badge variant="outline" className="text-[10px] font-normal" title={MOTIVO_EM_PREPARACAO}>Em preparação</Badge>}
                              </p>
                              <p className="text-xs text-muted-foreground">{travado ? MOTIVO_EM_PREPARACAO : def.descricao}</p>
                            </div>
                            <div className="flex shrink-0 flex-col">
                              <Button type="button" variant="ghost" size="icon" className="h-5 w-6" disabled={i === 0} aria-label={`Subir ${def.titulo}`}
                                onClick={() => setConfig(trocarPerfil(config, p, x => ({ ...x, blocos: moverBloco(x.blocos, b.bloco, -1) })))}><ArrowUp className="w-3.5 h-3.5" /></Button>
                              <Button type="button" variant="ghost" size="icon" className="h-5 w-6" disabled={i === lista.length - 1} aria-label={`Descer ${def.titulo}`}
                                onClick={() => setConfig(trocarPerfil(config, p, x => ({ ...x, blocos: moverBloco(x.blocos, b.bloco, 1) })))}><ArrowDown className="w-3.5 h-3.5" /></Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={visualizar} disabled={previa?.carregando}>
                      {previa?.carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Visualizar e-mail
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={testar} disabled={testando}>
                      {testando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar teste para mim
                    </Button>
                    <span className="text-[11px] text-muted-foreground">Usa os números de hoje e o que está na tela, mesmo sem salvar. O teste vai só para o seu e-mail cadastrado.</span>
                  </div>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <div className="flex items-center gap-2 border-t pt-3">
          <Button type="button" onClick={salvar} disabled={!mudou || salvando} className="gap-1.5">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar conteúdo
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfig(salvo)} disabled={!mudou || salvando} className="gap-1.5"><Undo2 className="w-4 h-4" /> Descartar</Button>
          {mudou && <span className="text-xs text-warning-text" role="status">Há mudanças ainda não salvas.</span>}
        </div>
      </CardContent>

      <Dialog open={!!previa} onOpenChange={v => { if (!v) setPrevia(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>E-mail do perfil {ROTULO_DO_PERFIL[perfil]}</DialogTitle>
            <DialogDescription>{previa?.assunto ? <>Assunto: <b>{previa.assunto}</b> · nada foi enviado</> : "Como o e-mail ficaria agora"}</DialogDescription>
          </DialogHeader>
          {previa?.carregando && <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Montando…</div>}
          {previa?.erro && <p className="text-sm text-destructive-text" role="alert">{previa.erro}</p>}
          {previa?.html && <iframe title="Prévia do e-mail" srcDoc={previa.html} sandbox="" className="h-[28rem] w-full rounded-md border bg-white" />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
