// ─── BoasVindasVisitanteAdmin — Configurações → Boas-vindas ao Visitante ──────────────────────────────────────
//
// O que o visitante vê logo depois de concluir o AutoCadastro (/bemvindo): título, mensagem, banner, canais da igreja
// (Instagram, Facebook, YouTube, Site, WhatsApp — cada um opcional), links e próximos encontros. A prévia à direita usa a
// MESMA peça e a MESMA regra de filtro do banco: o que aparece ali é o que o visitante verá, depois de salvar.
// Só admin/diakonia/secretaria (RLS de `visitante_boasvindas`). Docs: docs/AUTOCADASTRO_UX_MOBILE.md.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { CampoData } from "@/components/CampoData";
import { BoasVindasVisitante } from "@/components/visitante/BoasVindasVisitante";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { hojeLocal, hojeMaisDias } from "@/lib/data";
import {
  CANAIS, GRUPOS_DA_AGENDA, alternarItem, itemVisivel, paraPublica, problemasDaConfig,
  type Canal, type ConfigBoasVindas, type Encontro, type ItemAgenda, type LinkExtra, type ModoEncontros,
} from "@/lib/boasVindasVisitante";
import {
  apagarBanner, carregarAgenda, carregarConfig, enviarBanner, prepararBanner, salvarConfig,
} from "@/services/boasVindasVisitanteService";

const ENCONTRO_VAZIO: Encontro = { titulo: "", quando: "", data: "", local: "", link: "", ativo: true };
const daquiA30 = hojeMaisDias(30);   // série que termina antes disso ganha um aviso

function mover<T>(lista: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= lista.length) return lista;
  const n = [...lista];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

export default function BoasVindasVisitanteAdmin() {
  const { hasRole, rolesCarregados } = useAuth();
  const navigate = useNavigate();
  const [c, setC] = useState<ConfigBoasVindas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviandoBanner, setEnviandoBanner] = useState(false);
  const [bannerSalvo, setBannerSalvo] = useState<string | null>(null);        // o que está no banco hoje
  const [bannerNaoSalvo, setBannerNaoSalvo] = useState<string | null>(null);  // enviado nesta sessão, ainda sem salvar
  const [agenda, setAgenda] = useState<ItemAgenda[] | null>(null);
  const [erroAgenda, setErroAgenda] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  // só depois de os papéis carregarem: `roles` vazio também quer dizer "ainda não carregou" (ao abrir o endereço direto, isto mandava a administradora para a Home)
  useEffect(() => { if (rolesCarregados && !hasRole(["admin", "diakonia", "secretaria"])) navigate("/", { replace: true }); }, [rolesCarregados]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    carregarConfig()
      .then(r => { setC(r); setBannerSalvo(r?.banner_url ?? null); if (!r) setErroCarga("A configuração ainda não foi criada no banco."); })
      .catch(e => setErroCarga(e?.message ?? "Não foi possível carregar."))
      .finally(() => setCarregando(false));
  }, []);

  // a agenda (cultos, EBD, programações recorrentes e eventos especiais), lida do banco já expandida e na ordem do visitante
  useEffect(() => {
    carregarAgenda().then(setAgenda).catch(e => { setAgenda([]); setErroAgenda(e?.message ?? "Não foi possível ler a agenda."); });
  }, []);

  const previa = useMemo(() => (c ? paraPublica(c, hojeLocal(), agenda ?? []) : null), [c, agenda]);
  const set = (p: Partial<ConfigBoasVindas>) => setC(x => (x ? { ...x, ...p } : x));
  const setCanal = (i: number, p: Partial<Canal>) => set({ canais: c!.canais.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const setLink = (i: number, p: Partial<LinkExtra>) => set({ links: c!.links.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const setEncontro = (i: number, p: Partial<Encontro>) => set({ eventos: c!.eventos.map((x, k) => (k === i ? { ...x, ...p } : x)) });

  async function trocarBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo || !c) return;
    setEnviandoBanner(true);
    try {
      const url = await enviarBanner(await prepararBanner(arquivo));
      if (bannerNaoSalvo) void apagarBanner(bannerNaoSalvo);   // o envio anterior, que nunca chegou a ser salvo
      setBannerNaoSalvo(url);
      set({ banner_url: url });
    } catch (err: any) { toast.error(err?.message ?? "Não foi possível enviar a imagem"); }
    finally { setEnviandoBanner(false); }
  }

  async function salvar() {
    if (!c) return;
    const problemas = problemasDaConfig(c);
    if (problemas.length > 0) { toast.error(problemas[0] + (problemas.length > 1 ? ` (e mais ${problemas.length - 1})` : "")); return; }
    setSalvando(true);
    try {
      await salvarConfig(c);
      if (bannerSalvo && bannerSalvo !== c.banner_url) void apagarBanner(bannerSalvo);   // trocou ou tirou: o antigo não serve mais
      setBannerSalvo(c.banner_url); setBannerNaoSalvo(null);
      toast.success("Boas-vindas salvas. O visitante já vê a nova tela.");
    } catch (err: any) { toast.error(err?.message ?? "Não foi possível salvar"); }
    finally { setSalvando(false); }
  }

  if (carregando) return <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…</div>;
  if (!c || !previa) return <div className="p-8 text-sm text-destructive-text">{erroCarga ?? "Sem configuração."}</div>;

  return (
    <div>
      <PageHeader
        title="Boas-vindas ao Visitante"
        description="A tela que o visitante vê depois de concluir o cadastro pelo QR Code"
        actions={<Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar</Button>}
      />

      <div className="grid gap-6 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">

          <Card className="shadow-card-soft">
            <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">Mensagem</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label htmlFor="bv-titulo">Título</Label><Input id="bv-titulo" maxLength={120} value={c.titulo} onChange={e => set({ titulo: e.target.value })} /></div>
              <div>
                <Label htmlFor="bv-msg">Mensagem</Label>
                <Textarea id="bv-msg" rows={4} maxLength={800} value={c.mensagem} onChange={e => set({ mensagem: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">Uma linha em branco separa os parágrafos. O visitante vê no celular, então prefira poucas linhas.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card-soft">
            <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">Banner</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {c.banner_url
                ? <img src={c.banner_url} alt="Banner atual" className="max-h-40 w-full rounded-md border object-cover" />
                : <p className="text-sm text-muted-foreground">Sem banner: a tela mostra só a mensagem.</p>}
              <div className="flex flex-wrap gap-2">
                <input ref={arquivoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={trocarBanner} />
                <Button type="button" variant="outline" className="gap-2" disabled={enviandoBanner} onClick={() => arquivoRef.current?.click()}>
                  {enviandoBanner ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {c.banner_url ? "Trocar imagem" : "Escolher imagem"}
                </Button>
                {c.banner_url && <Button type="button" variant="ghost" className="gap-2" onClick={() => set({ banner_url: null })}><Trash2 className="h-4 w-4" /> Tirar banner</Button>}
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG ou WebP. A imagem é reduzida automaticamente (até 2 MB). Fica melhor larga, em proporção parecida com 2 por 1.</p>
            </CardContent>
          </Card>

          <Card className="shadow-card-soft">
            <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">Redes sociais e canais</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Cada canal é opcional: só aparece para o visitante o que estiver ligado e com endereço. Pode digitar @usuário, o nome da página ou o endereço completo.</p>
              {c.canais.map((x, i) => {
                const info = CANAIS.find(k => k.tipo === x.tipo)!;
                return (
                  <div key={x.tipo} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor={`bv-canal-${x.tipo}`} className="text-sm font-medium">{info.rotulo}</Label>
                      <Switch checked={x.ativo} onCheckedChange={v => setCanal(i, { ativo: v })} aria-label={`Mostrar ${info.rotulo}`} />
                    </div>
                    {x.tipo === "whatsapp" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input id="bv-canal-whatsapp" inputMode="tel" placeholder={info.dica} value={x.numero ?? ""} onChange={e => setCanal(i, { numero: e.target.value })} />
                        <Input placeholder="Mensagem pronta (opcional)" maxLength={200} value={x.mensagem ?? ""} onChange={e => setCanal(i, { mensagem: e.target.value })} />
                      </div>
                    ) : (
                      <Input id={`bv-canal-${x.tipo}`} placeholder={info.dica} value={x.url} onChange={e => setCanal(i, { url: e.target.value })} />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="shadow-card-soft">
            <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">Links</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Botões extras, como “Conheça os ministérios” ou “Pedido de oração”.</p>
              {c.links.map((l, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Input aria-label="Texto do botão" placeholder="Texto do botão" maxLength={60} value={l.rotulo} onChange={e => setLink(i, { rotulo: e.target.value })} />
                    <Switch checked={l.ativo} onCheckedChange={v => setLink(i, { ativo: v })} aria-label="Mostrar este link" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Input aria-label="Endereço do link" placeholder="www.suaigreja.org.br/ministerios" value={l.url} onChange={e => setLink(i, { url: e.target.value })} />
                    <Button type="button" size="icon" variant="ghost" aria-label="Subir" onClick={() => set({ links: mover(c.links, i, -1) })}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Descer" onClick={() => set({ links: mover(c.links, i, 1) })}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Remover link" onClick={() => set({ links: c.links.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
              {c.links.length < 12 && (
                <Button type="button" variant="outline" className="w-full gap-2 border-dashed" onClick={() => set({ links: [...c.links, { rotulo: "", url: "", ativo: true }] })}><Plus className="h-4 w-4" /> Adicionar link</Button>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card-soft">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="font-serif text-lg">Próximos encontros</CardTitle>
                <div className="flex items-center gap-2 text-sm"><Label htmlFor="bv-ev-mostrar" className="font-normal">Mostrar</Label><Switch id="bv-ev-mostrar" checked={c.eventos_mostrar} onCheckedChange={v => set({ eventos_mostrar: v })} /></div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">De onde vêm os encontros</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    ["automatico", "Automático (recomendado)", "Lê a Agenda sozinho: cultos e Escola Bíblica já aparecem, e você liga ou desliga o que quiser."],
                    ["manual", "Manual", "Aparece só o que você marcar na lista da Agenda abaixo, mais o que digitar à mão."],
                  ] as [ModoEncontros, string, string][]).map(([v, r, d]) => (
                    <button key={v} type="button" aria-pressed={c.eventos_modo === v} onClick={() => set({ eventos_modo: v })}
                      className={`rounded-md border p-3 text-left ${c.eventos_modo === v ? "border-primary bg-primary/10" : "border-input"}`}>
                      <span className="block text-sm font-medium">{r}</span>
                      <span className="block text-xs text-muted-foreground">{d}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <div><Label htmlFor="bv-ev-titulo">Título da seção</Label><Input id="bv-ev-titulo" maxLength={80} value={c.eventos_titulo} onChange={e => set({ eventos_titulo: e.target.value })} /></div>
                <div><Label htmlFor="bv-ev-max">Máximo na tela</Label>
                  <Input id="bv-ev-max" type="number" min={1} max={10} value={c.eventos_max} onChange={e => set({ eventos_max: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /></div>
              </div>

              <section className="space-y-3" aria-label="Encontros da Agenda">
                <div>
                  <p className="text-sm font-medium">O que a Agenda tem nos próximos 60 dias</p>
                  <p className="text-xs text-muted-foreground">
                    Cada programação que se repete aparece uma vez, com a próxima data; datas canceladas ou remarcadas na Agenda são respeitadas.
                    O visitante vê primeiro os cultos, depois as programações recorrentes e por fim os eventos especiais.
                  </p>
                </div>
                {agenda === null && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo a Agenda…</p>}
                {erroAgenda && <p role="alert" className="text-sm text-destructive-text">{erroAgenda}</p>}
                {agenda !== null && !erroAgenda && agenda.length === 0 && <p className="text-sm text-muted-foreground">A Agenda não tem encontros nos próximos 60 dias.</p>}
                {([1, 2, 3] as const).map(g => {
                  const itens = (agenda ?? []).filter(i => i.prioridade === g);
                  if (itens.length === 0) return null;
                  return (
                    <div key={g} className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{GRUPOS_DA_AGENDA[g]}</p>
                      {itens.map(i => {
                        const ligado = itemVisivel(i, c);
                        const terminaLogo = !!i.fim && i.fim <= daquiA30;
                        return (
                          <div key={i.chave} className="flex items-center gap-3 rounded-md border p-2.5">
                            <Switch checked={ligado} onCheckedChange={v => setC(x => (x ? { ...x, ...alternarItem(i, v, x) } : x))} aria-label={`Mostrar ${i.titulo}`} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{i.titulo}</p>
                              <p className="truncate text-xs text-muted-foreground">{i.quando}{i.local ? ` · ${i.local}` : ""}</p>
                              {terminaLogo && <p className="text-xs text-warning-text">A série termina em {i.fim!.slice(8, 10)}/{i.fim!.slice(5, 7)}: renove na Agenda para continuar aparecendo.</p>}
                            </div>
                            {c.eventos_modo === "automatico" && i.padrao && <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">padrão</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </section>

              {c.eventos_modo === "manual" && (
                <section className="space-y-3 border-t pt-4" aria-label="Itens digitados">
                  <div>
                    <p className="text-sm font-medium">Itens digitados à mão</p>
                    <p className="text-xs text-muted-foreground">Para o que não está na Agenda. Com data, o item some sozinho depois do dia; sem data, fica sempre.</p>
                  </div>
                  {c.eventos.map((e, i) => (
                    <div key={i} className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <Input aria-label="Nome do encontro" placeholder="Nome do encontro" maxLength={100} value={e.titulo} onChange={ev => setEncontro(i, { titulo: ev.target.value })} />
                        <Switch checked={e.ativo} onCheckedChange={v => setEncontro(i, { ativo: v })} aria-label="Mostrar este encontro" />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input aria-label="Quando" placeholder="Quando (ex.: Domingos · 10h30)" maxLength={80} value={e.quando} onChange={ev => setEncontro(i, { quando: ev.target.value })} />
                        <Input aria-label="Onde" placeholder="Onde (opcional)" maxLength={80} value={e.local} onChange={ev => setEncontro(i, { local: ev.target.value })} />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div><Label className="text-xs text-muted-foreground">Data (some depois dela; vazio = fixo)</Label><CampoData value={e.data} onChange={v => setEncontro(i, { data: v })} /></div>
                        <div><Label className="text-xs text-muted-foreground">Link (opcional)</Label><Input aria-label="Link do encontro" placeholder="www.suaigreja.org.br/evento" value={e.link} onChange={ev => setEncontro(i, { link: ev.target.value })} /></div>
                      </div>
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="icon" variant="ghost" aria-label="Subir" onClick={() => set({ eventos: mover(c.eventos, i, -1) })}><ArrowUp className="h-4 w-4" /></Button>
                        <Button type="button" size="icon" variant="ghost" aria-label="Descer" onClick={() => set({ eventos: mover(c.eventos, i, 1) })}><ArrowDown className="h-4 w-4" /></Button>
                        <Button type="button" size="icon" variant="ghost" aria-label="Remover encontro" onClick={() => set({ eventos: c.eventos.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                  {c.eventos.length < 30 && <Button type="button" variant="outline" className="gap-2 border-dashed" onClick={() => set({ eventos: [...c.eventos, { ...ENCONTRO_VAZIO }] })}><Plus className="h-4 w-4" /> Adicionar item</Button>}
                </section>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-label="Prévia">
          <p className="mb-2 text-sm font-medium">Prévia — o que o visitante verá</p>
          <div className="mx-auto w-full max-w-[380px] rounded-[28px] border bg-muted/40 p-3">
            <div className="rounded-xl border bg-card p-5"><BoasVindasVisitante dados={previa} /></div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">A prévia mostra o que está na tela agora; o visitante só vê depois de salvar.</p>
        </aside>
      </div>

      <div className="sticky bottom-4 px-4 md:hidden">
        <Button className="w-full shadow-elevated" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar</Button>
      </div>
    </div>
  );
}
