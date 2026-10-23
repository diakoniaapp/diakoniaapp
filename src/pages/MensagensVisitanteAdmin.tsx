// ─── MensagensVisitanteAdmin — Configurações → Mensagens ao Visitante ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// A mensagem que a igreja manda ao visitante (WhatsApp hoje; e-mail e SMS pela mesma estrutura) deixa de ser texto fixo no código. Aqui a administração escolhe, para cada MOMENTO (primeira visita, segunda
// visita, não retornou, interesse em membresia, infantil, jovem, indicado por ministério) e cada CANAL, o texto de boas-vindas, o texto pastoral, o convite para retornar, o fechamento e quais BLOCOS entram
// (próximos eventos da agenda, redes, endereço, contato, WhatsApp, pedido de oração, plano de leitura). A prévia à direita usa a MESMA função que monta a mensagem de verdade e mostra o RASCUNHO — dá para ver
// e mandar um teste (para si mesma) antes de salvar. Só admin/diakonia/secretaria (RLS das tabelas). Docs: docs/MENSAGENS_AO_VISITANTE.md.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Loader2, MessageCircle, Mail, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { montarLinkWhatsApp } from "@/lib/whatsapp";
import {
  LIMITES, MARCAS_DISPONIVEIS, QUANDO_USA_A_SITUACAO, ROTULO_DA_REDE, ROTULO_DA_SITUACAO, ROTULO_DO_CANAL, SITUACOES, TIPOS_DE_REDE, modeloOuPadrao, modeloPadrao, montarMensagem,
  problemasDaConfig, problemasDoModelo, redesDaIdentidade, urlDaRede, urlSegura, fecharUrl, whatsappDaIdentidade,
  type CanalDaMensagem, type ConfigDaMensagem, type ModeloDaMensagem, type PacoteDeMensagens, type SituacaoDaMensagem, type TipoDeRede,
} from "@/lib/mensagensVisitante";
import * as real from "@/services/mensagensVisitanteService";

/** O que a tela usa do serviço — injetável para teste e para a verificação visual sem banco. */
export interface ServicoDasMensagens {
  carregar: () => Promise<PacoteDeMensagens | null>;
  salvarConfig: (c: ConfigDaMensagem) => Promise<void>;
  salvarModelo: (m: ModeloDaMensagem) => Promise<void>;
  meuContato: () => Promise<{ email: string | null; telefone: string | null }>;
  enviarTesteDeEmail: (r: { modelo: ModeloDaMensagem; config: ConfigDaMensagem; canal: CanalDaMensagem }) => Promise<{ enviadoPara: string }>;
}
const SERVICO_REAL: ServicoDasMensagens = {
  carregar: () => real.carregarMensagens(true), salvarConfig: real.salvarConfig, salvarModelo: real.salvarModelo, meuContato: real.meuContato, enviarTesteDeEmail: real.enviarTesteDeEmail,
};

type Flag = "incluir_eventos" | "incluir_redes" | "incluir_endereco" | "incluir_contato" | "incluir_whatsapp" | "incluir_oracao" | "incluir_leitura";
const BLOCOS: { flag: Flag; titulo: string; descricao: string }[] = [
  { flag: "incluir_eventos", titulo: "Próximos eventos", descricao: "Lista automática, lida da agenda (e some quando a data passa)." },
  { flag: "incluir_redes", titulo: "Redes sociais", descricao: "Só as redes ligadas em “Dados da igreja”." },
  { flag: "incluir_endereco", titulo: "Endereço", descricao: "Onde fica a igreja." },
  { flag: "incluir_contato", titulo: "Contato", descricao: "Telefone e e-mail de contato." },
  { flag: "incluir_whatsapp", titulo: "WhatsApp", descricao: "Link para conversar com a equipe." },
  { flag: "incluir_oracao", titulo: "Pedido de oração", descricao: "Botão com o link do seu formulário de oração (externo, como o Google Forms): o DiakoniaApp ainda não tem formulário próprio." },
  { flag: "incluir_leitura", titulo: "Plano de leitura bíblica", descricao: "Link do plano de leitura." },
];

/** O que falta para o bloco aparecer de verdade (o bloco ligado, mas sem o dado, não entra na mensagem). Nome, redes, endereço e contatos vêm da Identidade da Igreja. */
function faltaParaOBloco(flag: Flag, c: ConfigDaMensagem, pacote: PacoteDeMensagens): string | null {
  const ig = pacote.igreja;
  switch (flag) {
    case "incluir_eventos": return pacote.eventos.length === 0 ? "A agenda não tem eventos próximos agora: o bloco só aparece quando houver." : null;
    case "incluir_redes": return redesDaIdentidade(ig, c.redes_ocultas).length > 0 ? null : "Nenhuma rede para mostrar: cadastre na Identidade da Igreja ou ligue uma em “Redes e links”.";
    case "incluir_endereco": return ig.endereco.trim() ? null : "Falta o endereço na Identidade da Igreja.";
    case "incluir_contato": return ig.telefone.trim() || ig.email.trim() ? null : "Faltam telefone e e-mail na Identidade da Igreja.";
    case "incluir_whatsapp": return whatsappDaIdentidade(ig) ? null : "Falta o WhatsApp (rede “WhatsApp”) na Identidade da Igreja.";
    case "incluir_oracao": return urlSegura(fecharUrl(c.link_pedido_oracao)) ? null : "Falta o link do pedido de oração em “Redes e links”.";
    case "incluir_leitura": return urlSegura(fecharUrl(c.link_plano_leitura)) ? null : "Falta o link do plano de leitura em “Redes e links”.";
  }
}

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const chave = (m: Pick<ModeloDaMensagem, "situacao" | "canal">) => `${m.situacao}/${m.canal}`;

export default function MensagensVisitanteAdmin({ servico = SERVICO_REAL }: { servico?: ServicoDasMensagens }) {
  const { hasRole, rolesCarregados } = useAuth();
  const navigate = useNavigate();
  const [pacote, setPacote] = useState<PacoteDeMensagens | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ConfigDaMensagem | null>(null);
  const [salvoConfig, setSalvoConfig] = useState("");
  const [modelos, setModelos] = useState<Record<string, ModeloDaMensagem>>({});
  const [salvoModelos, setSalvoModelos] = useState<Record<string, string>>({});
  const [situacao, setSituacao] = useState<SituacaoDaMensagem>("primeira_visita");
  const [canal, setCanal] = useState<CanalDaMensagem>("whatsapp");
  const [nomeExemplo, setNomeExemplo] = useState("Maria da Silva");
  const [salvando, setSalvando] = useState<null | "modelo" | "config">(null);
  const [enviando, setEnviando] = useState(false);
  const [contato, setContato] = useState<{ email: string | null; telefone: string | null } | null>(null);

  useEffect(() => { if (rolesCarregados && !hasRole(["admin", "diakonia", "secretaria"])) navigate("/", { replace: true }); }, [rolesCarregados]);   // eslint-disable-line react-hooks/exhaustive-deps

  function aplicar(p: PacoteDeMensagens) {
    setPacote(p); setConfig(p.config); setSalvoConfig(JSON.stringify(p.config));
    const mapa: Record<string, ModeloDaMensagem> = {};
    for (const s of SITUACOES) for (const ca of ["whatsapp", "email"] as const) { const m = modeloOuPadrao(p.modelos, s, ca); mapa[chave(m)] = m; }
    setModelos(mapa); setSalvoModelos(Object.fromEntries(Object.entries(mapa).map(([k, m]) => [k, JSON.stringify(m)])));
  }
  useEffect(() => {
    servico.carregar().then(p => { if (p) aplicar(p); }).catch(() => undefined).finally(() => setCarregando(false));
    servico.meuContato().then(setContato).catch(() => setContato({ email: null, telefone: null }));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const atual = modelos[`${situacao}/${canal}`] ?? modeloPadrao(situacao, canal === "sms" ? "whatsapp" : canal);
  const setModelo = (p: Partial<ModeloDaMensagem>) => setModelos(x => ({ ...x, [chave(atual)]: { ...atual, ...p } }));
  const modeloSujo = JSON.stringify(atual) !== salvoModelos[chave(atual)];
  const configSuja = !!config && JSON.stringify(config) !== salvoConfig;
  const sujos = Object.keys(modelos).filter(k => JSON.stringify(modelos[k]) !== salvoModelos[k]);

  const montada = useMemo(
    () => (config && pacote ? montarMensagem(atual, { config, igreja: pacote.igreja, eventos: pacote.eventos, visitante: { nome: nomeExemplo || "Visitante", culto: "Culto da Manhã" } }) : null),
    [atual, config, pacote, nomeExemplo],
  );

  async function salvarEsteModelo() {
    const problemas = problemasDoModelo(atual);
    if (problemas.length > 0) { toast.error(problemas[0]); return; }
    setSalvando("modelo");
    try { await servico.salvarModelo(atual); setSalvoModelos(s => ({ ...s, [chave(atual)]: JSON.stringify(atual) })); toast.success("Mensagem salva."); }
    catch (e: any) { toast.error(e?.message ?? "Não foi possível salvar"); }
    finally { setSalvando(null); }
  }
  async function salvarOsDados() {
    if (!config) return;
    const problemas = problemasDaConfig(config);
    if (problemas.length > 0) { toast.error(problemas[0] + (problemas.length > 1 ? ` (e mais ${problemas.length - 1})` : "")); return; }
    setSalvando("config");
    try { await servico.salvarConfig(config); setSalvoConfig(JSON.stringify(config)); toast.success("Redes e links salvos. Valem para todas as mensagens."); }
    catch (e: any) { toast.error(e?.message ?? "Não foi possível salvar"); }
    finally { setSalvando(null); }
  }
  async function testarPorEmail() {
    if (!config) return;
    setEnviando(true);
    try { const r = await servico.enviarTesteDeEmail({ modelo: atual, config, canal }); toast.success(`Teste enviado para ${r.enviadoPara}.`); }
    catch (e: any) { toast.error(e?.message ?? "Não foi possível enviar o teste"); }
    finally { setEnviando(false); }
  }
  async function copiar() {
    if (!montada) return;
    try { await navigator.clipboard.writeText(montada.texto); toast.success("Texto copiado."); } catch { toast.error("Não consegui copiar: selecione o texto da prévia."); }
  }

  if (carregando) return <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…</div>;
  if (!pacote || !config || !montada) {
    return <div className="p-8 text-sm text-destructive-text">As mensagens ao visitante ainda não foram criadas no banco (falta aplicar a migration 20261023100000).</div>;
  }

  const linkTeste = contato?.telefone ? montarLinkWhatsApp({ telefone: contato.telefone, texto: montada.texto }) : null;
  const setC = (p: Partial<ConfigDaMensagem>) => setConfig(x => (x ? { ...x, ...p } : x));
  const campoTexto = (id: string, rotulo: string, valor: string, limite: number, onChange: (v: string) => void, linhas = 3, dica?: string) => (
    <div>
      <Label htmlFor={id}>{rotulo}</Label>
      <Textarea id={id} rows={linhas} value={valor} maxLength={limite} onChange={e => onChange(e.target.value)} />
      <p className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground"><span>{dica}</span><span className="tabular-nums">{valor.length}/{limite}</span></p>
    </div>
  );

  return (
    <div>
      <PageHeader title="Mensagens ao Visitante" description="O que a igreja escreve a quem visitou: boas-vindas, próximos passos e como chegar até nós" />

      <div className="p-4 md:p-8">
        <Tabs defaultValue="mensagens">
          <TabsList>
            <TabsTrigger value="mensagens">Mensagens{sujos.length > 0 ? ` · ${sujos.length} não salva${sujos.length > 1 ? "s" : ""}` : ""}</TabsTrigger>
            <TabsTrigger value="igreja">Redes e links{configSuja ? " · não salvo" : ""}</TabsTrigger>
          </TabsList>

          {/* ─── as mensagens ─── */}
          <TabsContent value="mensagens" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
              <div className="min-w-0 space-y-4">
                <Card className="shadow-card-soft">
                  <CardContent className="space-y-3 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="msg-situacao">Momento</Label>
                        <select id="msg-situacao" className={SELECT} value={situacao} onChange={e => setSituacao(e.target.value as SituacaoDaMensagem)}>
                          {SITUACOES.map(s => <option key={s} value={s}>{ROTULO_DA_SITUACAO[s]}{sujos.some(k => k.startsWith(`${s}/`)) ? " •" : ""}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label>Canal</Label>
                        <div className="mt-1 flex gap-1" role="tablist" aria-label="Canal">
                          {(["whatsapp", "email"] as const).map(c => (
                            <Button key={c} type="button" size="sm" variant={canal === c ? "default" : "outline"} className="h-9 flex-1 gap-1.5" role="tab" aria-selected={canal === c} onClick={() => setCanal(c)}>
                              {c === "whatsapp" ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />} {ROTULO_DO_CANAL[c]}
                            </Button>
                          ))}
                          <Button type="button" size="sm" variant="outline" className="h-9 flex-1" disabled title="Ainda não disponível">SMS</Button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground" data-quando>
                      <b>Quando é usada:</b> {QUANDO_USA_A_SITUACAO[situacao]}{situacao === "nao_retornou" ? ` Prazo atual: ${config.dias_sem_retorno} dias (muda em “Redes e links”).` : ""}
                    </p>
                    <label className="flex items-center gap-2 text-sm"><Switch checked={atual.ativo} onCheckedChange={v => setModelo({ ativo: v })} aria-label="Usar esta mensagem" /> Usar esta mensagem {!atual.ativo && <span className="text-xs text-muted-foreground">(desligada: o sistema volta ao texto antigo)</span>}</label>
                  </CardContent>
                </Card>

                <Card className="shadow-card-soft">
                  <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">Texto</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {canal === "email" && (
                      <div><Label htmlFor="msg-assunto">Assunto do e-mail</Label><Input id="msg-assunto" maxLength={LIMITES.assunto} value={atual.assunto} onChange={e => setModelo({ assunto: e.target.value })} /></div>
                    )}
                    {campoTexto("msg-abertura", "Mensagem de boas-vindas", atual.abertura, LIMITES.abertura, v => setModelo({ abertura: v }), 2)}
                    {campoTexto("msg-pastoral", "Texto pastoral", atual.texto_pastoral, LIMITES.texto_pastoral, v => setModelo({ texto_pastoral: v }), 4, "Uma linha em branco separa os parágrafos.")}
                    {campoTexto("msg-convite", "Convite para retorno", atual.convite_retorno, LIMITES.convite_retorno, v => setModelo({ convite_retorno: v }), 2, "Vem antes da lista de próximos eventos.")}
                    {campoTexto("msg-fechamento", "Fechamento", atual.fechamento, LIMITES.fechamento, v => setModelo({ fechamento: v }), 2, "A assinatura (em “Redes e links”) vem depois.")}
                    <p className="text-xs text-muted-foreground">
                      Marcas que viram o dado do visitante: {MARCAS_DISPONIVEIS.map(m => <code key={m.marca} className="mr-2 rounded bg-muted px-1" title={m.descricao}>{m.marca}</code>)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="shadow-card-soft">
                  <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">O que entra na mensagem</CardTitle></CardHeader>
                  <CardContent className="divide-y">
                    {BLOCOS.map(b => {
                      const falta = atual[b.flag] ? faltaParaOBloco(b.flag, config, pacote) : null;
                      return (
                        <div key={b.flag} className="flex items-start gap-3 py-2" data-bloco={b.flag}>
                          <Switch checked={atual[b.flag]} onCheckedChange={v => setModelo({ [b.flag]: v } as Partial<ModeloDaMensagem>)} aria-label={b.titulo} className="mt-0.5" />
                          <div className="min-w-0 text-sm">
                            <p className="font-medium">{b.titulo}</p>
                            <p className="text-xs text-muted-foreground">{b.descricao}</p>
                            {falta && <p className="text-xs text-warning-text" data-falta>{falta}</p>}
                          </div>
                        </div>
                      );
                    })}
                    <p className="pt-2 text-xs text-muted-foreground">Os próximos eventos vêm da Agenda, escolhidos em <Link to="/admin/boas-vindas-visitante" className="underline">Boas-vindas ao Visitante</Link>.</p>
                  </CardContent>
                </Card>
              </div>

              {/* ─── a prévia ─── */}
              <div className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
                <Card className="shadow-card-soft">
                  <CardHeader className="pb-2"><CardTitle className="font-serif text-lg">Prévia — {ROTULO_DO_CANAL[canal]}</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div><Label htmlFor="msg-nome">Nome do visitante na prévia</Label><Input id="msg-nome" value={nomeExemplo} onChange={e => setNomeExemplo(e.target.value)} /></div>
                    {canal === "email" && <p className="text-sm" data-assunto><span className="text-muted-foreground">Assunto: </span><b>{montada.assunto}</b></p>}
                    {canal === "whatsapp"
                      ? <div data-previa className="whitespace-pre-wrap break-words rounded-lg rounded-tl-none bg-success-soft p-3 text-sm leading-relaxed text-foreground">{montada.texto}</div>
                      // o HTML vem de `montarMensagem`, que escapa todo texto da configuração e só aceita links http(s)
                      : <div data-previa className="max-h-[480px] overflow-auto rounded-lg border" dangerouslySetInnerHTML={{ __html: montada.html ?? "" }} />}
                    <p className="text-xs text-muted-foreground">Mostra o que está na tela agora, mesmo sem salvar.</p>
                  </CardContent>
                </Card>

                <Card className="shadow-card-soft">
                  <CardContent className="space-y-2 pt-4">
                    <Button className="w-full gap-2" onClick={salvarEsteModelo} disabled={salvando !== null || !modeloSujo}>
                      {salvando === "modelo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {modeloSujo ? "Salvar esta mensagem" : "Mensagem salva"}
                    </Button>
                    <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setModelo({ ...modeloPadrao(situacao, canal === "sms" ? "whatsapp" : canal), ativo: atual.ativo })}>
                      <RotateCcw className="h-4 w-4" /> Restaurar o texto de partida
                    </Button>
                    <div className="border-t pt-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mandar um teste para mim</p>
                      {canal === "email" ? (
                        <>
                          <Button type="button" variant="outline" className="w-full gap-2" onClick={testarPorEmail} disabled={enviando || !contato?.email}>
                            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar e-mail de teste
                          </Button>
                          <p className="mt-1 text-xs text-muted-foreground">{contato?.email ? `Vai para ${contato.email}, com o rascunho que está na tela.` : "A sua ficha não tem e-mail: cadastre em Pessoas para receber o teste."}</p>
                        </>
                      ) : (
                        <div className="flex gap-2">
                          <Button asChild={!!linkTeste} type="button" variant="outline" className="flex-1 gap-2" disabled={!linkTeste}>
                            {linkTeste ? <a href={linkTeste} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> Abrir no meu WhatsApp</a> : <span><MessageCircle className="h-4 w-4" /> Abrir no meu WhatsApp</span>}
                          </Button>
                          <Button type="button" variant="outline" className="gap-2" onClick={copiar}><Copy className="h-4 w-4" /> Copiar</Button>
                        </div>
                      )}
                      {canal === "whatsapp" && !contato?.telefone && <p className="mt-1 text-xs text-muted-foreground">A sua ficha não tem telefone: use “Copiar” e cole no WhatsApp.</p>}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ─── redes, links e prazos ─── */}
          <TabsContent value="igreja" className="mt-4">
            <div className="grid max-w-3xl gap-4">
              <Card className="shadow-card-soft" data-identidade>
                <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">Vem da Identidade da Igreja</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-xs text-muted-foreground">Nome, site, redes, WhatsApp, endereço, telefone e e-mail são cadastrados <b>uma vez só</b>, na Identidade da Igreja, e valem para todas as mensagens.</p>
                  <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr]">
                    {([
                      ["Igreja", pacote.igreja.nome], ["Site", pacote.igreja.site], ["WhatsApp", whatsappDaIdentidade(pacote.igreja) ?? ""], ["Endereço", pacote.igreja.endereco],
                      ["Telefone", pacote.igreja.telefone], ["E-mail", pacote.igreja.email],
                    ] as const).map(([rotulo, valor]) => (
                      <div key={rotulo} className="contents">
                        <dt className="text-muted-foreground">{rotulo}</dt>
                        <dd className={valor ? "break-words" : "text-warning-text"} data-identidade-campo={rotulo}>{valor || "não cadastrado"}</dd>
                      </div>
                    ))}
                  </dl>
                  <Button asChild variant="outline" size="sm" className="mt-1"><Link to="/admin/identidade">Editar na Identidade da Igreja</Link></Button>
                </CardContent>
              </Card>

              <Card className="shadow-card-soft">
                <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">Redes que aparecem nas mensagens</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">Os endereços vêm da Identidade. Aqui você só escolhe quais aparecem; cada mensagem ainda pode ligar ou desligar o bloco inteiro.</p>
                  {TIPOS_DE_REDE.map(tipo => {
                    const url = urlDaRede(tipo, tipo === "site" ? pacote.igreja.site : pacote.igreja.redes.find(r => r.plataforma === tipo)?.url);
                    const mostra = !config.redes_ocultas.includes(tipo);
                    return (
                      <div key={tipo} className="flex items-center gap-3" data-rede={tipo}>
                        <Switch checked={!!url && mostra} disabled={!url} aria-label={ROTULO_DA_REDE[tipo]}
                          onCheckedChange={v => setC({ redes_ocultas: (v ? config.redes_ocultas.filter(t => t !== tipo) : [...config.redes_ocultas, tipo]) as TipoDeRede[] })} />
                        <span className="w-24 shrink-0 text-sm font-medium">{ROTULO_DA_REDE[tipo]}</span>
                        <span className={"min-w-0 truncate text-xs " + (url ? "text-muted-foreground" : "text-warning-text")}>{url ?? "não cadastrada na Identidade"}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="shadow-card-soft">
                <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">Assinatura e links úteis</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {campoTexto("ig-assinatura", "Assinatura", config.assinatura, LIMITES.assinatura, v => setC({ assinatura: v }), 3, "Fecha todas as mensagens. {{igreja}} vira o nome da Identidade.")}
                  <div><Label htmlFor="ig-oracao">Formulário de pedido de oração (link externo)</Label><Input id="ig-oracao" value={config.link_pedido_oracao} placeholder="https://…" onChange={e => setC({ link_pedido_oracao: e.target.value })} /></div>
                  <div><Label htmlFor="ig-leitura">Plano de leitura bíblica</Label><Input id="ig-leitura" value={config.link_plano_leitura} placeholder="https://…" onChange={e => setC({ link_plano_leitura: e.target.value })} /></div>
                </CardContent>
              </Card>

              <Card className="shadow-card-soft">
                <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">Quando e quantos</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <div><Label htmlFor="ig-dias">“Não retornou” depois de (dias)</Label><Input id="ig-dias" type="number" min={3} max={90} value={config.dias_sem_retorno} onChange={e => setC({ dias_sem_retorno: Number(e.target.value) })} /></div>
                  <div><Label htmlFor="ig-max">Eventos na mensagem</Label><Input id="ig-max" type="number" min={1} max={10} value={config.eventos_max} onChange={e => setC({ eventos_max: Number(e.target.value) })} /></div>
                  <div><Label htmlFor="ig-tit">Título da lista de eventos</Label><Input id="ig-tit" maxLength={LIMITES.titulo_eventos} value={config.titulo_eventos} onChange={e => setC({ titulo_eventos: e.target.value })} /></div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={salvarOsDados} disabled={salvando !== null || !configSuja} className="gap-2">
                  {salvando === "config" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {configSuja ? "Salvar redes e links" : "Redes e links salvos"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
