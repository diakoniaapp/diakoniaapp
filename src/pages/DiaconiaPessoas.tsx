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
import { ArrowLeft, ChevronRight, HeartHandshake, MapPin, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  pessoasDaArea, criarPessoa, atualizarPessoa, fichasDaPessoa, salvarFicha,
  SITUACOES_MORADIA, SEXOS, ESTADOS_CIVIS, rotuloMoradia, rotuloSexo, rotuloEstadoCivil,
  pessoasNaCasa, rendaPerCapita,
  type PessoaAssistida, type FichaSocioeconomica, type DadosFicha, type Endereco, type Familiar,
} from "@/services/diaconiaService";
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

export default function DiaconiaPessoas() {
  const { ministerioId = "", areaId = "" } = useParams();
  const [areaNome, setAreaNome] = useState("");
  const [pessoas, setPessoas] = useState<(PessoaAssistida & { vinculo_id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);

  useEffect(() => { carregar(); }, [areaId]);

  async function carregar() {
    if (!areaId) return;
    setLoading(true);
    try {
      const { data: area } = await supabase.from("areas").select("nome").eq("id", areaId).maybeSingle();
      setAreaNome((area as any)?.nome ?? "");
      setPessoas(await pessoasDaArea(areaId));
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
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
                  <p className="text-sm font-medium truncate min-w-0">{p.nome_completo}</p>
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
              {aberta === p.id && <FichaDaPessoa pessoa={p} onAtualizou={carregar} />}
            </li>
          ))}
        </ul>
      )}

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
          <Input value={nacionalidade} onChange={e => setNacionalidade(e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Naturalidade</Label>
          <Input value={naturalidade} onChange={e => setNaturalidade(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Profissão</Label>
        <Input value={profissao} onChange={e => setProfissao(e.target.value)} className="h-8 text-sm" />
      </div>
      <div>
        <Label className="text-xs">Escolaridade</Label>
        <Input value={escolaridade} onChange={e => setEscolaridade(e.target.value)} className="h-8 text-sm" />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="outline" onClick={onCancelar} disabled={busy}>Cancelar</Button>
        <Button size="sm" onClick={salvar} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
      </div>
    </div>
  );
}

function FichaDaPessoa({ pessoa, onAtualizou }: {
  pessoa: PessoaAssistida; onAtualizou: () => void;
}) {
  const pessoaId = pessoa.id;
  const [fichas, setFichas] = useState<FichaSocioeconomica[] | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [editando, setEditando] = useState(false);

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

  return (
    <div className="px-3 pb-3 pl-8 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Ficha socioeconômica
        </p>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => setEditando(true)}>
          <Pencil className="w-3 h-3" /> Editar dados
        </Button>
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
                      ? `renda ${f.renda_mensal != null ? formatarReais(f.renda_mensal) : "sem valor"}`
                      : f.possui_renda === false ? "sem renda" : null,
                    f.recebe_beneficio_social === true
                      ? `benefício${f.qual_beneficio ? ` (${f.qual_beneficio})` : ""}`
                      : f.recebe_beneficio_social === false ? "sem benefício" : null,
                  ].filter(Boolean).join(" · ") || "sem dados"}
                </p>
                {percapita != null && (
                  <p className="font-medium text-success-text">
                    Per capita: {formatarReais(percapita)}/pessoa
                  </p>
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
        <NovaFicha pessoaId={pessoaId} onSalvou={() => { setNovaAberta(false); recarregar(); }}
          onCancelar={() => setNovaAberta(false)} />
      ) : (
        <Button size="sm" variant="outline" className="text-xs" onClick={() => setNovaAberta(true)}>
          + Atualizar ficha
        </Button>
      )}
    </div>
  );
}

const FAMILIAR_VAZIO: Familiar = { nome: "", idade: null, parentesco: "", trabalha: false, estuda: false, pcd: false, qual_pcd: "" };

function NovaFicha({ pessoaId, onSalvou, onCancelar }: {
  pessoaId: string; onSalvou: () => void; onCancelar: () => void;
}) {
  const [possuiDeficiencia, setPossuiDeficiencia] = useState(false);
  const [qualDeficiencia, setQualDeficiencia] = useState("");
  const [possuiRenda, setPossuiRenda] = useState(false);
  const [rendaMensal, setRendaMensal] = useState("");
  const [recebeBeneficio, setRecebeBeneficio] = useState(false);
  const [qualBeneficio, setQualBeneficio] = useState("");
  const [jaTrabalhouClt, setJaTrabalhouClt] = useState(false);
  const [tempoClt, setTempoClt] = useState("");
  const [atuacaoClt, setAtuacaoClt] = useState("");
  const [moradia, setMoradia] = useState<string>("");
  const [criancas, setCriancas] = useState("");
  const [adolescentes, setAdolescentes] = useState("");
  const [adultos, setAdultos] = useState("");
  const [idosos, setIdosos] = useState("");
  const [familiares, setFamiliares] = useState<Familiar[]>([]);
  const [sustento, setSustento] = useState("");
  const [necessidade, setNecessidade] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  const totalCasa = (Number(criancas) || 0) + (Number(adolescentes) || 0) + (Number(adultos) || 0) + (Number(idosos) || 0);
  const percapitaPreview = possuiRenda && rendaMensal && totalCasa > 0
    ? Number(rendaMensal) / totalCasa : null;

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
        ja_trabalhou_clt: jaTrabalhouClt,
        tempo_clt: jaTrabalhouClt ? tempoClt || null : null,
        atuacao_clt: jaTrabalhouClt ? atuacaoClt || null : null,
        situacao_moradia: moradia || null,
        criancas_ate_11: criancas ? Number(criancas) : 0,
        adolescentes_12_18: adolescentes ? Number(adolescentes) : 0,
        adultos_19_59: adultos ? Number(adultos) : 0,
        idosos_60_mais: idosos ? Number(idosos) : 0,
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
        <Input placeholder="Qual" value={qualDeficiencia} onChange={e => setQualDeficiencia(e.target.value)} className="h-8 text-sm" />
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
        <Input placeholder="Qual — Bolsa Família, BPC, Auxílio Gás…" value={qualBeneficio} onChange={e => setQualBeneficio(e.target.value)} className="h-8 text-sm" />
      )}

      <div className="flex items-center gap-2">
        <Checkbox id={`clt-${pessoaId}`} checked={jaTrabalhouClt} onCheckedChange={v => setJaTrabalhouClt(!!v)} />
        <Label htmlFor={`clt-${pessoaId}`} className="text-xs font-normal">Já trabalhou com carteira ou por contrato</Label>
      </div>
      {jaTrabalhouClt && (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Quanto tempo" value={tempoClt} onChange={e => setTempoClt(e.target.value)} className="h-8 text-sm" />
          <Input placeholder="Em que atuava" value={atuacaoClt} onChange={e => setAtuacaoClt(e.target.value)} className="h-8 text-sm" />
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
        <Label className="text-xs">Quantas pessoas moram na casa, incluindo a pessoa (por faixa de idade)</Label>
        <div className="grid grid-cols-4 gap-1.5 mt-1">
          <div>
            <Label className="text-[10px] text-muted-foreground">Até 11 anos</Label>
            <Input type="number" min={0} value={criancas} onChange={e => setCriancas(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">12 a 18</Label>
            <Input type="number" min={0} value={adolescentes} onChange={e => setAdolescentes(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">19 a 59</Label>
            <Input type="number" min={0} value={adultos} onChange={e => setAdultos(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">60 ou mais</Label>
            <Input type="number" min={0} value={idosos} onChange={e => setIdosos(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        {totalCasa > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {totalCasa} {totalCasa === 1 ? "pessoa" : "pessoas"} na casa
            {percapitaPreview != null && (
              <span className="text-success-text font-medium"> · per capita {formatarReais(percapitaPreview)}</span>
            )}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Quem mora na casa</Label>
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
                <Input placeholder="Grau de parentesco" value={f.parentesco}
                  onChange={e => alterarFamiliar(i, "parentesco", e.target.value)} className="h-7 text-xs" />
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
      </div>

      <div>
        <Label className="text-xs">De que maneira tira o sustento da família</Label>
        <Textarea rows={2} value={sustento} onChange={e => setSustento(e.target.value)} className="text-sm" />
      </div>
      <div>
        <Label className="text-xs">Qual a maior necessidade da família no momento</Label>
        <Textarea rows={2} value={necessidade} onChange={e => setNecessidade(e.target.value)} className="text-sm" />
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
