// ─── CartaoDaLinha — o painel de decisão de uma linha NOVA do extrato (Central de decisões) ──────────────────
//
// Na ordem H0 → H4: se existe CONTA em aberto (H1) ou RECORRÊNCIA compatível (H2), a pergunta é "é esta?" e a ação principal é liquidar/gerar e liquidar. A classificação de despesa
// NOVA (favorecido, categoria, centro, projeto) só aparece em H4 — ou depois de "Não é esta…", com o motivo. Layout pedido por ela (20/10/2026): cabeçalho do movimento, uma caixa
// com a resposta e as ações uma por linha (a principal destacada, "Buscar e associar" sempre presente). Aprendido no Omie: decidir com o que foi achado ao lado.

import { ArrowRightLeft, BanIcon, CheckCircle2, Pencil, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { brl, type FinCategoria, type FinProjeto } from "@/services/finService";
import type { LinhaAnalisada } from "@/services/importacaoOfxService";
import { MOTIVOS_DE_DESPESA_NOVA, favorecidoEfetivo, podeGravar, valoresEfetivos, type Edicao, type FavorecidoEscolhido } from "@/lib/gradeOfx";
import { alvoDaTransferencia, ehDepositoEmDinheiro, type OutraPonta } from "@/lib/transferenciaOfx";
import { montarHipotese, nomeCurtoDaCategoria } from "@/lib/hipoteseOfx";
import { resolverMovimento } from "@/lib/resolverMovimento";
import { EscolhaDeFavorecido } from "./EscolhaDeFavorecido";
import { HipoteseDaLinha } from "./HipoteseDaLinha";
import { AcaoDoPainel, CabecalhoDoPainel, CaixaDeResposta, ListaDeAcoes } from "./PainelDeDecisao";

export { nomeCurtoDaCategoria };

const SELECT = "h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
export const ROTULO_BUSCAR = "Buscar e associar a um lançamento ou conta";

interface Props {
  linha: LinhaAnalisada;
  edicao?: Edicao;
  marcada: boolean;
  ocupado: boolean;
  categorias: FinCategoria[];
  opcoesDeCentro: { id: string; rotulo: string }[];
  projetos: FinProjeto[];
  nomeDaCategoria: (id?: string | null) => string;
  ignorarDisponivel: boolean;
  /** as OUTRAS contas da igreja: origem (entrada) ou destino (saída) de uma transferência */
  outrasContas: { id: string; nome: string }[];
  /** a conta que está sendo conciliada (destino das entradas, origem das saídas) */
  contaNome: string;
  onEditar: (patch: Edicao) => void;
  onMarcar: (v: boolean) => void;
  onConfirmar: () => void;
  onFormulario: () => void;
  onTransferencia: () => void;
  onConfirmarTransferencia: (alvo: OutraPonta) => void;
  /** abre a liquidação do documento a pagar que este pagamento provavelmente quitou */
  onLiquidar: () => void;
  onIgnorar: () => void;
  /** busca e associação manual: ligar a linha a uma conta em aberto ou a um lançamento que já existe */
  onBuscar: () => void;
  /** H2: gera a ocorrência que falta do contrato e abre a liquidação dela */
  onGerarRecorrencia?: () => void;
}

export function CartaoDaLinha(p: Props) {
  const { linha: l, edicao, ocupado } = p;
  const s = l.sugestao!;
  const g = { fitid: l.tx.fitid, situacao: l.situacao, sugestao: s };
  const v = valoresEfetivos(g, edicao);
  const fav = favorecidoEfetivo(g, edicao);
  const atual = fav.pessoa ? { tipo: "pessoa" as const, ...fav.pessoa } : fav.fornecedor ? { tipo: "fornecedor" as const, ...fav.fornecedor } : null;
  const favorecidoTrocado = edicao?.favorecido !== undefined;
  const gravavel = podeGravar(g, edicao);
  const entrada = l.tx.tipo === "entrada";
  // as opções de categoria a um clique: a efetiva, depois as alternativas
  const ids = [v.categoriaId, ...(s.alternativas ?? [])].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).slice(0, 4);
  const documento = l.documentos?.[0];
  // a pergunta "o que este movimento é?" tem UMA resposta (lib/resolverMovimento): aqui só se lê
  const resolucao = resolverMovimento(l);
  const recorrencia = resolucao.h === "H2" ? resolucao.recorrencia : null;
  // obrigação prevista de VALOR IGUAL: o caminho certo é liquidá-la (baixa a obrigação); "Confirmar" criaria um lançamento NOVO e a deixaria aberta
  const obrigacaoExata = !!documento?.exato;
  // 1º a transferência interna, 2º a receita (pedido dela, 08/10/2026)
  const provavel = l.transferenciaProvavel;
  const { modo: modoTransf, alvo, sugerida } = alvoDaTransferencia(!!s.transferencia, provavel, edicao);
  const deposito = ehDepositoEmDinheiro(l.tx.memo);
  const hipotese = montarHipotese({
    tx: l.tx, sugestao: s, contaNome: p.contaNome, provavel, alvo, modoTransferencia: modoTransf, sugeridaComoTransferencia: sugerida,
    favorecido: fav.pessoa ? { nome: fav.pessoa.nome, papel: "pessoa" } : fav.fornecedor ? { nome: fav.fornecedor.nome, papel: "fornecedor" } : null,
    categoriaId: v.categoriaId, nomeDaCategoria: p.nomeDaCategoria,
  });

  // H1/H2: existe candidata → a pergunta é "é esta?". A classificação de despesa NOVA só aparece depois de "Não é esta…" e com o motivo — criar despesa nova é o último
  // caminho, não o padrão (decisão dela, 20/10/2026).
  const candidata = (!!documento || !!recorrencia) && !modoTransf;
  const mostrarNova = !candidata || !!edicao?.revelarNova;
  const motivoNovo = (edicao?.motivoNovo ?? "").trim();
  const motivoPronto = !candidata || motivoNovo.length > 0;
  const outroMotivo = !!motivoNovo && !(MOTIVOS_DE_DESPESA_NOVA as readonly string[]).includes(motivoNovo);

  const buscar = <AcaoDoPainel variante="fixa" icone={<Search className="h-4 w-4" />} atalho="/" disabled={ocupado} onClick={p.onBuscar}>{ROTULO_BUSCAR}</AcaoDoPainel>;
  const ignorar = p.ignorarDisponivel ? <AcaoDoPainel variante="normal" icone={<BanIcon className="h-4 w-4" />} disabled={ocupado} onClick={p.onIgnorar}>Ignorar este movimento</AcaoDoPainel> : null;

  return (
    <div className="space-y-2.5">
      <CabecalhoDoPainel linha={l} contaNome={p.contaNome} />

      {candidata && documento && !mostrarNova && (
        <>
          <CaixaDeResposta tom="h1" titulo={obrigacaoExata ? "✅ Já existe uma conta compatível" : "Pode ser o pagamento desta conta"} porque={documento.motivo}>
            <b>{documento.documento.fornecedor_nome ?? documento.documento.descricao ?? "conta a pagar"}</b> · vence {dataCurta(documento.documento.data)} · <b className="tabular-nums">{brl(documento.documento.valor)}</b>
            {obrigacaoExata ? " (valor igual)" : ` (o extrato difere em ${brl(Math.abs(documento.diferenca))})`}
          </CaixaDeResposta>
          <ListaDeAcoes>
            <AcaoDoPainel variante="principal" icone={<CheckCircle2 className="h-4 w-4" />} atalho="Enter" disabled={ocupado} onClick={p.onLiquidar}>
              {obrigacaoExata ? "Liquidar esta conta" : "Liquidar esta conta (explicar a diferença)"}
            </AcaoDoPainel>
            {buscar}
            <AcaoDoPainel dica="pede o motivo" disabled={ocupado} onClick={() => p.onEditar({ revelarNova: true })}>Não é esta conta — registrar {entrada ? "nova receita" : "nova despesa"}</AcaoDoPainel>
            {ignorar}
          </ListaDeAcoes>
        </>
      )}

      {candidata && !documento && recorrencia && !mostrarNova && (
        <>
          <CaixaDeResposta tom="h2" titulo="↻ Existe uma recorrência compatível" porque={recorrencia.motivo}>
            <b>{recorrencia.rotulo}</b> · vence {dataCurta(recorrencia.vencimento)} · <b className="tabular-nums">{brl(recorrencia.valor)}</b>
            {Math.abs(recorrencia.diferenca) < 0.005 ? " (valor igual)" : ` (o extrato difere em ${brl(Math.abs(recorrencia.diferenca))})`}
          </CaixaDeResposta>
          <ListaDeAcoes>
            <AcaoDoPainel variante="principal" icone={<CheckCircle2 className="h-4 w-4" />} atalho="Enter" disabled={ocupado || !p.onGerarRecorrencia} onClick={p.onGerarRecorrencia}>Gerar e liquidar a recorrência</AcaoDoPainel>
            {buscar}
            <AcaoDoPainel dica="pede o motivo" disabled={ocupado} onClick={() => p.onEditar({ revelarNova: true })}>Não é esta recorrência — registrar {entrada ? "nova receita" : "nova despesa"}</AcaoDoPainel>
            {ignorar}
          </ListaDeAcoes>
        </>
      )}

      {(mostrarNova || modoTransf) && (
        <>
          {candidata && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-warning-text">
                {documento
                  ? <>Existe uma conta que parece ser esta ({documento.documento.fornecedor_nome ?? documento.documento.descricao ?? "conta"}, {brl(documento.documento.valor)}).</>
                  : <>Existe uma recorrência que parece ser esta ({recorrencia!.rotulo}, {brl(recorrencia!.valor)}).</>}
              </span>
              <button type="button" className="underline underline-offset-2" disabled={ocupado} onClick={() => p.onEditar({ revelarNova: false, motivoNovo: undefined })}>← voltar para {documento ? "a conta" : "a recorrência"}</button>
            </div>
          )}
          {!candidata && !modoTransf && (
            <CaixaDeResposta tom="h4" titulo="◻ Nenhuma conta, recorrência ou registro compatível">
              Nenhuma conta em aberto nem recorrência compatível foi encontrada — é {entrada ? "uma receita nova" : "uma despesa nova"}.
            </CaixaDeResposta>
          )}
          <HipoteseDaLinha h={hipotese} />

          <div className="flex flex-wrap items-center gap-2">
            <EscolhaDeFavorecido atual={atual} sugerido={!!atual && !favorecidoTrocado} disabled={ocupado}
              onChange={(f: FavorecidoEscolhido | null) => p.onEditar({ favorecido: f })} />
          </div>
        </>
      )}

      {modoTransf ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={entrada ? "Conta de origem" : "Conta de destino"}>
            <span className="text-xs text-muted-foreground">{entrada ? "Origem:" : "Destino:"}</span>
            {p.outrasContas.map(c => (
              <button key={c.id} type="button" disabled={ocupado} aria-pressed={alvo?.contaId === c.id}
                onClick={() => p.onEditar({ transferirPara: { contaId: c.id, contaNome: c.nome, lancamentoId: provavel && provavel.contaId === c.id ? provavel.lancamentoId : undefined }, abrirTransferencia: true, naoETransferencia: false })}
                className={`h-8 rounded-md border px-2.5 text-xs ${alvo?.contaId === c.id ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-background hover:bg-muted"}`}>
                {c.nome}
              </button>
            ))}
          </div>
          <ListaDeAcoes>
            <AcaoDoPainel variante="principal" icone={<CheckCircle2 className="h-4 w-4" />} disabled={ocupado || !alvo} onClick={() => alvo && p.onConfirmarTransferencia(alvo)}>Confirmar transferência</AcaoDoPainel>
            {buscar}
            <AcaoDoPainel disabled={ocupado} onClick={() => p.onEditar({ naoETransferencia: true, abrirTransferencia: false, transferirPara: undefined })}>Não é transferência</AcaoDoPainel>
            <AcaoDoPainel icone={<Pencil className="h-4 w-4" />} disabled={ocupado} onClick={p.onTransferencia}>Formulário de transferência</AcaoDoPainel>
            {ignorar}
          </ListaDeAcoes>
        </div>
      ) : mostrarNova && (
        <>
          {provavel && (
            <p className="text-xs text-info-text" role="note">
              O mesmo valor ({brl(l.tx.valor)}) {entrada ? "saiu de" : "entrou em"} {provavel.contaNome} em {dataCurta(provavel.data)} —{" "}
              <button type="button" className="underline underline-offset-2" disabled={ocupado}
                onClick={() => p.onEditar({ transferirPara: { contaId: provavel.contaId, contaNome: provavel.contaNome, lancamentoId: provavel.lancamentoId }, abrirTransferencia: true, naoETransferencia: false })}>é transferência?</button>
            </p>
          )}

          {candidata && (
            <div className="space-y-1.5" role="group" aria-label={entrada ? "Por que é uma receita nova" : "Por que é uma despesa nova"}>
              <p className="text-xs font-medium">Por que não é {documento ? "essa conta" : "essa recorrência"}? <span className="text-destructive-text">(obrigatório)</span></p>
              <div className="flex flex-wrap items-center gap-1.5">
                {MOTIVOS_DE_DESPESA_NOVA.map(m => (
                  <button key={m} type="button" disabled={ocupado} aria-pressed={motivoNovo === m} onClick={() => p.onEditar({ motivoNovo: m })}
                    className={`h-8 rounded-md border px-2.5 text-xs ${motivoNovo === m ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-background hover:bg-muted"}`}>{m}</button>
                ))}
                <input type="text" aria-label="Outro motivo" placeholder="Outro motivo…" maxLength={140} disabled={ocupado}
                  value={outroMotivo ? motivoNovo : ""} onChange={e => p.onEditar({ motivoNovo: e.target.value })}
                  className="h-8 w-52 min-w-0 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Categoria">
            {ids.map(id => (
              <button key={id} type="button" disabled={ocupado} aria-pressed={v.categoriaId === id} onClick={() => p.onEditar({ categoriaId: id })}
                className={`h-8 rounded-md border px-2.5 text-xs ${v.categoriaId === id ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-background hover:bg-muted"}`}>
                {nomeCurtoDaCategoria(p.nomeDaCategoria(id))}
              </button>
            ))}
            <button type="button" disabled={ocupado} onClick={() => p.onEditar({ abrirTransferencia: true, naoETransferencia: false })}
              className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted ${deposito ? "border-info-line bg-info-soft text-info-text" : "border-input bg-background"}`}>
              <ArrowRightLeft className="h-3 w-3" /> Transferência entre contas
            </button>
            <select className={`${SELECT} w-36`} aria-label="Outra categoria" disabled={ocupado} value="" onChange={e => { if (e.target.value) p.onEditar({ categoriaId: e.target.value }); }}>
              <option value="">{ids.length ? "Outra…" : "Categoria…"}</option>
              {p.categorias.filter(c => !ids.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select className={`${SELECT} w-44`} aria-label="Centro de custo" disabled={ocupado} value={v.centroId ?? ""} onChange={e => p.onEditar({ centroId: e.target.value })}>
              <option value="">Centro de custo…</option>
              {p.opcoesDeCentro.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
            </select>
            {p.projetos.length > 0 && (
              <select className={`${SELECT} w-40`} aria-label="Projeto (opcional)" disabled={ocupado} value={edicao?.projetoId ?? ""} onChange={e => p.onEditar({ projetoId: e.target.value })}>
                <option value="">Sem projeto</option>
                {p.projetos.map(pr => <option key={pr.id} value={pr.id}>{pr.nome}</option>)}
              </select>
            )}
          </div>

          <ListaDeAcoes>
            <AcaoDoPainel variante={candidata ? "normal" : "azul"} icone={<CheckCircle2 className="h-4 w-4" />} disabled={ocupado || !gravavel || !motivoPronto} onClick={p.onConfirmar}
              title={!motivoPronto ? "Diga por que não é a conta em aberto" : undefined}>
              Registrar como {entrada ? "nova receita" : "nova despesa"}
            </AcaoDoPainel>
            {buscar}
            <AcaoDoPainel icone={<Pencil className="h-4 w-4" />} disabled={ocupado} onClick={p.onFormulario}>Editar no formulário completo</AcaoDoPainel>
            {ignorar}
          </ListaDeAcoes>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox aria-label={`Marcar ${l.tx.memo}`} checked={p.marcada} disabled={!gravavel || candidata || ocupado} onCheckedChange={c => p.onMarcar(c === true)} />
            Incluir em “Lançar marcadas” (lote)
          </label>
          {s.motivos.length > 0 && s.banda !== "identificada" && (
            <p className="truncate text-[11px] text-muted-foreground" title={s.motivos.join(" · ")}>{s.motivos[s.motivos.length - 1]}</p>
          )}
        </>
      )}
    </div>
  );
}
