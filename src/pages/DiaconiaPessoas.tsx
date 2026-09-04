// ─── DiaconiaPessoas.tsx — quem é atendido nesta área ──────────────────────
//
// Cadastro leve na entrada (nome, telefone, endereço) — a ficha de
// identidade completa e a ficha socioeconômica ficam para quando já há
// alguma relação, não para o primeiro contato. Pesquisa de bancos de
// alimentos: uma triagem extensa logo de cara lê como interrogatório: "quem
// só quer buscar a cesta" primeiro vira nome e rosto, depois vira ficha.
//
// A ficha socioeconômica espelha a ficha impressa da igreja, melhorada com
// `renda_mensal` (a impressa só perguntava sim/não) para dar a per capita
// que ela pediu. Ver diaconiaService.ts e a migration 20260904110000 para o
// raciocínio completo.
//
// Só ministra/líder chega até a ficha socioeconômica de fato: a RPC
// `diaconia_salvar_ficha` recusa qualquer outra conta, e a tela só mostra o
// erro dela — não decide nada sozinha. Identidade e endereço (em "Editar
// dados") já são a porta larga — quem serve na área também corrige um
// telefone errado.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, ChevronRight, HeartHandshake, MapPin, Pencil, Phone, Plus, Trash2, Users, UserCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  pessoasDaArea, pessoasEncerradasDaArea, criarPessoa, atualizarPessoa, fichasDaPessoa, salvarFicha,
  SITUACOES_MORADIA, SEXOS, ESTADOS_CIVIS, BENEFICIOS_FEDERAIS,
  TIPOS_DEFICIENCIA, FAIXAS_TEMPO_TRABALHO, SETORES_DE_OCUPACAO, FONTES_DE_SUSTENTO,
  NECESSIDADES, ESCOLARIDADES, PARENTESCOS, NACIONALIDADES, MOTIVOS_ENCERRAMENTO,
  rotuloMoradia, rotuloSexo, rotuloEstadoCivil,
  pessoasNaCasa, rendaPerCapita, carregarLimitesPerCapita, classificarPerCapita, ROTULO_CLASSIFICACAO,
  encerrarVinculo, reabrirVinculo, buscarMembro, vincularMembro,
  type PessoaAssistida, type FichaSocioeconomica, type DadosFicha, type Endereco, type Familiar,
  type LimitesPerCapita, type VinculoEncerrado, type MembroEncontrado,
} from "@/services/diaconiaService";
import { Badge } from "@/components/ui/badge";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { CamposEndereco } from "@/components/ui/CamposEndereco";
import { PaginaSkeleton } from "@/components/ListState";
import { supabase } from "@/integrations/supabase/client";

/** "Rua Tal, 123 - Bloco B · Bairro, Cidade/UF", só com o que existir. */
function enderecoResumido(p: Endereco): string | null {
  const linha1 = [p.endereco, p.numero].filter(Boolean).join(", ") + (p.complemento ? ` - ${p.complemento}` : "");
  const linha2 = [p.bairro, [p.cidade, p.uf].filter(Boolean).join("/")].filter(Boolean).join(", ");
  const partes = [linha1.trim(), linha2].filter(s => s && s !== ",");
  return partes.length > 0 ? partes.join(" · ") : null;
}

function formatarReais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Uma lista suspensa que sabe abrir "Outro" com campo próprio.
 *
 * Pedido dela: "não use campos de escrita livre, trabalhe sempre com
 * listas, para que possamos aferir corretamente... ao final, deixe as
 * informações adicionais para textos livres." `valor` é sempre a resposta
 * final — uma das opções, ou o texto de "Outro" — não duas variáveis que o
 * chamador precisa reconciliar.
 */
function SelectOuOutro({ opcoes, valor, onChange, placeholder = "Selecione" }: {
  opcoes: readonly string[]; valor: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [modoOutro, setModoOutro] = useState(() => valor !== "" && !opcoes.includes(valor));
  const selecionado = modoOutro ? "Outro" : valor;
  return (
    <div className="space-y-1.5">
      <Select value={selecionado || undefined} onValueChange={v => {
        if (v === "Outro") { setModoOutro(true); onChange(""); }
        else { setModoOutro(false); onChange(v); }
      }}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {opcoes.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
      {modoOutro && (
        <Input placeholder="Qual?" value={valor} onChange={e => onChange(e.target.value)} className="h-8 text-sm" />
      )}
    </div>
  );
}

/**
 * A per capita, com a cor dizendo se está abaixo ou acima do esperado —
 * pedido dela: "mostre visualmente". A linha é a do CadÚnico (configurável
 * em `diaconia_config`, ver a migration 20260904120000); a cor orienta a
 * leitura, a decisão continua sendo de quem lidera.
 */
function PercapitaBadge({ valor, limites }: { valor: number; limites: LimitesPerCapita | null }) {
  if (!limites) return <span className="font-medium">{formatarReais(valor)}/pessoa</span>;
  const classificacao = classificarPerCapita(valor, limites);
  const tom = classificacao === "extrema_pobreza"
    ? "text-destructive-text border-destructive-line bg-destructive-soft"
    : classificacao === "pobreza"
    ? "text-warning-text border-warning-line bg-warning-soft"
    : "text-success-text border-success-line bg-success-soft";
  return (
    <Badge variant="outline" className={`text-xs font-medium ${tom}`}>
      {formatarReais(valor)}/pessoa · {ROTULO_CLASSIFICACAO[classificacao]}
    </Badge>
  );
}

export default function DiaconiaPessoas() {
  const { ministerioId = "", areaId = "" } = useParams();
  const [areaNome, setAreaNome] = useState("");
  const [pessoas, setPessoas] = useState<(PessoaAssistida & { vinculo_id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  // Uma vez por tela, não uma vez por pessoa — os limites não mudam entre uma
  // ficha e outra na mesma sessão de trabalho.
  const [limites, setLimites] = useState<LimitesPerCapita | null>(null);
  // Quem teve o acompanhamento encerrado — carregado à parte, e escondido
  // atrás de um "Ver encerrados" por padrão: não é o que quem abre a tela
  // veio ver, mas precisa existir um caminho até aqui pra desfazer um
  // engano.
  const [encerrados, setEncerrados] = useState<VinculoEncerrado[] | null>(null);
  const [verEncerrados, setVerEncerrados] = useState(false);

  useEffect(() => { carregar(); carregarLimitesPerCapita().then(setLimites).catch(() => {}); }, [areaId]);

  async function carregar() {
    if (!areaId) return;
    setLoading(true);
    try {
      const { data: area } = await supabase.from("areas").select("nome").eq("id", areaId).maybeSingle();
      setAreaNome((area as any)?.nome ?? "");
      setPessoas(await pessoasDaArea(areaId));
      setEncerrados(null); // recarrega só quando "Ver encerrados" é aberto
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function abrirEncerrados() {
    setVerEncerrados(v => !v);
    if (encerrados === null) {
      try { setEncerrados(await pessoasEncerradasDaArea(areaId)); }
      catch (e: any) { toast.error(e?.message ?? "Erro ao carregar encerrados"); }
    }
  }

  async function reabrir(vinculoId: string, nome: string) {
    const r = await reabrirVinculo(vinculoId);
    if (!r.ok) { toast.error(r.erro); return; }
    toast.success(`${nome} voltou a ser acompanhada nesta área`);
    // `carregar()` zera `encerrados` de propósito (força recarregar na
    // próxima vez que o painel abrir) — como ele já está aberto aqui,
    // busca de novo em vez de deixar "Carregando…" pendurado.
    await carregar();
    if (verEncerrados) {
      try { setEncerrados(await pessoasEncerradasDaArea(areaId)); }
      catch { setEncerrados([]); }
    }
  }

  if (loading && pessoas.length === 0) return <PaginaSkeleton />;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to={`/ministerios/${ministerioId}/painel`}><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 truncate">
            <HeartHandshake className="w-5 h-5 text-gold" />
            {areaNome || "Pessoas"}
          </h1>
          <p className="text-xs text-muted-foreground">{pessoas.length} cadastradas</p>
        </div>
      </div>

      <Button onClick={() => setNovoOpen(true)} className="w-full gap-1.5">
        <Plus className="w-4 h-4" /> Nova pessoa
      </Button>

      {pessoas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Ninguém cadastrado nesta área ainda.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {pessoas.map(p => (
            <li key={p.id} className="min-w-0">
              <button type="button" onClick={() => setAberta(aberta === p.id ? null : p.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 min-w-0 text-left hover:bg-muted/40 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate min-w-0 flex items-center gap-1.5">
                    <span className="truncate">{p.nome_completo}</span>
                    {p.membro_id && (
                      <Badge variant="outline" className="text-[10px] font-normal shrink-0 gap-0.5 px-1.5 py-0">
                        <UserCheck className="w-2.5 h-2.5" /> Membro
                      </Badge>
                    )}
                  </p>
                  {p.telefone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {p.telefone}
                    </p>
                  )}
                  {enderecoResumido(p) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate min-w-0">
                      <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{enderecoResumido(p)}</span>
                    </p>
                  )}
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${aberta === p.id ? "rotate-90" : ""}`} />
              </button>
              {aberta === p.id && <FichaDaPessoa pessoa={p} onAtualizou={carregar} limites={limites} />}
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={abrirEncerrados}>
          <ChevronRight className={`w-3 h-3 transition-transform ${verEncerrados ? "rotate-90" : ""}`} />
          Ver encerrados
        </Button>
        {verEncerrados && (
          encerrados === null ? (
            <p className="text-xs text-muted-foreground px-2">Carregando…</p>
          ) : encerrados.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2">Ninguém encerrado nesta área.</p>
          ) : (
            <ul className="divide-y rounded-md border bg-muted/20 mt-1.5">
              {encerrados.map(e => (
                <li key={e.vinculo_id} className="flex items-center gap-3 px-3 py-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate min-w-0">{e.nome_completo}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {e.motivo_encerramento ?? "sem motivo registrado"}
                      {" · "}{e.encerrado_em.slice(0, 10).split("-").reverse().join("/")}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                    onClick={() => reabrir(e.vinculo_id, e.nome_completo)}>
                    Reabrir
                  </Button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      <NovaPessoaDialog open={novoOpen} onOpenChange={setNovoOpen} areaId={areaId} onCriada={carregar} />
    </div>
  );
}

function NovaPessoaDialog({ open, onOpenChange, areaId, onCriada }: {
  open: boolean; onOpenChange: (v: boolean) => void; areaId: string; onCriada: () => void;
}) {
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [end, setEnd] = useState<Endereco>({});
  const [busy, setBusy] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Nome obrigatório"); return; }
    setBusy(true);
    try {
      const r = await criarPessoa(areaId, nome, { telefone: tel || undefined, ...end });
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success("Cadastrada");
      setNome(""); setTel(""); setEnd({}); onOpenChange(false);
      onCriada();
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova pessoa assistida</DialogTitle></DialogHeader>
        <form onSubmit={enviar} className="space-y-3">
          <div>
            <Label>Nome completo *</Label>
            <Input required autoFocus value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div>
            <Label>Telefone (opcional)</Label>
            <TelefoneInput value={tel} onChange={setTel} />
          </div>

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">
            Endereço (opcional)
          </p>
          <CamposEndereco
            cep={end.cep ?? ""} endereco={end.endereco ?? ""} numero={end.numero ?? ""}
            complemento={end.complemento ?? ""} bairro={end.bairro ?? ""} cidade={end.cidade ?? ""}
            uf={end.uf ?? ""} mostrarUf
            onChange={(campo, valor) => setEnd(prev => ({ ...prev, [campo]: valor }))}
          />

          <p className="text-xs text-muted-foreground">
            Data de nascimento, documentos e o resto ficam para "Editar dados", depois do primeiro contato.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Cadastrar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "E para os membros que também são assistidos?" — busca própria porque
 * `membros` não é legível pela sessão de um líder comum; passa por
 * `diaconia_buscar_membro`, que devolve só nome/tipo/telefone.
 */
function BuscaMembroDiaconia({ onEscolher }: { onEscolher: (m: MembroEncontrado) => void }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<MembroEncontrado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (busca.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      try { setResultados(await buscarMembro(busca)); }
      catch { setResultados([]); }
      finally { setBuscando(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="relative">
      <Input
        placeholder="Buscar por nome (mín. 2 letras)…"
        value={busca}
        onFocus={() => setAberto(true)}
        onChange={e => { setBusca(e.target.value); setAberto(true); }}
        className="h-8 text-sm pr-8"
      />
      {buscando && <Loader2 className="absolute right-2.5 top-2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      {aberto && busca.trim().length >= 2 && (
        <div className="absolute z-20 left-0 right-0 mt-1 border rounded-md max-h-48 overflow-y-auto bg-background shadow-md">
          {!buscando && resultados.length === 0 && (
            <p className="text-xs text-muted-foreground p-2.5 text-center">Ninguém encontrado.</p>
          )}
          {resultados.map(m => (
            <button key={m.id} type="button"
              onClick={() => { onEscolher(m); setBusca(""); setResultados([]); setAberto(false); }}
              className="w-full text-left px-2.5 py-2 text-xs hover:bg-accent transition-colors border-b last:border-0">
              <div className="font-medium">{m.nome_completo}</div>
              <div className="text-muted-foreground">
                {m.tipo_pessoa}{m.telefone_celular ? ` · ${m.telefone_celular}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditarDados({ pessoa, onSalvou, onCancelar }: {
  pessoa: PessoaAssistida; onSalvou: () => void; onCancelar: () => void;
}) {
  const [nome, setNome] = useState(pessoa.nome_completo);
  const [tel, setTel] = useState(pessoa.telefone ?? "");
  const [end, setEnd] = useState<Endereco>({
    cep: pessoa.cep, endereco: pessoa.endereco, numero: pessoa.numero,
    complemento: pessoa.complemento, bairro: pessoa.bairro, cidade: pessoa.cidade, uf: pessoa.uf,
  });
  const [dataNasc, setDataNasc] = useState(pessoa.data_nascimento ?? "");
  const [sexo, setSexo] = useState(pessoa.sexo ?? "");
  const [estadoCivil, setEstadoCivil] = useState(pessoa.estado_civil ?? "");
  const [rg, setRg] = useState(pessoa.rg ?? "");
  const [cpf, setCpf] = useState(pessoa.cpf ?? "");
  const [nacionalidade, setNacionalidade] = useState(pessoa.nacionalidade ?? "");
  const [naturalidade, setNaturalidade] = useState(pessoa.naturalidade ?? "");
  const [profissao, setProfissao] = useState(pessoa.profissao ?? "");
  const [escolaridade, setEscolaridade] = useState(pessoa.escolaridade ?? "");
  const [busy, setBusy] = useState(false);
  const [vinculandoMembro, setVinculandoMembro] = useState(false);

  async function escolherMembro(m: MembroEncontrado) {
    setVinculandoMembro(true);
    try {
      const r = await vincularMembro(pessoa.id, m.id);
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success(`Ligada à ficha de ${m.nome_completo}`);
      onSalvou();
    } finally { setVinculandoMembro(false); }
  }

  async function desvincularMembro() {
    setVinculandoMembro(true);
    try {
      const r = await vincularMembro(pessoa.id, null);
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success("Desligada da ficha de membro");
      onSalvou();
    } finally { setVinculandoMembro(false); }
  }

  async function salvar() {
    if (!nome.trim()) { toast.error("Nome obrigatório"); return; }
    setBusy(true);
    try {
      const r = await atualizarPessoa(pessoa.id, nome, {
        telefone: tel || undefined, ...end,
        data_nascimento: dataNasc || null, sexo: sexo || null, estado_civil: estadoCivil || null,
        rg: rg || null, cpf: cpf || null, nacionalidade: nacionalidade || null,
        naturalidade: naturalidade || null, profissao: profissao || null, escolaridade: escolaridade || null,
      });
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success("Dados atualizados");
      onSalvou();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-md border bg-card px-2.5 py-2.5 space-y-2.5">
      <div>
        <Label className="text-xs flex items-center gap-1">
          <UserCheck className="w-3 h-3" /> Já é membro ou congregado da igreja?
        </Label>
        {pessoa.membro_id ? (
          <div className="flex items-center justify-between gap-2 rounded border bg-success-soft border-success-line px-2 py-1.5 mt-1">
            <Badge variant="outline" className="text-xs gap-1 border-success-line text-success-text">
              <UserCheck className="w-3 h-3" /> Ficha ligada
            </Badge>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 gap-1 text-xs text-muted-foreground"
              onClick={desvincularMembro} disabled={vinculandoMembro}>
              <X className="w-3 h-3" /> Desligar
            </Button>
          </div>
        ) : (
          <BuscaMembroDiaconia onEscolher={escolherMembro} />
        )}
      </div>

      <div>
        <Label className="text-xs">Nome completo</Label>
        <Input value={nome} onChange={e => setNome(e.target.value)} className="h-8 text-sm" />
      </div>
      <div>
        <Label className="text-xs">Telefone</Label>
        <TelefoneInput value={tel} onChange={setTel} />
      </div>

      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Endereço</p>
      <CamposEndereco
        cep={end.cep ?? ""} endereco={end.endereco ?? ""} numero={end.numero ?? ""}
        complemento={end.complemento ?? ""} bairro={end.bairro ?? ""} cidade={end.cidade ?? ""}
        uf={end.uf ?? ""} mostrarUf
        onChange={(campo, valor) => setEnd(prev => ({ ...prev, [campo]: valor }))}
      />

      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Identidade</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Data de nascimento</Label>
          <Input type="date" value={dataNasc} onChange={e => setDataNasc(e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Sexo</Label>
          <Select value={sexo || undefined} onValueChange={setSexo}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{SEXOS.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Estado civil</Label>
        <Select value={estadoCivil || undefined} onValueChange={setEstadoCivil}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>{ESTADOS_CIVIS.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">RG</Label>
          <Input value={rg} onChange={e => setRg(e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">CPF</Label>
          <Input value={cpf} onChange={e => setCpf(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Nacionalidade</Label>
          <SelectOuOutro opcoes={NACIONALIDADES} valor={nacionalidade} onChange={setNacionalidade} />
        </div>
        <div>
          <Label className="text-xs">Naturalidade (cidade)</Label>
          <Input value={naturalidade} onChange={e => setNaturalidade(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Profissão</Label>
        <SelectOuOutro opcoes={SETORES_DE_OCUPACAO} valor={profissao} onChange={setProfissao} />
      </div>
      <div>
        <Label className="text-xs">Escolaridade</Label>
        <SelectOuOutro opcoes={ESCOLARIDADES} valor={escolaridade} onChange={setEscolaridade} />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="outline" onClick={onCancelar} disabled={busy}>Cancelar</Button>
        <Button size="sm" onClick={salvar} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
      </div>
    </div>
  );
}

function FichaDaPessoa({ pessoa, onAtualizou, limites }: {
  pessoa: PessoaAssistida & { vinculo_id: string }; onAtualizou: () => void; limites: LimitesPerCapita | null;
}) {
  const pessoaId = pessoa.id;
  const [fichas, setFichas] = useState<FichaSocioeconomica[] | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  useEffect(() => {
    fichasDaPessoa(pessoaId).then(setFichas).catch(() => setFichas([]));
  }, [pessoaId]);

  const recarregar = () => fichasDaPessoa(pessoaId).then(setFichas);

  if (editando) {
    return (
      <div className="px-3 pb-3 pl-8">
        <EditarDados pessoa={pessoa}
          onSalvou={() => { setEditando(false); onAtualizou(); }}
          onCancelar={() => setEditando(false)} />
      </div>
    );
  }

  if (encerrando) {
    return (
      <div className="px-3 pb-3 pl-8">
        <EncerrarAcompanhamento vinculoId={pessoa.vinculo_id} nome={pessoa.nome_completo}
          onEncerrou={() => { setEncerrando(false); onAtualizou(); }}
          onCancelar={() => setEncerrando(false)} />
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 pl-8 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Ficha socioeconômica
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => setEditando(true)}>
            <Pencil className="w-3 h-3" /> Editar dados
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 text-muted-foreground"
            onClick={() => setEncerrando(true)}>
            Encerrar
          </Button>
        </div>
      </div>

      {fichas === null ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : fichas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma ficha preenchida ainda.</p>
      ) : (
        <ul className="space-y-2">
          {fichas.map(f => {
            const percapita = rendaPerCapita(f);
            const naCasa = pessoasNaCasa(f);
            return (
              <li key={f.id} className="rounded-md border bg-muted/30 px-2.5 py-2 text-xs space-y-1">
                <p className="font-medium text-muted-foreground">
                  {f.data_preenchimento.split("-").reverse().join("/")}
                </p>
                <p>
                  {[
                    naCasa > 0 ? `${naCasa} na casa` : null,
                    rotuloMoradia(f.situacao_moradia),
                    f.possui_renda === true
                      ? `trabalho ${f.renda_mensal != null ? formatarReais(f.renda_mensal) : "sem valor"}`
                      : f.possui_renda === false ? "sem renda de trabalho" : null,
                    f.recebe_beneficio_social === true
                      ? `${f.qual_beneficio ?? "benefício"}${f.valor_beneficio != null ? ` ${formatarReais(f.valor_beneficio)}` : ""}`
                      : f.recebe_beneficio_social === false ? "sem benefício" : null,
                  ].filter(Boolean).join(" · ") || "sem dados"}
                </p>
                {percapita != null && (
                  <p><PercapitaBadge valor={percapita} limites={limites} /></p>
                )}
                {f.familiares.length > 0 && (
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3 shrink-0" />
                    {f.familiares.map(fam => fam.nome).join(", ")}
                  </p>
                )}
                {f.maior_necessidade && (
                  <p className="text-muted-foreground">Necessidade: {f.maior_necessidade}</p>
                )}
                {f.observacoes && <p className="text-muted-foreground">{f.observacoes}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {novaAberta ? (
        <NovaFicha pessoaId={pessoaId} limites={limites}
          onSalvou={() => { setNovaAberta(false); recarregar(); }}
          onCancelar={() => setNovaAberta(false)} />
      ) : (
        <Button size="sm" variant="outline" className="text-xs" onClick={() => setNovaAberta(true)}>
          + Atualizar ficha
        </Button>
      )}
    </div>
  );
}

/**
 * Encerrar não é desmarcar — é dizer por quê. Pesquisado (PAIF/CRAS): todo
 * acompanhamento familiar continuado tem um "encerramento formal" como
 * registro obrigatório, com motivo. Reaproveita `diaconia_vinculos.ativo`
 * que já existia; só o motivo é novo.
 */
function EncerrarAcompanhamento({ vinculoId, nome, onEncerrou, onCancelar }: {
  vinculoId: string; nome: string; onEncerrou: () => void; onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmar() {
    setBusy(true);
    try {
      const r = await encerrarVinculo(vinculoId, motivo || undefined);
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success(`Acompanhamento de ${nome} encerrado nesta área`);
      onEncerrou();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-md border border-warning-line bg-warning-soft px-2.5 py-2.5 space-y-2.5">
      <p className="text-sm">
        Encerrar o acompanhamento de <strong>{nome}</strong> nesta área. Ela sai da chamada e das
        pendências, mas o histórico da ficha continua guardado — dá pra reabrir depois.
      </p>
      <div>
        <Label className="text-xs">Motivo</Label>
        <SelectOuOutro opcoes={MOTIVOS_ENCERRAMENTO} valor={motivo} onChange={setMotivo} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancelar} disabled={busy}>Cancelar</Button>
        <Button size="sm" onClick={confirmar} disabled={busy}>{busy ? "Encerrando..." : "Confirmar"}</Button>
      </div>
    </div>
  );
}

const FAMILIAR_VAZIO: Familiar = { nome: "", idade: null, parentesco: "", trabalha: false, estuda: false, pcd: false, qual_pcd: "" };

function NovaFicha({ pessoaId, limites, onSalvou, onCancelar }: {
  pessoaId: string; limites: LimitesPerCapita | null; onSalvou: () => void; onCancelar: () => void;
}) {
  const [possuiDeficiencia, setPossuiDeficiencia] = useState(false);
  const [qualDeficiencia, setQualDeficiencia] = useState("");
  const [possuiRenda, setPossuiRenda] = useState(false);
  const [rendaMensal, setRendaMensal] = useState("");
  const [recebeBeneficio, setRecebeBeneficio] = useState(false);
  const [qualBeneficio, setQualBeneficio] = useState("");
  const [valorBeneficio, setValorBeneficio] = useState("");
  const [jaTrabalhouClt, setJaTrabalhouClt] = useState(false);
  const [tempoClt, setTempoClt] = useState("");
  const [atuacaoClt, setAtuacaoClt] = useState("");
  const [moradia, setMoradia] = useState<string>("");
  const [familiares, setFamiliares] = useState<Familiar[]>([]);
  const [sustento, setSustento] = useState("");
  const [necessidade, setNecessidade] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  // A pessoa + quem ela listou como morador — a contagem soma sozinha, sem
  // pedir de novo o que a lista abaixo já diz. Só conta quem já tem nome:
  // "+ Adicionar" cria a linha vazia antes de a pessoa digitar nada, e
  // contar essa linha em branco mostrava "2 pessoas" sem ninguém preenchido
  // — achado por ela ao abrir uma ficha nova e ainda não ter digitado nada.
  // O mesmo filtro que `salvar()` usa antes de gravar.
  const totalCasa = 1 + familiares.filter(f => f.nome.trim()).length;
  // Renda de trabalho MAIS valor do benefício — a mesma soma que o CadÚnico
  // faz. Pergunta dela: "como calcular a per capita? soma-se renda +
  // benefício?" — sim, e por isso o preview soma os dois aqui também.
  const rendaTotalPreview = (possuiRenda && rendaMensal ? Number(rendaMensal) : 0)
    + (recebeBeneficio && valorBeneficio ? Number(valorBeneficio) : 0);
  const percapitaPreview = rendaTotalPreview > 0 ? rendaTotalPreview / totalCasa : null;

  function alterarFamiliar(i: number, campo: keyof Familiar, valor: any) {
    setFamiliares(prev => prev.map((f, idx) => idx === i ? { ...f, [campo]: valor } : f));
  }

  async function salvar() {
    setBusy(true);
    try {
      const dados: Partial<DadosFicha> = {
        possui_deficiencia: possuiDeficiencia,
        qual_deficiencia: possuiDeficiencia ? qualDeficiencia || null : null,
        possui_renda: possuiRenda,
        renda_mensal: possuiRenda && rendaMensal ? Number(rendaMensal) : null,
        recebe_beneficio_social: recebeBeneficio,
        qual_beneficio: recebeBeneficio ? qualBeneficio || null : null,
        valor_beneficio: recebeBeneficio && valorBeneficio ? Number(valorBeneficio) : null,
        ja_trabalhou_clt: jaTrabalhouClt,
        tempo_clt: jaTrabalhouClt ? tempoClt || null : null,
        atuacao_clt: jaTrabalhouClt ? atuacaoClt || null : null,
        situacao_moradia: moradia || null,
        familiares: familiares.filter(f => f.nome.trim()),
        sustento_familia: sustento || null,
        maior_necessidade: necessidade || null,
        observacoes: obs || null,
      };
      const r = await salvarFicha(pessoaId, dados);
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success("Ficha salva");
      onSalvou();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-md border bg-card px-2.5 py-2.5 space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox id={`def-${pessoaId}`} checked={possuiDeficiencia} onCheckedChange={v => setPossuiDeficiencia(!!v)} />
        <Label htmlFor={`def-${pessoaId}`} className="text-xs font-normal">Possui alguma deficiência</Label>
      </div>
      {possuiDeficiencia && (
        <SelectOuOutro opcoes={TIPOS_DEFICIENCIA} valor={qualDeficiencia} onChange={setQualDeficiencia} placeholder="Qual" />
      )}

      <div className="flex items-center gap-2">
        <Checkbox id={`renda-${pessoaId}`} checked={possuiRenda} onCheckedChange={v => setPossuiRenda(!!v)} />
        <Label htmlFor={`renda-${pessoaId}`} className="text-xs font-normal">Possui renda no momento</Label>
      </div>
      {possuiRenda && (
        <div>
          <Label className="text-xs">Renda mensal (R$) — para calcular a per capita</Label>
          <Input type="number" min={0} step="0.01" value={rendaMensal} onChange={e => setRendaMensal(e.target.value)} className="h-8 text-sm" />
        </div>
      )}

      <div className="flex items-center gap-2">
        <Checkbox id={`benef-${pessoaId}`} checked={recebeBeneficio} onCheckedChange={v => setRecebeBeneficio(!!v)} />
        <Label htmlFor={`benef-${pessoaId}`} className="text-xs font-normal">Recebe benefício do governo federal</Label>
      </div>
      {recebeBeneficio && (
        <div className="space-y-1.5">
          <SelectOuOutro opcoes={BENEFICIOS_FEDERAIS} valor={qualBeneficio} onChange={setQualBeneficio} placeholder="Qual benefício" />
          <div>
            <Label className="text-xs">Valor do benefício (R$) — para calcular a per capita</Label>
            <Input type="number" min={0} step="0.01" value={valorBeneficio} onChange={e => setValorBeneficio(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Checkbox id={`clt-${pessoaId}`} checked={jaTrabalhouClt} onCheckedChange={v => setJaTrabalhouClt(!!v)} />
        <Label htmlFor={`clt-${pessoaId}`} className="text-xs font-normal">Já trabalhou com carteira ou por contrato</Label>
      </div>
      {jaTrabalhouClt && (
        <div className="grid grid-cols-2 gap-2">
          <SelectOuOutro opcoes={FAIXAS_TEMPO_TRABALHO} valor={tempoClt} onChange={setTempoClt} placeholder="Quanto tempo" />
          <SelectOuOutro opcoes={SETORES_DE_OCUPACAO} valor={atuacaoClt} onChange={setAtuacaoClt} placeholder="Em que atuava" />
        </div>
      )}

      <div>
        <Label className="text-xs">Tipo de imóvel em que reside</Label>
        <Select value={moradia} onValueChange={setMoradia}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {SITUACOES_MORADIA.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Quem mais mora na casa, além da pessoa</Label>
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1"
            onClick={() => setFamiliares(prev => [...prev, { ...FAMILIAR_VAZIO }])}>
            <Plus className="w-3 h-3" /> Adicionar
          </Button>
        </div>
        {familiares.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ninguém adicionado ainda.</p>
        ) : (
          <div className="space-y-2 mt-1.5">
            {familiares.map((f, i) => (
              <div key={i} className="rounded border bg-background px-2 py-2 space-y-1.5">
                <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
                  <Input placeholder="Nome" value={f.nome} onChange={e => alterarFamiliar(i, "nome", e.target.value)} className="h-7 text-xs" />
                  <Input type="number" min={0} placeholder="Idade" value={f.idade ?? ""}
                    onChange={e => alterarFamiliar(i, "idade", e.target.value ? Number(e.target.value) : null)}
                    className="h-7 text-xs w-16" />
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5"
                    onClick={() => setFamiliares(prev => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <SelectOuOutro opcoes={PARENTESCOS} valor={f.parentesco}
                  onChange={v => alterarFamiliar(i, "parentesco", v)} placeholder="Grau de parentesco" />
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-1 text-[11px]">
                    <Checkbox checked={f.trabalha} onCheckedChange={v => alterarFamiliar(i, "trabalha", !!v)} /> Trabalha
                  </label>
                  <label className="flex items-center gap-1 text-[11px]">
                    <Checkbox checked={f.estuda} onCheckedChange={v => alterarFamiliar(i, "estuda", !!v)} /> Estuda
                  </label>
                  <label className="flex items-center gap-1 text-[11px]">
                    <Checkbox checked={f.pcd} onCheckedChange={v => alterarFamiliar(i, "pcd", !!v)} /> PcD
                  </label>
                </div>
                {f.pcd && (
                  <Input placeholder="Qual deficiência" value={f.qual_pcd ?? ""}
                    onChange={e => alterarFamiliar(i, "qual_pcd", e.target.value)} className="h-7 text-xs" />
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1.5">
          {totalCasa} {totalCasa === 1 ? "pessoa" : "pessoas"} na casa, contando a própria pessoa
          {percapitaPreview != null && (
            <span className="ml-1"><PercapitaBadge valor={percapitaPreview} limites={limites} /></span>
          )}
        </p>
      </div>

      <div>
        <Label className="text-xs">De que maneira tira o sustento da família</Label>
        <SelectOuOutro opcoes={FONTES_DE_SUSTENTO} valor={sustento} onChange={setSustento} />
      </div>
      <div>
        <Label className="text-xs">Qual a maior necessidade da família no momento</Label>
        <SelectOuOutro opcoes={NECESSIDADES} valor={necessidade} onChange={setNecessidade} />
      </div>
      <div>
        <Label className="text-xs">Informações adicionais</Label>
        <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} className="text-sm" />
      </div>

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancelar} disabled={busy}>Cancelar</Button>
        <Button size="sm" onClick={salvar} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
      </div>
    </div>
  );
}
