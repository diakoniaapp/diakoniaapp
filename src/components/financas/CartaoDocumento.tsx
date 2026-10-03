// ─── CartaoDocumento.tsx — um arquivo da fila da Central de Documentos ─────
//
// O que a Telma pediu em cada item (03/10/2026): o DOCUMENTO, o MELHOR CANDIDATO, a
// CONFIANÇA, o MOTIVO do casamento e os botões CONFIRMAR e ESCOLHER OUTRO LANÇAMENTO.
// O foco é a conferência visual rápida: o que o sistema leu do documento fica ao
// lado do lançamento que ele sugere, com o motivo por extenso.
//
// Grupos (ícone + texto, nunca só cor): ✅ Vinculação automática · ⚠ Revisão
// necessária · ❌ Não identificado · ↺ Já anexado.

import {
  AlertTriangle, CheckCircle2, ExternalLink, FileText, Loader2, RotateCcw, Undo2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { destinosEfetivos, grupoDe, type GrupoUI, type ItemCentral } from "@/lib/documentos/fluxo";
import type { LancamentoPool } from "@/lib/documentos/casamento";
import { dataBr } from "@/lib/pacoteContabil";
import {
  FIN_ANEXO_TIPO_DICA, FIN_ANEXO_TIPO_LABEL, FIN_ANEXO_TIPOS_OFERECIDOS, brl, type FinAnexoTipo,
} from "@/services/finService";

const GRUPO: Record<GrupoUI, { rotulo: string; Icone: typeof CheckCircle2; cor: string }> = {
  automatico: { rotulo: "Vinculação automática", Icone: CheckCircle2, cor: "text-success-text" },
  revisao: { rotulo: "Revisão necessária", Icone: AlertTriangle, cor: "text-warning-text" },
  nao_identificado: { rotulo: "Não identificado", Icone: XCircle, cor: "text-destructive-text" },
  ja_anexado: { rotulo: "Já anexado", Icone: RotateCcw, cor: "text-muted-foreground" },
};

const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const kb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

interface Props {
  item: ItemCentral;
  onConfirmar: () => void;
  onVoltarAPendente: () => void;
  onIgnorar: () => void;
  onEscolherOutro: () => void;
  onUsarPalpite: () => void;
  onTipo: (t: FinAnexoTipo) => void;
  onAlternarParcela: (lancamentoId: string) => void;
  onAbrir: () => void;
}

export function CartaoDocumento({
  item, onConfirmar, onVoltarAPendente, onIgnorar, onEscolherOutro, onUsarPalpite, onTipo, onAlternarParcela, onAbrir,
}: Props) {
  const grupo = grupoDe(item);
  const r = item.resultado;
  const lido = item.leitura;
  const destinos = destinosEfetivos(item);
  const topo = r?.candidatos[0];
  const confirmado = item.acao === "confirmado";
  const ignorado = item.acao === "ignorado";

  // ainda lendo / erro de leitura: cartão enxuto
  if (item.etapa === "na_fila" || item.etapa === "lendo") {
    return (
      <li className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span className="truncate min-w-0 flex-1">{item.caminho}</span>
        <span className="text-xs shrink-0">{item.etapa === "lendo" ? "lendo…" : "na fila"}</span>
      </li>
    );
  }

  const G = grupo ? GRUPO[grupo] : null;
  const confiancaCor = !r ? "" : r.confianca >= 85 ? "bg-success-soft text-success-text" : r.confianca >= 60 ? "bg-warning-soft text-warning-text" : "bg-destructive-soft text-destructive-text";

  return (
    <li className={`px-4 py-3 ${item.gravado ? "bg-success-soft/40" : ignorado ? "opacity-60" : ""}`}>
      {/* linha 1: arquivo · grupo · tipo */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <button type="button" onClick={onAbrir} className="min-w-0 flex-1 basis-56 text-left hover:underline" title="Abrir o arquivo">
          <span className="block truncate text-sm font-medium">{item.nome}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.caminho !== item.nome ? `${item.caminho} · ` : ""}{kb(item.bytes)}
            {item.fonte === "ocr" ? " · lido por OCR" : item.fonte === "nao_lido" ? " · sem leitura automática" : ""}
            {item.origem === "orfao" ? " · já estava no armazenamento" : ""}
          </span>
        </button>
        <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 hidden sm:block" aria-hidden />
        {G && (
          // depois de gravado o selo vira "Vinculado" em verde: herdar a cor do grupo
          // deixava um "Vinculado" vermelho (medido no teste de gravação ao vivo)
          <span className={`flex items-center gap-1 text-xs font-medium ${item.gravado ? "text-success-text" : G.cor}`}>
            {item.gravado ? <CheckCircle2 className="w-3.5 h-3.5" /> : <G.Icone className="w-3.5 h-3.5" />}
            {item.gravado ? "Vinculado" : G.rotulo}
          </span>
        )}
        <div className="w-44" title={FIN_ANEXO_TIPO_DICA[item.tipo]}>
          <Select value={item.tipo} onValueChange={v => onTipo(v as FinAnexoTipo)} disabled={item.gravado}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIN_ANEXO_TIPOS_OFERECIDOS.map(t => (
                <SelectItem key={t} value={t}>
                  {FIN_ANEXO_TIPO_LABEL[t]}{FIN_ANEXO_TIPO_DICA[t] ? ` — ${FIN_ANEXO_TIPO_DICA[t]}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {item.etapa === "erro" && <p className="mt-2 text-xs text-destructive-text">Não foi possível ler: {item.erro}</p>}

      {r && item.etapa === "lido" && (
        <div className="mt-2.5 grid gap-x-6 gap-y-2 md:grid-cols-2">
          {/* o documento */}
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">O documento</p>
            <p className="text-sm break-words">
              {lido?.emitente ?? item.nomeLido?.fornecedor ?? <span className="text-muted-foreground">emitente não identificado</span>}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums break-words">
              {[
                lido?.cnpj ? `CNPJ ${cnpjFmt(lido.cnpj)}` : null,
                lido?.numero ? `nº ${lido.numero}` : item.nomeLido?.nf ? `NF ${item.nomeLido.nf}` : null,
                lido?.emissao ? `emitido em ${dataBr(lido.emissao)}` : lido?.vencimento ? `vence em ${dataBr(lido.vencimento)}` : null,
                lido?.valores[0] ? `${brl(lido.valores[0].valor)}${lido.valores[0].bruto ? "" : " (líquido)"}` : null,
              ].filter(Boolean).join(" · ") || "nada legível no conteúdo"}
            </p>
          </div>

          {/* o melhor candidato */}
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              {item.escolhido ? "Lançamento escolhido" : r.parcelamento ? "Compra parcelada" : "Melhor candidato"}
              {!item.escolhido && r.banda !== "duplicata" && (
                <span className={`px-1.5 py-0.5 rounded normal-case tracking-normal tabular-nums font-medium ${confiancaCor}`}>{r.confianca}%</span>
              )}
            </p>

            {r.banda === "duplicata" ? (
              <p className="text-sm">Este arquivo já está anexado{r.jaAnexadoEm === "este lote" ? " (repetido neste lote)" : " a um lançamento"} — não será ligado de novo.</p>
            ) : r.parcelamento && !item.escolhido ? (
              <div className="space-y-1">
                <p className="text-sm">{r.resumo}</p>
                <ul className="text-xs space-y-0.5">
                  {r.parcelamento.lancamentos.map(l => (
                    <li key={l.id} className="flex items-center gap-2">
                      <Checkbox checked={!item.parcelasExcluidas.includes(l.id)} onCheckedChange={() => onAlternarParcela(l.id)}
                        disabled={item.gravado} aria-label={`Parcela de ${dataBr(l.dia)}`} />
                      <span className="tabular-nums">{dataBr(l.dia)}</span>
                      <span className="tabular-nums">{brl(l.valor)}</span>
                      <span className="text-muted-foreground truncate">{l.contaNome}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (item.escolhido ?? topo?.lancamento) ? (
              <Lancamento l={(item.escolhido ?? topo!.lancamento)} />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum candidato.</p>
            )}

            {/* motivo */}
            {!item.escolhido && !r.parcelamento && topo && r.banda !== "duplicata" && (
              <ul className="mt-1 text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                {topo.motivos.map(m => <li key={m}>{m}</li>)}
                {topo.alerta && <li className="text-warning-text font-medium">{topo.alerta}</li>}
              </ul>
            )}
            {item.escolhido && <p className="mt-1 text-xs text-muted-foreground">Escolhido por você.</p>}
          </div>
        </div>
      )}

      {/* ações */}
      {item.etapa === "lido" && r && !item.gravado && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirmado ? (
            <>
              <span className="flex items-center gap-1 text-xs font-medium text-success-text">
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirmado — {destinos.length} vínculo(s)
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onVoltarAPendente}>
                <Undo2 className="w-3 h-3" /> Desmarcar
              </Button>
            </>
          ) : ignorado ? (
            <>
              <span className="text-xs text-muted-foreground">Deixado de fora</span>
              {r.banda !== "duplicata" && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onVoltarAPendente}>Reconsiderar</Button>
              )}
            </>
          ) : (
            <>
              {destinos.length > 0 ? (
                <Button size="sm" variant="gold" className="h-7 text-xs" onClick={onConfirmar}>Confirmar</Button>
              ) : topo ? (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onUsarPalpite}>Usar este palpite</Button>
              ) : null}
              {r.banda !== "duplicata" && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onEscolherOutro}>Escolher outro lançamento</Button>
              )}
              {r.banda !== "duplicata" && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onIgnorar}>Deixar de fora</Button>
              )}
            </>
          )}
          {confirmado && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEscolherOutro}>Escolher outro lançamento</Button>
          )}
        </div>
      )}
    </li>
  );
}

function Lancamento({ l }: { l: LancamentoPool }) {
  return (
    <div className="text-sm">
      <p className="break-words">{l.fornecedorNome || "(sem fornecedor)"}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {dataBr(l.dia)} · {l.contaNome} · <strong className="text-foreground">{brl(l.valor)}</strong>
        {l.temAnexo ? " · já tem documento" : ""}{l.status === "previsto" ? " · previsto" : ""}
      </p>
    </div>
  );
}
