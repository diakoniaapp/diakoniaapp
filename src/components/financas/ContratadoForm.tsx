// ─── ContratadoForm.tsx ──────────────────────────────────────────────────
//
// Fase 5 do roadmap Financeiro (docs/ROADMAP_FINANCEIRO_ERP.md) — até aqui
// `criarContratado`/`atualizarContratado` existiam em `folhaService.ts` e
// nenhuma tela os chamava; o botão "Novo" em `FinancasFolha.tsx` ficava
// desabilitado com o texto "(em breve)". Este formulário fecha isso.
//
// `BuscaPessoa` é reaproveitado tal como está (já usado em Agenda/
// Diaconia/Famílias) — selecionar um membro pré-preenche nome/CPF e grava
// `pessoa_id` (coluna que já existia em `fin_contratados`, nunca lida nem
// escrita por nenhuma tela). Deixar sem selecionar cadastra alguém de
// fora do quadro de membros — funcionário nem sempre é da igreja.
import { useState, useEffect } from "react";
import { hojeLocal } from "@/lib/data";
import { paraNumero } from "@/lib/dinheiro";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BuscaPessoa, type PessoaResultado } from "@/components/ui/BuscaPessoa";
import { toast } from "sonner";
import { Briefcase } from "lucide-react";
import {
  criarContratado, atualizarContratado, VINCULO_LABEL,
  type FinContratado, type FinVinculoTipo,
} from "@/services/folhaService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contratado?: FinContratado | null;
  onSaved: () => void;
}

const VAZIO = {
  pessoaId: "", nome: "", cpf: "", vinculo: "clt" as FinVinculoTipo,
  cargo: "", dataInicio: hojeLocal(), dataFim: "",
  salarioBase: "", jornada: "44", numDependentes: "0",
  valeAlimentacaoDia: "", valeTransporteDias: "22", vtPassagemValor: "",
  cnpj: "", meiAtividade: "", meiValorMensal: "",
  rpaValorPadrao: "",
  prebendaValor: "", prebendaAuxAluguel: "", prebendaAuxOutros: "",
  igrejaTemCebas: false, pastorContribuiInss: true,
  observacao: "",
};

export function ContratadoForm({ open, onOpenChange, contratado, onSaved }: Props) {
  const isEdit = !!contratado;
  const [campos, setCampos] = useState(VAZIO);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (contratado) {
      setCampos({
        pessoaId: contratado.pessoa_id ?? "",
        nome: contratado.nome,
        cpf: contratado.cpf ?? "",
        vinculo: contratado.vinculo,
        cargo: contratado.cargo ?? "",
        dataInicio: contratado.data_inicio,
        dataFim: contratado.data_fim ?? "",
        salarioBase: contratado.salario_base?.toString() ?? "",
        jornada: contratado.jornada_horas_semana?.toString() ?? "44",
        numDependentes: contratado.num_dependentes?.toString() ?? "0",
        valeAlimentacaoDia: contratado.vale_alimentacao_dia?.toString() ?? "",
        valeTransporteDias: contratado.vale_transporte_dias?.toString() ?? "22",
        vtPassagemValor: contratado.vt_passagem_valor?.toString() ?? "",
        cnpj: contratado.cnpj ?? "",
        meiAtividade: contratado.mei_atividade ?? "",
        meiValorMensal: contratado.mei_valor_mensal?.toString() ?? "",
        rpaValorPadrao: contratado.rpa_valor_padrao?.toString() ?? "",
        prebendaValor: contratado.prebenda_valor?.toString() ?? "",
        prebendaAuxAluguel: contratado.prebenda_aux_aluguel?.toString() ?? "",
        prebendaAuxOutros: contratado.prebenda_aux_outros?.toString() ?? "",
        igrejaTemCebas: contratado.igreja_tem_cebas,
        pastorContribuiInss: contratado.pastor_contribui_inss,
        observacao: contratado.observacao ?? "",
      });
    } else {
      setCampos(VAZIO);
    }
  }, [open, contratado]);

  function set<K extends keyof typeof VAZIO>(campo: K, valor: typeof VAZIO[K]) {
    setCampos(c => ({ ...c, [campo]: valor }));
  }

  function escolherPessoa(id: string, pessoa: PessoaResultado | null) {
    set("pessoaId", id);
    if (pessoa) {
      set("nome", pessoa.nome_completo);
      if (pessoa.cpf) set("cpf", pessoa.cpf);
    }
  }

  // `paraNumero` (não `Number` puro): mesmo bug do "928,00" rejeitado por
  // `type="number"` corrigido aqui — os campos de dinheiro deste form
  // (salário, VT, MEI, RPA, prebenda) agora são texto livre, e o texto
  // digitado pode vir com vírgula decimal.
  const num = (s: string) => (s.trim() === "" ? null : paraNumero(s));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campos.nome.trim()) { toast.error("Informe o nome"); return; }
    if (!campos.dataInicio) { toast.error("Informe a data de início"); return; }

    setBusy(true);
    try {
      const payload: Partial<FinContratado> = {
        pessoa_id: campos.pessoaId || null,
        nome: campos.nome.trim(),
        cpf: campos.cpf.replace(/\D/g, "") || null,
        vinculo: campos.vinculo,
        cargo: campos.cargo.trim() || null,
        data_inicio: campos.dataInicio,
        data_fim: campos.dataFim || null,
        salario_base: num(campos.salarioBase),
        jornada_horas_semana: num(campos.jornada),
        num_dependentes: num(campos.numDependentes) ?? 0,
        vale_alimentacao_dia: num(campos.valeAlimentacaoDia),
        vale_transporte_dias: num(campos.valeTransporteDias) ?? 0,
        vt_passagem_valor: num(campos.vtPassagemValor),
        cnpj: campos.cnpj.replace(/\D/g, "") || null,
        mei_atividade: campos.meiAtividade.trim() || null,
        mei_valor_mensal: num(campos.meiValorMensal),
        rpa_valor_padrao: num(campos.rpaValorPadrao),
        prebenda_valor: num(campos.prebendaValor),
        prebenda_aux_aluguel: num(campos.prebendaAuxAluguel) ?? 0,
        prebenda_aux_outros: num(campos.prebendaAuxOutros) ?? 0,
        igreja_tem_cebas: campos.igrejaTemCebas,
        pastor_contribui_inss: campos.pastorContribuiInss,
        observacao: campos.observacao.trim() || null,
      };

      if (isEdit && contratado) {
        await atualizarContratado(contratado.id, payload);
        toast.success("Contratado atualizado");
      } else {
        await criarContratado(payload);
        toast.success("Contratado cadastrado");
      }

      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar contratado");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-gold" />
            {isEdit ? "Editar contratado" : "Novo contratado"}
          </DialogTitle>
          <DialogDescription>
            CLT, MEI, RPA, prebenda pastoral, estágio ou voluntariado remunerado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Já é um membro, congregado ou visitante?</Label>
            <BuscaPessoa value={campos.pessoaId} onChange={escolherPessoa}
              placeholder="Buscar no catálogo de pessoas (opcional)..." />
            <p className="text-xs text-muted-foreground mt-0.5">
              Selecionar preenche nome e CPF sozinho. Em branco = pessoa de fora do quadro de membros.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome *</Label>
              <Input value={campos.nome} onChange={(e) => set("nome", e.target.value)} required autoFocus />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={campos.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="Só números" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vínculo *</Label>
              <Select value={campos.vinculo} onValueChange={(v) => set("vinculo", v as FinVinculoTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(VINCULO_LABEL) as [FinVinculoTipo, string][]).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cargo</Label>
              <Input value={campos.cargo} onChange={(e) => set("cargo", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início *</Label>
              <Input type="date" value={campos.dataInicio} onChange={(e) => set("dataInicio", e.target.value)} required />
            </div>
            <div>
              <Label>Fim (opcional)</Label>
              <Input type="date" value={campos.dataFim} onChange={(e) => set("dataFim", e.target.value)} />
            </div>
          </div>

          {campos.vinculo === "clt" && (
            <div className="border rounded-md p-2 bg-muted/20 space-y-2">
              <p className="text-xs font-medium">Dados CLT</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Salário base</Label>
                  <Input type="text" inputMode="decimal" value={campos.salarioBase} onChange={(e) => set("salarioBase", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Jornada (h/semana)</Label>
                  <Input type="number" value={campos.jornada} onChange={(e) => set("jornada", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Dependentes</Label>
                  <Input type="number" min={0} value={campos.numDependentes} onChange={(e) => set("numDependentes", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Vale-alimentação/dia</Label>
                  <Input type="text" inputMode="decimal" value={campos.valeAlimentacaoDia} onChange={(e) => set("valeAlimentacaoDia", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Vale-transporte (dias/mês)</Label>
                  <Input type="number" min={0} value={campos.valeTransporteDias} onChange={(e) => set("valeTransporteDias", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Valor da passagem (VT)</Label>
                  <Input type="text" inputMode="decimal" value={campos.vtPassagemValor} onChange={(e) => set("vtPassagemValor", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
            </div>
          )}

          {(campos.vinculo === "estagio" || campos.vinculo === "voluntario_remunerado") && (
            <div>
              <Label>Valor mensal</Label>
              <Input type="text" inputMode="decimal" value={campos.salarioBase} onChange={(e) => set("salarioBase", e.target.value)} />
            </div>
          )}

          {campos.vinculo === "mei" && (
            <div className="border rounded-md p-2 bg-muted/20 space-y-2">
              <p className="text-xs font-medium">Dados MEI</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">CNPJ</Label>
                  <Input value={campos.cnpj} onChange={(e) => set("cnpj", e.target.value)} className="h-8 text-sm" placeholder="Só números" />
                </div>
                <div>
                  <Label className="text-xs">Valor mensal</Label>
                  <Input type="text" inputMode="decimal" value={campos.meiValorMensal} onChange={(e) => set("meiValorMensal", e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Atividade</Label>
                  <Input value={campos.meiAtividade} onChange={(e) => set("meiAtividade", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
            </div>
          )}

          {campos.vinculo === "rpa" && (
            <div>
              <Label>Valor padrão (RPA)</Label>
              <Input type="text" inputMode="decimal" value={campos.rpaValorPadrao} onChange={(e) => set("rpaValorPadrao", e.target.value)} />
            </div>
          )}

          {campos.vinculo === "prebenda" && (
            <div className="border rounded-md p-2 bg-muted/20 space-y-2">
              <p className="text-xs font-medium">Dados de Prebenda</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Prebenda mensal</Label>
                  <Input type="text" inputMode="decimal" value={campos.prebendaValor} onChange={(e) => set("prebendaValor", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Auxílio aluguel</Label>
                  <Input type="text" inputMode="decimal" value={campos.prebendaAuxAluguel} onChange={(e) => set("prebendaAuxAluguel", e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Outros auxílios</Label>
                  <Input type="text" inputMode="decimal" value={campos.prebendaAuxOutros} onChange={(e) => set("prebendaAuxOutros", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={campos.igrejaTemCebas} onChange={(e) => set("igrejaTemCebas", e.target.checked)} />
                Igreja tem certificado CEBAS
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={campos.pastorContribuiInss} onChange={(e) => set("pastorContribuiInss", e.target.checked)} />
                Pastor contribui INSS individual (recomendado)
              </label>
            </div>
          )}

          <div>
            <Label>Observação</Label>
            <Textarea rows={2} value={campos.observacao} onChange={(e) => set("observacao", e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : isEdit ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
