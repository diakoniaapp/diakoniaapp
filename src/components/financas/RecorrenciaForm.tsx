import { useState, useEffect, useMemo } from "react";
import { hojeLocal } from "@/lib/data";
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
  criarRecorrencia, atualizarRecorrencia, gerarRecorrencias, ordenarCentrosParaSeletor,
  propagarLiquidacaoParaPrevistos, erroDaLiquidacao,
  sugerirCentroPorCategoria,
  FREQUENCIA_LABEL,
  type FinConta, type FinCategoria, type FinCentroCusto, type FinFornecedor,
  type FinRecorrencia, type FinMovimentoTipo, type FinFrequencia,
} from "@/services/finService";
import { CampoData } from "@/components/CampoData";
import {
  FORMAS_LIQUIDACAO, ROTULO_LIQUIDACAO, DICA_LIQUIDACAO, normalizarLiquidacao, type FormaLiquidacao,
} from "@/lib/formaLiquidacao";

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
  const [formaLiquidacao, setFormaLiquidacao] = useState<FormaLiquidacao>("manual");
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [centroId, setCentroId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [frequencia, setFrequencia] = useState<FinFrequencia>("mensal");
  const [diaVencimento, setDiaVencimento] = useState<number>(10);
  const [dataInicio, setDataInicio] = useState(hojeLocal());
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
  // Mesmo agrupamento por pai das outras telas que escolhem centro de
  // custo — ver `ordenarCentrosParaSeletor` em finService.ts.
  const centrosOrdenados = useMemo(() => ordenarCentrosParaSeletor(centros), [centros]);
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
      setFormaLiquidacao(normalizarLiquidacao(recorrencia.forma_liquidacao));
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
      setTipo("saida"); setDescricao(""); setValor(0); setValorVariavel(false); setFormaLiquidacao("manual");
      setContaId(""); setCategoriaId(""); setCentroId(""); setFornecedorId("");
      setFrequencia("mensal"); setDiaVencimento(10);
      setDataInicio(hojeLocal()); setDataFim("");
      setObservacao(""); setLembrar5d(true); setLembrar1d(true); setLembrarDia(true);
    }
  }, [open, recorrencia]);

  // Auto-sugestão de centro de custo (22/09/2026) — mesmo mecanismo do
  // `LancamentoForm.tsx`: só sugere se o campo ainda está vazio, então
  // não sobrescreve o que já veio de `recorrencia` (efeito acima) nem uma
  // escolha manual da pessoa.
  useEffect(() => {
    if (!categoriaId || centroId || !open) return;
    (async () => {
      const sugerido = await sugerirCentroPorCategoria(categoriaId);
      if (sugerido) setCentroId(sugerido);
    })();
  }, [categoriaId, open]);

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

      // A coluna só existe depois da migration 20261006120000: manual (o padrão) NÃO é enviado,
      // para que quem ainda não migrou continue salvando recorrências normalmente.
      const formaOriginal = normalizarLiquidacao(recorrencia?.forma_liquidacao);
      const mudouForma = isEdit && formaLiquidacao !== formaOriginal;
      const saida = tipo === "saida";
      if (saida && (formaLiquidacao !== "manual" || mudouForma)) payload.forma_liquidacao = formaLiquidacao;

      let id: string;
      if (isEdit && recorrencia) {
        await atualizarRecorrencia(recorrencia.id, payload);
        id = recorrencia.id;
        toast.success("Recorrência atualizada");
        // os previstos que já foram gerados não herdam a mudança sozinhos
        if (saida && (formaLiquidacao !== "manual" || mudouForma)) {
          const n = await propagarLiquidacaoParaPrevistos(
            { descricao: payload.descricao, tipo, conta_id: contaId }, formaLiquidacao, valorVariavel);
          if (n > 0) toast.success(`${n} lançamento(s) previsto(s) já gerado(s) também mudaram para "${ROTULO_LIQUIDACAO[formaLiquidacao]}"`);
        }
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
      toast.error(erroDaLiquidacao(e ?? {}));
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
                className={tipo === "entrada" ? "bg-success text-white gap-1.5" : "gap-1.5"}>
                <TrendingUp className="w-3.5 h-3.5" /> Entrada
              </Button>
              <Button type="button" size="sm"
                variant={tipo === "saida" ? "default" : "outline"}
                onClick={() => setTipo("saida")}
                className={tipo === "saida" ? "bg-destructive text-white gap-1.5" : "gap-1.5"}>
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
              <Label>{valorVariavel ? "Valor previsto *" : "Valor *"}</Label>
              <Input type="number" step="0.01" min={0.01} required
                value={valor || ""} onChange={(e) => setValor(Number(e.target.value))} />
              <div className="mt-1 space-y-0.5 text-xs" role="radiogroup" aria-label="O valor muda todo mês?">
                <label className="flex items-start gap-1.5 cursor-pointer">
                  <input type="radio" name="valor-tipo" className="mt-0.5" checked={!valorVariavel} onChange={() => setValorVariavel(false)} />
                  <span><b>Valor fixo</b> — igual todo mês (condomínio, plano de saúde)</span>
                </label>
                <label className="flex items-start gap-1.5 cursor-pointer">
                  <input type="radio" name="valor-tipo" className="mt-0.5" checked={valorVariavel} onChange={() => setValorVariavel(true)} />
                  <span><b>Valor variável</b> — muda todo mês (energia, água, telefonia)</span>
                </label>
              </div>
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

          {tipo === "saida" && (
            <fieldset className="rounded-md border p-2.5 space-y-1">
              <legend className="px-1 text-xs font-medium">Forma de liquidação</legend>
              {FORMAS_LIQUIDACAO.map(f => (
                <label key={f} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="radio" name="forma-liquidacao" className="mt-1" checked={formaLiquidacao === f}
                    onChange={() => setFormaLiquidacao(f)} />
                  <span className="min-w-0">
                    {ROTULO_LIQUIDACAO[f]}
                    <span className="block text-xs text-muted-foreground">{DICA_LIQUIDACAO[f]}</span>
                  </span>
                </label>
              ))}
              {formaLiquidacao !== "manual" && formaLiquidacao !== "boleto_fatura" && (
                <p className="text-xs text-muted-foreground pt-1">
                  Não entra em "Contas a pagar": fica em "Débitos automáticos previstos" até o débito aparecer no extrato.
                </p>
              )}
            </fieldset>
          )}

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
            {/* min-w-0 — sem isso o `<input type="date">` nativo não
                encolhe abaixo da própria largura mínima e estoura a
                coluna do grid de 3 em tela estreita. Mesmo transbordo
                documentado no CLAUDE.md (§6.2) — achado pela Telma
                (15/09/2026).
                min/max — sem isso o segmento de ANO aceita dígitos sem
                limite ao corrigir (ex.: "26666"), estourando a caixa por
                dentro. Achado pela Telma (16/09/2026). */}
            <div className="min-w-0">
              <Label>Início</Label>
              <CampoData value={dataInicio} onChange={(v) => setDataInicio(v)} className="w-full" />
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
                <SelectTrigger>
                  <SelectValue placeholder="(opcional)">
                    {centros.find(c => c.id === centroId)?.nome}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {centrosOrdenados.map(({ centro, rotulo, indentado }) => (
                    <SelectItem key={centro.id} value={centro.id} className={indentado ? "pl-12 text-muted-foreground" : "font-medium"}>
                      {rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Encerra em (opcional)</Label>
            <CampoData value={dataFim} onChange={(v) => setDataFim(v)} />
            <p className="text-xs text-muted-foreground mt-0.5">Em branco = indefinido</p>
          </div>

          <div className="border rounded-md p-2 bg-muted/20 space-y-1">
            <p className="text-xs font-medium">🔔 Lembrar antes do vencimento</p>
            <div className="grid grid-cols-3 gap-1 text-xs">
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
