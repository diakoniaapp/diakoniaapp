// ─── CartaoDaLinha — o cartão de decisão da Mesa de Conciliação (uma linha nova do extrato) ──────────────────
//
// Para cada movimento: o que o banco disse, QUEM o sistema identificou (trocável aqui mesmo), o histórico da pessoa à
// vista, a categoria sugerida com as alternativas a um clique, o centro e o botão Confirmar. O formulário completo só
// abre em "Editar". Aprendido na comparação com o Omie: decidir na própria linha, com o que foi achado ao lado.

import { AlertTriangle, ArrowRightLeft, BanIcon, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { brl, type FinCategoria, type FinProjeto } from "@/services/finService";
import type { LinhaAnalisada } from "@/services/importacaoOfxService";
import { favorecidoEfetivo, podeGravar, rotuloDaConfianca, valoresEfetivos, type Edicao, type FavorecidoEscolhido } from "@/lib/gradeOfx";
import { EscolhaDeFavorecido } from "./EscolhaDeFavorecido";

const CHIP: Record<string, string> = {
  identificada: "border-success-line bg-success-soft text-success-text",
  revisar: "border-warning-line bg-warning-soft text-warning-text",
  nao_identificada: "border-destructive-line bg-destructive-soft text-destructive-text",
};
const SELECT = "h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

/** "Ofertas para Missões" → "Missões"; "Dizimos" → "Dízimo": o nome curto cabe num botão. */
export function nomeCurtoDaCategoria(nome: string): string {
  if (/miss/i.test(nome)) return "Missões";
  if (/^diz/i.test(nome)) return "Dízimo";
  if (/^ofert/i.test(nome)) return "Oferta";
  return nome;
}
const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

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
  onEditar: (patch: Edicao) => void;
  onMarcar: (v: boolean) => void;
  onConfirmar: () => void;
  onFormulario: () => void;
  onTransferencia: () => void;
  onIgnorar: () => void;
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

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox aria-label={`Marcar ${l.tx.memo}`} checked={p.marcada} disabled={!gravavel || ocupado} onCheckedChange={c => p.onMarcar(c === true)} />
        <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{dataCurta(l.tx.data)}</span>
        <span className="min-w-0 flex-1 truncate text-sm" title={l.tx.memo}>{l.tx.memo}</span>
        <span className={`shrink-0 text-sm font-medium tabular-nums ${entrada ? "text-success-text" : "text-destructive-text"}`}>{entrada ? "+" : "−"}{brl(l.tx.valor)}</span>
        <span title={s.motivos.join(" · ")} className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] tabular-nums ${CHIP[s.banda]}`}>
          {s.confianca}% · {rotuloDaConfianca(s.banda)}
        </span>
      </div>

      {s.possivelMissoes && (
        <p className="flex items-center gap-1.5 pl-6 text-xs text-warning-text" role="note">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <b>Possível oferta missionária</b> — PIX terminado em ,10 é a marca da tesouraria. Confirme Missões ou troque.
        </p>
      )}
      {s.generico && (
        <p className="flex items-center gap-1.5 pl-6 text-xs text-warning-text" role="note">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> Texto genérico do banco (serve a vários favorecidos): escolha o favorecido ou ligue ao documento a pagar.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pl-6">
        <EscolhaDeFavorecido atual={atual} sugerido={!!atual && !favorecidoTrocado} disabled={ocupado}
          onChange={(f: FavorecidoEscolhido | null) => p.onEditar({ favorecido: f })} />
        {(s.historico ?? []).map((h, i) => (
          <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" title="Lançamentos anteriores desta pessoa/favorecido">
            {h.categoriaId ? nomeCurtoDaCategoria(p.nomeDaCategoria(h.categoriaId)) : "—"} {brl(h.valor)} · {dataCurta(h.dia)}
          </span>
        ))}
      </div>

      {s.transferencia ? (
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <span className="text-xs text-warning-text">Parece transferência entre contas da igreja — registre como Transferência (as duas pernas).</span>
          <Button type="button" size="sm" className="h-8 gap-1 text-xs" disabled={ocupado} onClick={p.onTransferencia}><ArrowRightLeft className="h-3.5 w-3.5" /> Registrar transferência</Button>
          {p.ignorarDisponivel && <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 text-xs" disabled={ocupado} onClick={p.onIgnorar}><BanIcon className="h-3.5 w-3.5" /> Ignorar</Button>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 pl-6" role="group" aria-label="Categoria">
            {ids.map(id => (
              <button key={id} type="button" disabled={ocupado} aria-pressed={v.categoriaId === id} onClick={() => p.onEditar({ categoriaId: id })}
                className={`h-8 rounded-md border px-2.5 text-xs ${v.categoriaId === id ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-background hover:bg-muted"}`}>
                {nomeCurtoDaCategoria(p.nomeDaCategoria(id))}
              </button>
            ))}
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

          {documento && (
            <p className="pl-6 text-xs text-info-text">
              Pode ser o pagamento de <b>{documento.documento.descricao ?? "documento"}</b> (venc. {dataCurta(documento.documento.data)}, {brl(documento.documento.valor)}) — use "Editar" para liquidar o documento.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pl-6">
            <Button type="button" size="sm" className="h-8 gap-1 text-xs" disabled={ocupado || !gravavel} onClick={p.onConfirmar}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={ocupado} onClick={p.onFormulario}><Pencil className="h-3 w-3" /> Editar</Button>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={ocupado} onClick={p.onTransferencia}><ArrowRightLeft className="h-3 w-3" /> Transferência</Button>
            {p.ignorarDisponivel && <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 text-xs" disabled={ocupado} onClick={p.onIgnorar}><BanIcon className="h-3 w-3" /> Ignorar</Button>}
            {s.motivos.length > 0 && s.banda !== "identificada" && (
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={s.motivos.join(" · ")}>{s.motivos[s.motivos.length - 1]}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
