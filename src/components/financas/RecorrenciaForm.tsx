import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import { RotateCw, TrendingUp, TrendingDown } from "lucide-react";
import {
  listarContas, listarCategorias, listarCentrosCusto, listarFornecedores,
  criarRecorrencia, atualizarRecorrencia, gerarRecorrencias,
  FREQUENCIA_LABEL,
  type FinConta, type FinCategoria, type FinCentroCusto, type FinFornecedor,
  type FinRecorrencia, type FinMovimentoTipo, type FinFrequencia,
} from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recorrencia?: FinRecorrencia | null;
  onSaved: () => void;
}

export function RecorrenciaForm({ open, onOpenChange, recorrencia, onSaved }: Props) {
  const isEdit = !!recorrencia;

  const [tipo, setTipo] = useState<FinMovimentoTipo>("saida");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState<number>(0);
  const [valorVariavel, setValorVariavel] = useState(false);
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [centroId, setCentroId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [frequencia, setFrequencia] = useState<FinFrequencia>("mensal");
  const [diaVencimento, setDiaVencimento] = useState<number>(10);
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState("");
  const [observacao, setObservacao] = useState("");
  const [lembrar5d, setLembrar5d] = useState(true);
  const [lembrar1d, setLembrar1d] = useState(true);
  const [lembrarDia, setLembrarDia] = useState(true);
  const [busy, setBusy] = useState(false);

  // Listas
  const [contas, setContas] = useState<FinConta[]>([]);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [fornecedores, setFornecedores] = useState<FinFornecedor[]>([]);

  useEffect(() => {
    if (!open) return;
    Promise.all([listarContas(), listarCategorias(tipo), listarCentrosCusto(), listarFornecedores()])
      .then(([cs, ks, ccs, fs]) => {
        setContas(cs); setCategorias(ks); setCentros(ccs); setFornecedores(fs);
      });
  }, [open, tipo]);

  useEffect(() => {
    if (!open) return;
    if (recorrencia) {
      setTipo(recorrencia.tipo);
      setDescricao(recorrencia.descricao);
      setValor(Number(recorrencia.valor));
      setValorVariavel(recorrencia.valor_variavel);
      setContaId(recorrencia.conta_id);
      setCategoriaId(recorrencia.categoria_id ?? "");
      setCentroId(recorrencia.centro_custo_id ?? "");
      setFornecedorId(recorrencia.fornecedor_id ?? "");
      setFrequencia(recorrencia.frequencia);
      setDiaVencimento(recorrencia.dia_vencimento);
      setDataInicio(recorrencia.data_inicio);
      setDataFim(recorrencia.data_fim ?? "");
      setObservacao(recorrencia.observacao ?? "");
      setLembrar5d(recorrencia.lembrar_5d);
      setLembrar1d(recorrencia.lembrar_1d);
      setLembrarDia(recorrencia.lembrar_dia);
    } else {
      setTipo("saida"); setDescricao(""); setValor(0); setValorVariavel(false);
      setContaId(""); setCategoriaId(""); setCentroId(""); setFornecedorId("");
      setFrequencia("mensal"); setDiaVencimento(10);
      setDataInicio(new Date().toISOString().slice(0, 10)); setDataFim("");
      setObservacao(""); setLembrar5d(true); setLembrar1d(true); setLembrarDia(true);
    }
  }, [open, recorrencia]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descricao.trim()) { toast.error("Informe a descrição"); return; }
    if (valor <= 0) { toast.error("Valor inválido"); return; }
    if (!contaId) { toast.error("Selecione a conta"); return; }
    if (diaVencimento < 1 || diaVencimento > 31) { toast.error("Dia inválido"); return; }

    setBusy(true);
    try {
      const payload: any = {
        descricao: descricao.trim(),
        tipo, valor, valor_variavel: valorVariavel,
        conta_id: contaId,
        categoria_id: categoriaId || null,
        centro_custo_id: centroId || null,
        fornecedor_id: fornecedorId || null,
        frequencia, dia_vencimento: diaVencimento,
        data_inicio: dataInicio,
        data_fim: dataFim || null,
        observacao: observacao.trim() || null,
        lembrar_5d: lembrar5d, lembrar_1d: lembrar1d, lembrar_dia: lembrarDia,
      };

      let id: string;
      if (isEdit && recorrencia) {
        await atualizarRecorrencia(recorrencia.id, payload);
        id = recorrencia.id;
        toast.success("Recorrência atualizada");
      } else {
        const novo = await criarRecorrencia(payload);
        id = novo.id;
        toast.success("Recorrência criada");
      }

      // Gera lançamentos previstos dos próximos 90 dias
      const qtd = await gerarRecorrencias({ recorrenciaId: id });
      if (qtd > 0) toast.success(`${qtd} lançamento(s) previsto(s) gerado(s)`);

      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <RotateCw className="w-5 h-5 text-gold" />
            {isEdit ? "Editar recorrência" : "Nova recorrência"}
          </DialogTitle>
          <DialogDescription>
            Aluguel, energia, salário — tudo que se repete todo mês.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="sm"
                variant={tipo === "entrada" ? "default" : "outline"}
                onClick={() => setTipo("entrada")}
                className={tipo === "entrada" ? "bg-emerald-600 text-white gap-1.5" : "gap-1.5"}>
                <TrendingUp className="w-3.5 h-3.5" /> Entrada
              </Button>
              <Button type="button" size="sm"
                variant={tipo === "saida" ? "default" : "outline"}
                onClick={() => setTipo("saida")}
                className={tipo === "saida" ? "bg-rose-600 text-white gap-1.5" : "gap-1.5"}>
                <TrendingDown className="w-3.5 h-3.5" /> Saída
              </Button>
            </div>
          )}

          <div>
            <Label>Descrição *</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} required
              placeholder="Ex: Aluguel do templo" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor *</Label>
              <Input type="number" step="0.01" min={0.01} required
                value={valor || ""} onChange={(e) => setValor(Number(e.target.value))} />
              <label className="flex items-center gap-1.5 text-[10px] mt-0.5 cursor-pointer">
                <input type="checkbox" checked={valorVariavel} onChange={(e) => setValorVariavel(e.target.checked)} />
                Valor varia mês a mês (ex: energia)
              </label>
            </div>
            <div>
              <Label>Conta *</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Frequência *</Label>
              <Select value={frequencia} onValueChange={(v) => setFrequencia(v as FinFrequencia)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(FREQUENCIA_LABEL) as [FinFrequencia, string][]).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dia venc.</Label>
              <Input type="number" min={1} max={31} required
                value={diaVencimento} onChange={(e) => setDiaVencimento(Number(e.target.value))} />
            </div>
            <div>
              <Label>Início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Centro de custo</Label>
              <Select value={centroId} onValueChange={setCentroId}>
                <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Encerra em (opcional)</Label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Em branco = indefinido</p>
          </div>

          <div className="border rounded-md p-2 bg-muted/20 space-y-1">
            <p className="text-[11px] font-medium">🔔 Lembrar antes do vencimento</p>
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={lembrar5d} onChange={(e) => setLembrar5d(e.target.checked)} />
                5 dias antes
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={lembrar1d} onChange={(e) => setLembrar1d(e.target.checked)} />
                1 dia antes
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={lembrarDia} onChange={(e) => setLembrarDia(e.target.checked)} />
                No vencimento
              </label>
            </div>
          </div>

          <div>
            <Label>Observação</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : isEdit ? "Salvar" : "Criar e gerar próximos"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
