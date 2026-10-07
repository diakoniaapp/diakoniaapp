// ─── MesaDoTesoureiro.tsx — a aba "1 Operações" como mesa de trabalho ───────────
//
// Antes: três "Centrais" (Pagamentos, Arrecadação, Conciliação) — um painel de indicadores.
// Na rotina real o tesoureiro não abre o dia olhando quanto se arrecadou; abre olhando o que
// precisa PAGAR, o que VENCE, o que o banco vai DEBITAR sozinho, o que falta DOCUMENTAR e se o
// CAIXA aguenta. Esta é essa tela, na ordem em que a manhã dele acontece:
//
//   1. a faixa do dia  — caixa, compromissos, o que sobra, débitos a conferir;
//   2. contas a pagar  — atrasadas · hoje · amanhã · 7 dias · 30 dias, com Pagar e anexo;
//   3. seu dia         — o checklist (cada item diz o que falta ou que está em dia);
//   4. débitos automáticos — acompanhar, não pagar (previstos × encontrados × não encontrados);
//   5. pagamentos de hoje e comprovantes pendentes;
//   6. documentação, recorrências e extrato.
//
// Arrecadação (dízimos e ofertas) mora em "2 Gestão"; a conciliação, no checklist do
// "4 Fechamento" e no importador de extrato. Racional completo: docs/OPERACOES_MESA_DO_TESOUREIRO.md.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, FileText, Landmark,
  Loader2, Paperclip, RefreshCw, RotateCw, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { brl, nomeExtrato, type FinVencimento } from "@/services/finService";
import { hojeLocal } from "@/lib/data";
import { parciaisEmAberto, type ParcialEmAberto } from "@/services/obrigacoesService";
import { indicadoresDeDebitos, situacaoDoDebito, type SituacaoDoDebito } from "@/lib/formaLiquidacao";
import {
  agruparVencimentos, coberturaDoCaixa, diasEntreDatas, montarChecklist, pendenciasDoChecklist,
  resumoDoCaixa, soma, totalAPagar, type ItemDoChecklist,
} from "@/lib/mesaOperacoes";
import { carregarMesa, type DadosDaMesa, type DebitoDoMes, type PagoRecente } from "@/services/mesaOperacoesService";

interface Props {
  /** Muda quando o painel recarrega (depois de pagar, aprovar…): a mesa lê de novo. */
  chaveDeAtualizacao: number;
  aprovacoesPendentes: number;
  onPagar: (v: FinVencimento) => void;
  onAnexo: (a: { id: string; label: string }) => void;
  onNovaSaida: () => void;
  onImportarExtrato: () => void;
  onAprovacoes: () => void;
  onRecorrencias: () => void;
}

const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const rolarPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const CHIP_DEBITO: Record<SituacaoDoDebito, { texto: string; classe: string }> = {
  aguardando: { texto: "Aguardando débito", classe: "border-info-line bg-info-soft text-info-text" },
  encontrado: { texto: "Débito encontrado", classe: "border-success-line bg-success-soft text-success-text" },
  nao_encontrado: { texto: "Não encontrado", classe: "border-destructive-line bg-destructive-soft text-destructive-text" },
};

function Cartao({ id, titulo, subtitulo, direita, children, className = "" }: {
  id?: string; titulo: string; subtitulo?: string; direita?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`rounded-lg border bg-card scroll-mt-[220px] ${className}`}>
      <header className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold">{titulo}</h2>
          {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {direita && <div className="shrink-0 text-right">{direita}</div>}
      </header>
      <div className="px-4 pb-3">{children}</div>
    </section>
  );
}

function Numero({ rotulo, valor, tom, detalhe }: { rotulo: string; valor: string; tom?: "bom" | "ruim" | "neutro"; detalhe?: string }) {
  const cor = tom === "bom" ? "text-success-text" : tom === "ruim" ? "text-destructive-text" : "";
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 min-w-0">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold truncate">{rotulo}</p>
      <p className={`text-lg font-extrabold tabular-nums truncate ${cor}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground truncate">{detalhe}</p>}
    </div>
  );
}

function LinhaDeConta({ v, temAnexo, parcial, onPagar, onAnexo }: {
  v: FinVencimento; temAnexo: boolean; parcial?: ParcialEmAberto; onPagar: () => void; onAnexo: () => void;
}) {
  const { principal, secundario } = nomeExtrato(v);
  const dias = v.dias_para_vencer;
  const quando = dias < 0 ? `há ${Math.abs(dias)}d` : dias === 0 ? "hoje" : dias === 1 ? "amanhã" : dataCurta(v.data);
  return (
    <li className="flex items-center gap-2 py-2 border-t first:border-t-0 text-sm min-w-0">
      <span className={`w-14 shrink-0 text-xs tabular-nums ${dias < 0 ? "text-destructive-text font-semibold" : "text-muted-foreground"}`}>{quando}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{principal}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {secundario && <span className="truncate">{secundario}</span>}
          {v.centro_custo_nome && <span className="truncate">{v.centro_custo_nome}</span>}
          {v.valor_variavel && <span>valor estimado</span>}
        </span>
        {parcial && (
          <span className="block text-xs text-warning-text tabular-nums">
            Pago parcialmente: {brl(parcial.pago)} de {brl(parcial.original)} · saldo pendente {brl(parcial.saldo)}
          </span>
        )}
      </span>
      <span className="tabular-nums font-medium shrink-0">{brl(v.valor)}</span>
      <button type="button" onClick={onAnexo}
        title={temAnexo ? "Documento anexado — abrir" : "Sem documento — anexar boleto/fatura"}
        className={`rounded p-1.5 shrink-0 hover:bg-muted ${temAnexo ? "text-success-text" : "text-warning-text"}`}>
        <Paperclip className="w-3.5 h-3.5" />
      </button>
      <Button variant="success" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={onPagar}>
        <CheckCircle2 className="w-3 h-3" /> Pagar
      </Button>
    </li>
  );
}

export function MesaDoTesoureiro({
  chaveDeAtualizacao, aprovacoesPendentes, onPagar, onAnexo, onNovaSaida, onImportarExtrato, onAprovacoes, onRecorrencias,
}: Props) {
  const hoje = hojeLocal();
  const [dados, setDados] = useState<DadosDaMesa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mostrar30, setMostrar30] = useState(false);
  // contas pagas parcialmente (liquidação real): a linha do saldo diz quanto já foi pago; sem a migration, mapa vazio
  const [parciais, setParciais] = useState<Map<string, ParcialEmAberto>>(new Map());
  useEffect(() => {
    let cancelado = false;
    parciaisEmAberto().then(m => { if (!cancelado) setParciais(m); }).catch(() => { /* melhoria: a mesa segue igual */ });
    return () => { cancelado = true; };
  }, [chaveDeAtualizacao]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setDados(await carregarMesa(hoje)); } finally { setCarregando(false); }
  }, [hoje]);
  useEffect(() => { carregar(); }, [carregar, chaveDeAtualizacao]);

  const derivados = useMemo(() => {
    if (!dados) return null;
    const { aPagar, automaticos } = agruparVencimentos(dados.vencimentos);
    const caixa = resumoDoCaixa(dados.contas);
    const compromissos7 = totalAPagar(aPagar, "semana");
    const cobertura = coberturaDoCaixa(caixa.disponivel, compromissos7);
    const ind = indicadoresDeDebitos(dados.debitos, hoje);
    const debitosAConferir = dados.debitos.filter(d => d.status === "previsto" && d.data <= hoje).length;
    const pagosHoje = dados.pagosRecentes.filter(p => p.dia === hoje);
    const semComprovante = dados.pagosRecentes.filter(p => !p.temComprovante);
    const checklist = montarChecklist({
      atrasadas: aPagar.atrasadas.length, venceHoje: aPagar.hoje.length, debitosAConferir,
      comprovantesPendentes: semComprovante.length,
      diasSemExtrato: dados.ultimoMovimentoBanco ? diasEntreDatas(dados.ultimoMovimentoBanco, hoje) : null,
      aprovacoesParadas: aprovacoesPendentes,
      documentosFaltando: (dados.documentos?.pendencias ?? 0) + (dados.documentosAnterior?.resumo.pendencias ?? 0),
    });
    const porId = new Map(dados.vencimentos.map(v => [v.id, v]));
    return { aPagar, automaticos, caixa, compromissos7, cobertura, ind, debitosAConferir, pagosHoje, semComprovante, checklist, porId };
  }, [dados, hoje, aprovacoesPendentes]);

  if (!dados || !derivados) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Montando a mesa de hoje…
      </p>
    );
  }
  const { aPagar, caixa, compromissos7, cobertura, ind, pagosHoje, semComprovante, checklist, porId } = derivados;
  const pendentesDoDia = pendenciasDoChecklist(checklist);

  const grupo = (id: string, titulo: string, itens: FinVencimento[], tom?: string) => itens.length === 0 ? null : (
    <div key={id} className="mb-2 last:mb-0">
      <div className="flex items-baseline justify-between gap-2 pt-1">
        <h3 className={`text-xs font-bold uppercase tracking-wide ${tom ?? "text-muted-foreground"}`}>{titulo} · {itens.length}</h3>
        <span className="text-xs tabular-nums font-semibold">{brl(soma(itens))}</span>
      </div>
      <ul>
        {itens.map(v => (
          <LinhaDeConta key={v.id} v={v} temAnexo={dados.comAnexo.has(v.id)} parcial={parciais.get(v.id)}
            onPagar={() => onPagar(v)} onAnexo={() => onAnexo({ id: v.id, label: nomeExtrato(v).principal })} />
        ))}
      </ul>
    </div>
  );
  const nadaAPagar = Object.values(aPagar).every(g => g.length === 0);

  return (
    <div className="space-y-4">
      {/* 1 · a faixa do dia */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Numero rotulo="Caixa disponível" valor={brl(caixa.disponivel)} tom="neutro"
          detalhe={caixa.aplicacoes > 0 ? `+ ${brl(caixa.aplicacoes)} em aplicações` : "banco, caixa e envelopes"} />
        <Numero rotulo="A pagar até 7 dias" valor={brl(compromissos7)} tom={compromissos7 > 0 ? "ruim" : "neutro"}
          detalhe={aPagar.atrasadas.length > 0 ? `inclui ${aPagar.atrasadas.length} atrasada${aPagar.atrasadas.length > 1 ? "s" : ""}` : "nada atrasado"} />
        <Numero rotulo={cobertura.cobre ? "Sobra depois de pagar" : "Falta para pagar"} valor={brl(Math.abs(cobertura.saldoDepois))}
          tom={cobertura.cobre ? "bom" : "ruim"} detalhe={cobertura.cobre ? "o caixa cobre a semana" : "o caixa não cobre a semana"} />
        <Numero rotulo="Débitos a conferir" valor={String(derivados.debitosAConferir)} tom={derivados.debitosAConferir > 0 ? "ruim" : "bom"}
          detalhe={dados.debitosIndisponiveis ? "migration pendente" : "automáticos já vencidos"} />
      </div>

      {dados.erros.length > 0 && (
        <p className="text-xs text-warning-text border border-warning-line bg-warning-soft/40 rounded-md px-3 py-2">
          Parte da mesa não carregou ({dados.erros.map(e => e.split(":")[0]).join(", ")}). O resto está correto.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 2 · contas a pagar */}
        <Cartao id="mesa-contas" className="lg:col-span-2" titulo="Contas a pagar"
          subtitulo="Boletos, faturas e pagamentos manuais — o que depende de você"
          direita={<Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onNovaSaida}>+ Nova conta</Button>}>
          {nadaAPagar ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma conta a pagar nos próximos 30 dias. Os débitos automáticos aparecem mais abaixo.
            </p>
          ) : (
            <>
              {grupo("atrasadas", "Atrasadas", aPagar.atrasadas, "text-destructive-text")}
              {grupo("hoje", "Vencem hoje", aPagar.hoje, "text-warning-text")}
              {grupo("amanha", "Amanhã", aPagar.amanha)}
              {grupo("semana", "Próximos 7 dias", aPagar.semana)}
              {aPagar.ate30.length > 0 && (
                <div className="mt-1 border-t pt-2">
                  <button type="button" onClick={() => setMostrar30(m => !m)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground">
                    <span className="flex items-center gap-1">
                      {mostrar30 ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      De 8 a 30 dias · {aPagar.ate30.length}
                    </span>
                    <span className="tabular-nums">{brl(soma(aPagar.ate30))}</span>
                  </button>
                  {mostrar30 && grupo("ate30", "De 8 a 30 dias", aPagar.ate30)}
                </div>
              )}
            </>
          )}
        </Cartao>

        {/* 3 · seu dia */}
        <div className="space-y-4">
          <Cartao titulo="Seu dia"
            subtitulo={pendentesDoDia === 0 ? "Tudo em dia" : `${pendentesDoDia} ${pendentesDoDia === 1 ? "item pede" : "itens pedem"} sua atenção`}>
            <ul className="space-y-0.5">
              {checklist.map(i => <ItemChecklist key={i.chave} item={i}
                acao={acaoDoItem(i.chave, { onImportarExtrato, onAprovacoes })} />)}
            </ul>
          </Cartao>

          {/* 5 · pagamentos de hoje */}
          <Cartao titulo="Pagamentos de hoje" subtitulo={pagosHoje.length === 0 ? "Nada pago hoje ainda" : `${pagosHoje.length} · ${brl(soma(pagosHoje))}`}>
            {pagosHoje.length > 0 && (
              <ul>
                {pagosHoje.slice(0, 8).map(p => <LinhaPaga key={p.id} p={p} onAnexo={() => onAnexo({ id: p.id, label: p.fornecedor || p.descricao })} />)}
              </ul>
            )}
          </Cartao>
        </div>
      </div>

      {/* 4 · débitos automáticos */}
      <Cartao id="mesa-debitos" titulo="Débitos automáticos"
        subtitulo="Contas que o banco debita sozinho — você só confere se aconteceu"
        direita={<Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onImportarExtrato}>Importar extrato</Button>}>
        {dados.debitosIndisponiveis ? (
          <p className="text-sm text-muted-foreground">
            Para separar os débitos automáticos das contas a pagar falta aplicar a migration{" "}
            <code className="text-xs">20261006120000_fin_forma_liquidacao.sql</code>. Até lá, tudo continua em "Contas a pagar".
          </p>
        ) : dados.debitos.length === 0 ? (
          <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
            Nenhuma conta deste mês está marcada como débito automático. Escolha a forma de liquidação ao criar ou editar a recorrência.
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onRecorrencias}><RotateCw className="w-3 h-3" /> Abrir recorrências</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
              <Numero rotulo="Previstos" valor={String(ind.previstos)} />
              <Numero rotulo="Encontrados" valor={String(ind.encontrados)} tom="bom" />
              <Numero rotulo="Não encontrados" valor={String(ind.naoEncontrados)} tom={ind.naoEncontrados > 0 ? "ruim" : "neutro"} />
              <Numero rotulo="Valor previsto" valor={brl(ind.valorPrevisto)} detalhe="do mês" />
              <Numero rotulo="Debitado de fato" valor={brl(ind.valorDebitado)} tom="bom" />
            </div>
            <ul>
              {dados.debitos.map(d => (
                <LinhaDeDebito key={d.id} d={d} hoje={hoje}
                  venc={porId.get(d.id)} onConferir={(v) => onPagar(v)} />
              ))}
            </ul>
          </>
        )}
      </Cartao>

      <div className="grid gap-4 md:grid-cols-3">
        {/* comprovantes pendentes */}
        <Cartao titulo="Comprovantes pendentes" subtitulo={`Pagamentos dos últimos 7 dias sem comprovante`}>
          {semComprovante.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todos os pagamentos recentes têm comprovante.</p>
          ) : (
            <ul>
              {semComprovante.slice(0, 6).map(p => <LinhaPaga key={p.id} p={p} onAnexo={() => onAnexo({ id: p.id, label: p.fornecedor || p.descricao })} mostrarDia />)}
              {semComprovante.length > 6 && <li className="text-xs text-muted-foreground pt-1">+ {semComprovante.length - 6} outros.</li>}
            </ul>
          )}
        </Cartao>

        {/* documentação */}
        <Cartao titulo="Documentos para a contabilidade" subtitulo="Pagamentos que exigem documento — mês atual e o que ainda está em fechamento">
          {dados.documentos ? (
            <div className="space-y-2">
              {dados.documentosAnterior && (
                <ResumoDeDocumentos rotulo={dados.documentosAnterior.rotulo} r={dados.documentosAnterior.resumo} />
              )}
              <ResumoDeDocumentos rotulo="Este mês" r={dados.documentos} />
              <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                <Link to="/financas/documentos"><FileText className="w-3 h-3" /> Abrir Central de Documentos</Link>
              </Button>
            </div>
          ) : <p className="text-sm text-muted-foreground">Não foi possível calcular a cobertura agora.</p>}
        </Cartao>

        {/* recorrências e extrato */}
        <Cartao titulo="Recorrências e extrato" subtitulo="O que se repete e o que o banco já mostrou">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0"><RotateCw className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> {dados.recorrenciasAtivas} recorrência{dados.recorrenciasAtivas === 1 ? "" : "s"} ativa{dados.recorrenciasAtivas === 1 ? "" : "s"}</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onRecorrencias}>Abrir <ArrowRight className="w-3 h-3" /></Button>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <Landmark className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {dados.ultimoMovimentoBanco
                  ? `Último movimento no banco: ${dataCurta(dados.ultimoMovimentoBanco)}`
                  : "Sem movimento no banco"}
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onImportarExtrato}>Importar <ArrowRight className="w-3 h-3" /></Button>
            </li>
            <li className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className="flex items-center gap-1.5 min-w-0"><Wallet className="w-3.5 h-3.5 shrink-0" /> Cartão de crédito em aberto</span>
              <span className="tabular-nums">{brl(Math.abs(caixa.cartao))}</span>
            </li>
          </ul>
        </Cartao>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={carregar} disabled={carregando}>
          <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar a mesa
        </Button>
      </div>
    </div>
  );
}

function ResumoDeDocumentos({ rotulo, r }: { rotulo: string; r: { exigem: number; comDocumento: number; pendencias: number; cobertura: number } }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{rotulo}</p>
      {r.exigem === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pagamento a documentar ainda.</p>
      ) : (
        <>
          <p className="text-xl font-extrabold tabular-nums leading-tight">{r.cobertura.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</p>
          <p className="text-xs text-muted-foreground">
            {r.comDocumento} de {r.exigem} com documento
            {r.pendencias > 0 && <> · <b className="text-warning-text">{r.pendencias} faltando</b></>}
          </p>
        </>
      )}
    </div>
  );
}

function acaoDoItem(chave: string, a: { onImportarExtrato: () => void; onAprovacoes: () => void }): (() => void) | null {
  switch (chave) {
    case "atrasadas": case "hoje": return () => rolarPara("mesa-contas");
    case "debitos": return () => rolarPara("mesa-debitos");
    case "extrato": return a.onImportarExtrato;
    case "aprovacoes": return a.onAprovacoes;
    default: return null;
  }
}

function ItemChecklist({ item, acao }: { item: ItemDoChecklist; acao: (() => void) | null }) {
  const Icone = item.feito ? CheckCircle2 : item.chave === "atrasadas" ? AlertTriangle : item.chave === "hoje" ? Clock : Circle;
  const cor = item.feito ? "text-success-text" : item.chave === "atrasadas" ? "text-destructive-text" : "text-warning-text";
  const miolo = (
    <>
      <Icone className={`w-4 h-4 shrink-0 mt-0.5 ${cor}`} />
      <span className="min-w-0 text-left">
        <span className={`block text-sm ${item.feito ? "text-muted-foreground" : "font-medium"}`}>{item.rotulo}</span>
        <span className="block text-xs text-muted-foreground">{item.detalhe}</span>
      </span>
    </>
  );
  return (
    <li>
      {acao && !item.feito ? (
        <button type="button" onClick={acao} className="w-full flex items-start gap-2 rounded px-1.5 py-1.5 hover:bg-muted/60">{miolo}</button>
      ) : item.chave === "documentos" && !item.feito ? (
        <Link to="/financas/documentos" className="w-full flex items-start gap-2 rounded px-1.5 py-1.5 hover:bg-muted/60">{miolo}</Link>
      ) : (
        <div className="flex items-start gap-2 px-1.5 py-1.5">{miolo}</div>
      )}
    </li>
  );
}

function LinhaPaga({ p, onAnexo, mostrarDia }: { p: PagoRecente; onAnexo: () => void; mostrarDia?: boolean }) {
  return (
    <li className="flex items-center gap-2 py-1.5 border-t first:border-t-0 text-sm min-w-0">
      {mostrarDia && <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{dataCurta(p.dia)}</span>}
      <span className="min-w-0 flex-1 truncate">{p.fornecedor || p.descricao || "(sem descrição)"}</span>
      <span className="tabular-nums text-xs shrink-0">{brl(p.valor)}</span>
      <button type="button" onClick={onAnexo} title={p.temComprovante ? "Comprovante anexado" : "Anexar comprovante"}
        className={`rounded p-1 shrink-0 hover:bg-muted ${p.temComprovante ? "text-success-text" : "text-warning-text"}`}>
        <Paperclip className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

function LinhaDeDebito({ d, hoje, venc, onConferir }: {
  d: DebitoDoMes; hoje: string; venc?: FinVencimento; onConferir: (v: FinVencimento) => void;
}) {
  const s = situacaoDoDebito(d, hoje);
  if (!s) return null;
  const chip = CHIP_DEBITO[s];
  return (
    <li className="flex items-center gap-2 py-2 border-t first:border-t-0 text-sm min-w-0">
      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{dataCurta(d.data)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{d.fornecedor || d.descricao || "(sem descrição)"}</span>
        <span className="block text-xs text-muted-foreground truncate">
          {d.variavel ? "valor variável (estimado)" : "valor fixo"}
          {s === "encontrado" && d.dataPagamento && ` · debitado em ${dataCurta(String(d.dataPagamento).slice(0, 10))}`}
        </span>
      </span>
      <span className="tabular-nums font-medium shrink-0">{brl(d.valor)}</span>
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${chip.classe}`}>{chip.texto}</span>
      {s !== "encontrado" && venc && d.data <= hoje && (
        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => onConferir(venc)}
          title="Já conferi no banco: marcar como debitado">
          Marcar debitado
        </Button>
      )}
    </li>
  );
}
