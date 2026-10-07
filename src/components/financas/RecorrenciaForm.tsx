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
  criarRecorrencia, atualizarRecorrencia, ordenarCentrosParaSeletor,
  propagarLiquidacaoParaPrevistos, erroDaLiquidacao,
  sugerirCentroPorCategoria,
  FREQUENCIA_LABEL,
  type FinConta, type FinCategoria, type FinCentroCusto, type FinFornecedor,
  type FinRecorrencia, type FinMovimentoTipo, type FinFrequencia,
} from "@/services/finService";
import { CampoData } from "@/components/CampoData";
import { SeletorFavorecido, type Favorecido, type SugestoesDoFavorecido } from "@/components/financas/SeletorFavorecido";
import { calcularOcorrencias, situacaoDaSerie, type TipoDeRecorrencia } from "@/lib/recorrencia";
import { erroDaRecorrencia, gerarOcorrencias, propagarModelo } from "@/services/recorrenciaService";
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
  // O favorecido é uma REFERÊNCIA ao cadastro (fornecedor ou pessoa), não texto.
  const [favorecido, setFavorecido] = useState<Favorecido | null>(null);
  const [tipoSerie, setTipoSerie] = useState<TipoDeRecorrencia>("continua");
  const [totalParcelas, setTotalParcelas] = useState<number>(12);
  const [parcelaInicial, setParcelaInicial] = useState<number>(1);
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
      setFavorecido(
        recorrencia.fornecedor_id ? { tipo: "fornecedor", id: recorrencia.fornecedor_id, nome: recorrencia.fornecedor_nome ?? "Favorecido" }
        : recorrencia.pessoa_id ? { tipo: "pessoa", id: recorrencia.pessoa_id, nome: recorrencia.pessoa_nome ?? "Pessoa" }
        : null);
      setTipoSerie(recorrencia.tipo_recorrencia === "parcelamento" ? "parcelamento" : "continua");
      setTotalParcelas(recorrencia.total_parcelas ?? 12);
      setParcelaInicial(recorrencia.parcela_inicial ?? 1);
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
      setContaId(""); setCategoriaId(""); setCentroId(""); setFavorecido(null);
      setTipoSerie("continua"); setTotalParcelas(12); setParcelaInicial(1);
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

  // A prévia das parcelas, com as MESMAS regras que geram os lançamentos (lib/recorrencia.ts).
  const previaDaSerie = useMemo(() => tipoSerie === "parcelamento" && totalParcelas >= 2 && dataInicio
    ? calcularOcorrencias({ dataInicio, diaVencimento, frequencia, tipo: "parcelamento", totalParcelas, parcelaInicial }, "9999-12-31")
    : [], [tipoSerie, totalParcelas, parcelaInicial, dataInicio, diaVencimento, frequencia]);
  const situacaoDaPrevia = previaDaSerie.length > 0
    ? situacaoDaSerie({ dataInicio, diaVencimento, frequencia, tipo: "parcelamento", totalParcelas, parcelaInicial }, hojeLocal())
    : null;
  const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

  // O favorecido escolhido (ou o histórico dele, ao carregar) completa o que está vazio —
  // nunca sobrescreve o que a pessoa já preencheu.
  function aoEscolherFavorecido(f: Favorecido | null, sug?: SugestoesDoFavorecido) {
    setFavorecido(f);
    if (!f || !sug) return;
    if (sug.categoriaId && !categoriaId) setCategoriaId(sug.categoriaId);
    if (sug.centroId && !centroId) setCentroId(sug.centroId);
    if (sug.valor && !valor) setValor(sug.valor);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valor <= 0) { toast.error("Valor inválido"); return; }
    if (!contaId) { toast.error("Selecione a conta"); return; }
    if (diaVencimento < 1 || diaVencimento > 31) { toast.error("Dia inválido"); return; }
    // Saída sem favorecido era "só um lembrete": agora é obrigatório apontar o cadastro real.
    if (tipo === "saida" && !favorecido) { toast.error("Escolha o fornecedor, prestador ou favorecido (do cadastro)"); return; }
    const parcelado = tipoSerie === "parcelamento";
    if (parcelado) {
      if (!Number.isInteger(totalParcelas) || totalParcelas < 2) { toast.error("Informe o número de parcelas (2 ou mais)"); return; }
      if (!Number.isInteger(parcelaInicial) || parcelaInicial < 1 || parcelaInicial > totalParcelas) { toast.error("A parcela inicial precisa estar entre 1 e o total"); return; }
    }

    setBusy(true);
    try {
      const payload: any = {
        // Descrição é OPCIONAL (pedido dela, 06/10/2026): sem ela, vale o nome do favorecido — o
        // banco exige um texto, e é o que aparece nos lançamentos gerados.
        descricao: descricao.trim() || favorecido?.nome || categorias.find(c => c.id === categoriaId)?.nome || "Recorrência",
        tipo, valor, valor_variavel: valorVariavel,
        conta_id: contaId,
        categoria_id: categoriaId || null,
        centro_custo_id: centroId || null,
        fornecedor_id: favorecido?.tipo === "fornecedor" ? favorecido.id : null,
        frequencia, dia_vencimento: diaVencimento,
        data_inicio: dataInicio,
        data_fim: parcelado ? (previaDaSerie.at(-1)?.data ?? null) : (dataFim || null),
        observacao: observacao.trim() || null,
        lembrar_5d: lembrar5d, lembrar_1d: lembrar1d, lembrar_dia: lembrarDia,
      };

      // A coluna só existe depois da migration 20261006120000: manual (o padrão) NÃO é enviado,
      // para que quem ainda não migrou continue salvando recorrências normalmente.
      const formaOriginal = normalizarLiquidacao(recorrencia?.forma_liquidacao);
      const mudouForma = isEdit && formaLiquidacao !== formaOriginal;
      const saida = tipo === "saida";
      if (saida && (formaLiquidacao !== "manual" || mudouForma)) payload.forma_liquidacao = formaLiquidacao;

      // As colunas novas (migration 20261006150000) só vão no pacote quando têm o que dizer —
      // quem ainda não migrou continua salvando recorrências comuns normalmente.
      if (favorecido?.tipo === "pessoa" || recorrencia?.pessoa_id) payload.pessoa_id = favorecido?.tipo === "pessoa" ? favorecido.id : null;
      if (parcelado) {
        payload.tipo_recorrencia = "parcelamento"; payload.total_parcelas = totalParcelas; payload.parcela_inicial = parcelaInicial;
      } else if (recorrencia?.tipo_recorrencia === "parcelamento") {
        payload.tipo_recorrencia = "continua"; payload.total_parcelas = null; payload.parcela_inicial = 1;
      }

      let id: string;
      let salva: FinRecorrencia;
      if (isEdit && recorrencia) {
        await atualizarRecorrencia(recorrencia.id, payload);
        id = recorrencia.id;
        salva = { ...recorrencia, ...payload, id } as FinRecorrencia;
        // os previstos futuros já gerados passam a seguir o modelo novo
        try {
          const n = await propagarModelo(salva, recorrencia.descricao);
          if (n > 0) toast.success(`${n} lançamento(s) previsto(s) futuro(s) atualizado(s) com o modelo novo`);
        } catch { /* não impede salvar a recorrência */ }
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
        salva = novo;
        toast.success("Recorrência criada");
      }

      // Gera os previstos NO APP (o gerador SQL cortava em 90 dias, ignorava o início e não contava
      // parcelas — ver lib/recorrencia.ts): parcelamento gera TODAS as parcelas; contínua, 12 meses.
      const r = await gerarOcorrencias(salva);
      if (r.criados > 0) {
        const semFim = !parcelado && !dataFim;
        toast.success(semFim
          ? `${r.criados} lançamento(s) previsto(s) gerado(s) — a recorrência não tem data final: o sistema mantém os próximos 12 meses e renova sozinho`
          : `${r.criados} lançamento(s) previsto(s) gerado(s)${r.ultimaData ? ` — até ${r.ultimaData.slice(8, 10)}/${r.ultimaData.slice(5, 7)}/${r.ultimaData.slice(0, 4)}` : ""}`);
      }

      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      const m = erroDaRecorrencia(e);
      toast.error(m.startsWith("Falta aplicar") ? m : erroDaLiquidacao(e ?? {}));
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

          <SeletorFavorecido
            value={favorecido} onChange={aoEscolherFavorecido} categorias={categorias} centros={centros}
            obrigatorio={tipo === "saida"}
            rotulo={tipo === "saida" ? "Favorecido (empresa, prestador ou pessoa)" : "Pessoa / contribuinte (opcional)"} />

          <div>
            <Label>Descrição (opcional)</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder={favorecido ? `Em branco = "${favorecido.nome}"` : "Ex: Aluguel do templo"} />
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

          <fieldset className="rounded-md border p-2.5 space-y-2">
            <legend className="px-1 text-xs font-medium">Tipo de recorrência</legend>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" name="tipo-serie" className="mt-1" checked={tipoSerie === "continua"} onChange={() => setTipoSerie("continua")} />
              <span>Recorrência contínua<span className="block text-xs text-muted-foreground">Repete sem fim contado (aluguel, salário, plano de saúde).</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" name="tipo-serie" className="mt-1" checked={tipoSerie === "parcelamento"} onChange={() => setTipoSerie("parcelamento")} />
              <span>Parcelamento<span className="block text-xs text-muted-foreground">Um número fechado de parcelas (notebook em 12×, reforma em 5×).</span></span>
            </label>
            {tipoSerie === "parcelamento" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label>Nº de parcelas *</Label>
                  <Input type="number" min={2} max={120} value={totalParcelas || ""} onChange={(e) => setTotalParcelas(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Esta é a parcela nº</Label>
                  <Input type="number" min={1} max={totalParcelas || 1} value={parcelaInicial || ""} onChange={(e) => setParcelaInicial(Number(e.target.value))} />
                  <p className="text-[11px] text-muted-foreground mt-0.5">A do dia de "Início". 1 = começa agora.</p>
                </div>
                {situacaoDaPrevia && previaDaSerie.length > 0 && (
                  <p className="col-span-2 text-xs rounded bg-muted/40 px-2 py-1.5" role="status">
                    Vai gerar <b>{previaDaSerie.length} parcela{previaDaSerie.length > 1 ? "s" : ""}</b>: de {dataBr(previaDaSerie[0].data)} ({previaDaSerie[0].parcela}/{totalParcelas})
                    até <b>{dataBr(previaDaSerie[previaDaSerie.length - 1].data)}</b> ({totalParcelas}/{totalParcelas}).
                    {situacaoDaPrevia.parcelaAtual && situacaoDaPrevia.proximaParcela && (
                      <> Hoje: parcela atual {situacaoDaPrevia.parcelaAtual.numero}/{totalParcelas}; próxima {situacaoDaPrevia.proximaParcela.numero}/{totalParcelas} em {dataBr(situacaoDaPrevia.proximaParcela.data)}.</>
                    )}
                  </p>
                )}
              </div>
            )}
          </fieldset>

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

          {tipoSerie === "continua" && (
            <div>
              <Label>Encerra em (opcional)</Label>
              <CampoData value={dataFim} onChange={(v) => setDataFim(v)} permitirVazio />
              <p className="text-xs text-muted-foreground mt-0.5">Em branco = sem data final: o sistema mantém os próximos 12 meses gerados e renova sozinho</p>
            </div>
          )}

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
