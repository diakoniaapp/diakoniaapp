// ─── DiaconiaPessoas.tsx — quem é atendido nesta área ──────────────────────
//
// Cadastro leve (nome, telefone) + a ficha socioeconômica, enxuta e
// qualitativa como a igreja pediu: sem cálculo automático de vulnerabilidade,
// sem renda per capita — moradia, trabalho, benefício social, e uma
// observação livre. Cada preenchimento é uma linha nova; a ficha antiga não
// desaparece quando a situação muda.
//
// Só ministra/líder chega até aqui de fato: a RPC `diaconia_salvar_ficha`
// recusa qualquer outra conta, e a tela só mostra o erro dela — não decide
// nada sozinha.

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
import { ArrowLeft, ChevronRight, HeartHandshake, Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  pessoasDaArea, criarPessoa, fichasDaPessoa, salvarFicha,
  SITUACOES_MORADIA, SITUACOES_TRABALHO, rotuloMoradia, rotuloTrabalho,
  type PessoaAssistida, type FichaSocioeconomica,
} from "@/services/diaconiaService";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { PaginaSkeleton } from "@/components/ListState";
import { supabase } from "@/integrations/supabase/client";

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
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${aberta === p.id ? "rotate-90" : ""}`} />
              </button>
              {aberta === p.id && <FichaDaPessoa pessoaId={p.id} />}
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
  const [busy, setBusy] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Nome obrigatório"); return; }
    setBusy(true);
    try {
      const r = await criarPessoa(areaId, nome, tel || undefined);
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success("Cadastrada");
      setNome(""); setTel(""); onOpenChange(false);
      onCriada();
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
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

function FichaDaPessoa({ pessoaId }: { pessoaId: string }) {
  const [fichas, setFichas] = useState<FichaSocioeconomica[] | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);

  useEffect(() => {
    fichasDaPessoa(pessoaId).then(setFichas).catch(() => setFichas([]));
  }, [pessoaId]);

  const recarregar = () => fichasDaPessoa(pessoaId).then(setFichas);

  return (
    <div className="px-3 pb-3 pl-8 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Ficha socioeconômica
      </p>

      {fichas === null ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : fichas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma ficha preenchida ainda.</p>
      ) : (
        <ul className="space-y-2">
          {fichas.map(f => (
            <li key={f.id} className="rounded-md border bg-muted/30 px-2.5 py-2 text-xs">
              <p className="font-medium text-muted-foreground mb-1">
                {f.data_preenchimento.split("-").reverse().join("/")}
              </p>
              <p>
                {[
                  f.composicao_familiar ? `${f.composicao_familiar} na casa` : null,
                  rotuloMoradia(f.situacao_moradia),
                  rotuloTrabalho(f.situacao_trabalho),
                  f.recebe_beneficio_social === true
                    ? `recebe benefício${f.qual_beneficio ? ` (${f.qual_beneficio})` : ""}`
                    : f.recebe_beneficio_social === false ? "não recebe benefício" : null,
                ].filter(Boolean).join(" · ") || "sem dados"}
              </p>
              {f.observacoes && <p className="mt-1 text-muted-foreground">{f.observacoes}</p>}
            </li>
          ))}
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

function NovaFicha({ pessoaId, onSalvou, onCancelar }: {
  pessoaId: string; onSalvou: () => void; onCancelar: () => void;
}) {
  const [composicao, setComposicao] = useState("");
  const [moradia, setMoradia] = useState<string>("");
  const [trabalho, setTrabalho] = useState<string>("");
  const [recebeBeneficio, setRecebeBeneficio] = useState(false);
  const [qualBeneficio, setQualBeneficio] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  async function salvar() {
    setBusy(true);
    try {
      const r = await salvarFicha(pessoaId, {
        composicaoFamiliar: composicao ? Number(composicao) : null,
        situacaoMoradia: moradia || null,
        situacaoTrabalho: trabalho || null,
        recebeBeneficioSocial: recebeBeneficio,
        qualBeneficio: recebeBeneficio ? qualBeneficio : null,
        observacoes: obs || null,
      });
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success("Ficha salva");
      onSalvou();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-md border bg-card px-2.5 py-2.5 space-y-2.5">
      <div>
        <Label className="text-xs">Quantas pessoas moram na casa</Label>
        <Input type="number" min={1} value={composicao} onChange={e => setComposicao(e.target.value)}
          className="h-8 text-sm" />
      </div>
      <div>
        <Label className="text-xs">Situação de moradia</Label>
        <Select value={moradia} onValueChange={setMoradia}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {SITUACOES_MORADIA.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Situação de trabalho</Label>
        <Select value={trabalho} onValueChange={setTrabalho}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {SITUACOES_TRABALHO.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id={`beneficio-${pessoaId}`} checked={recebeBeneficio}
          onCheckedChange={(v) => setRecebeBeneficio(!!v)} />
        <Label htmlFor={`beneficio-${pessoaId}`} className="text-xs font-normal">
          Recebe algum benefício social
        </Label>
      </div>
      {recebeBeneficio && (
        <Input placeholder="Qual — Bolsa Família, BPC, Auxílio Gás…" value={qualBeneficio}
          onChange={e => setQualBeneficio(e.target.value)} className="h-8 text-sm" />
      )}
      <div>
        <Label className="text-xs">Observações</Label>
        <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} className="text-sm" />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancelar} disabled={busy}>Cancelar</Button>
        <Button size="sm" onClick={salvar} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
      </div>
    </div>
  );
}
