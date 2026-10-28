// ─── SemContribuicao — o bloco "Sem contribuição registrada no período" (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: "apresentar também nomes dos membros que não contribuíram em nenhuma vez no período filtrado". Os INDICADORES são agregados; a LISTA com nomes é nominal e só aparece depois que o
// acesso é registrado. A linguagem é de cuidado pastoral, não de cobrança: nada de "inadimplente", nada de vermelho. E a tela diz o que o número NÃO sabe — quem contribui pelo cônjuge ou pela família,
// em espécie ou sem identificação (7–10% dos dízimos de 2026 não têm pessoa ligada) aparece aqui sem ter deixado de contribuir.
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, FileSpreadsheet, FileText, Info, Loader2 } from "lucide-react";
import { NomePessoa } from "@/components/membros/ficha";
import { FAIXAS_SEM_CONTRIBUICAO, textoDoAlerta, type AnaliseDosSemContribuicao, type Confiabilidade, type FaixaSemContribuicao, type PessoaSemContribuicao } from "@/lib/contribuicoes";
import { IndicadorDeConfiabilidade } from "./IndicadorDeConfiabilidade";
import { textoDoRegistro, type EstadoDoRegistro } from "./useRegistroDeAcesso";

export type FiltroDeClasse = "todos" | "nunca" | "antes";
export interface FiltrosDosSem { considerar: "qualquer" | "dizimo"; incluirMenores: boolean; tipo: "todos" | "membro" | "congregado" | "visitante"; classe: FiltroDeClasse; faixa: FaixaSemContribuicao | ""; semFamilia: boolean }

const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** Aplica os filtros da lista (tipo, situação, faixa de dias, esconder quem tem família contribuindo). Pura. A lista já vem em ordem alfabética. */
export function filtrarSemContribuicao(lista: PessoaSemContribuicao[], f: Pick<FiltrosDosSem, "tipo" | "classe" | "faixa" | "semFamilia">): PessoaSemContribuicao[] {
  return lista.filter(p =>
    (f.tipo === "todos" || p.tipo === f.tipo)
    && (f.classe === "todos" || p.classificacao === f.classe)
    && (!f.faixa || p.faixa === f.faixa)
    && (!f.semFamilia || !p.familiaContribui));
}

function Peca({ rotulo, valor, legenda, id }: { rotulo: string; valor: string; legenda: string; id: string }) {
  return (
    <Card className="shadow-card-soft" data-indicador={id}><CardContent className="p-3.5 space-y-0.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className="font-serif text-2xl font-semibold tabular-nums leading-tight" data-valor>{valor}</p>
      <p className="text-xs text-muted-foreground leading-snug">{legenda}</p>
    </CardContent></Card>
  );
}

interface Props {
  analise: AnaliseDosSemContribuicao;
  filtros: FiltrosDosSem; aoMudarFiltros: (parcial: Partial<FiltrosDosSem>) => void;
  registro: { estado: EstadoDoRegistro; erro: string; liberado: boolean; tentarDeNovo: () => void };
  aoExportar: (formato: "xlsx" | "csv", visiveis: PessoaSemContribuicao[]) => void;
  exportando: boolean;
  coberturaDoPeriodo: number | null;
  /** o quadro de confiabilidade da lista (pendentes, impacto, data dos dados); sem ele a tela não o mostra */
  confiabilidade?: Confiabilidade | null;
  /** "Sem dízimo registrado", "Sem contribuição registrada"… conforme as categorias escolhidas */
  oque?: string;
  /** a trava: com muitas pendências, a lista com nomes só aparece depois de a tesouraria dizer que quer ver mesmo assim */
  reconhecido?: boolean;
  aoReconhecer?: () => void;
  aoVerPendencias?: () => void;
}

export function SemContribuicao({ analise: a, filtros, aoMudarFiltros, registro, aoExportar, exportando, coberturaDoPeriodo, confiabilidade, oque = "contribuições", reconhecido = true, aoReconhecer, aoVerPendencias }: Props) {
  const visiveis = useMemo(() => filtrarSemContribuicao(a.lista, filtros), [a.lista, filtros]);
  const oQue = oque === "contribuições" ? "contribuição" : oque.replace(/ (registrad[oa]s?)$/, "");   // o que conta como contribuir é o filtro global de categorias (barra no alto da tela)
  const semX = oque === "contribuições" ? "Sem contribuição registrada" : `Sem ${oque}`;
  const travada = !!confiabilidade?.alertar && !reconhecido;   // muita pendência: avisa ANTES da lista com nomes

  return (
    <div className="space-y-4" data-bloco="sem-contribuicao">
      <div>
        <h2 className="font-serif text-lg" data-titulo-sem>{oque === "contribuições" ? "Sem contribuição registrada no período analisado" : `Sem ${oque} no período analisado`}</h2>
      </div>
      {confiabilidade && <IndicadorDeConfiabilidade c={confiabilidade} aoVerPendencias={aoVerPendencias} />}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        <Peca id="base" rotulo="Membros e congregados ativos" valor={String(a.base)} legenda={a.menoresFora > 0 ? `${a.menoresFora} menores de 18 anos fora da base` : "base considerada"} />
        <Peca id="contribuiram" rotulo={`Com ${oQue} no período`} valor={String(a.contribuiram)} legenda={a.adesaoPct === null ? "—" : `${a.adesaoPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da base`} />
        <Peca id="nao" rotulo={semX} valor={String(a.naoContribuiram)} legenda="no período filtrado" />
        <Peca id="nunca" rotulo="Sem registro anterior" valor={String(a.nuncaDesdeOPiso)} legenda="sem contribuição no período nem antes dele" />
        <Peca id="antes" rotulo="Contribuíram antes do período" valor={String(a.jaContribuiuAntes)} legenda="e não neste período" />
        <Peca id="familia" rotulo="Com família que contribuiu" valor={String(a.comFamiliaQueContribui)} legenda="podem contribuir por outra pessoa" />
      </div>

      <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed" data-aviso="cuidado">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          Esta lista é para <strong>cuidado pastoral</strong>, não para cobrança. Quem contribui por outra pessoa da família, em espécie ou sem identificação
          {coberturaDoPeriodo !== null ? ` (${(100 - coberturaDoPeriodo).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% do valor do período está sem pessoa ligada)` : ""} aparece aqui sem ter deixado de contribuir.
        </p>
      </div>

      <Card><CardContent className="py-3 px-3 space-y-3" data-filtros-sem>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1"><Label className="text-xs">Vínculo</Label>
            <Select value={filtros.tipo} onValueChange={v => aoMudarFiltros({ tipo: v as FiltrosDosSem["tipo"] })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Toda a base escolhida</SelectItem><SelectItem value="membro">Só membros</SelectItem><SelectItem value="congregado">Só congregados</SelectItem><SelectItem value="visitante">Só visitantes</SelectItem></SelectContent>
            </Select></div>
          <div className="space-y-1"><Label className="text-xs">Situação</Label>
            <Select value={filtros.classe} onValueChange={v => aoMudarFiltros({ classe: v as FiltroDeClasse })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todas</SelectItem><SelectItem value="nunca">Sem registro anterior</SelectItem><SelectItem value="antes">Contribuiu antes do período</SelectItem></SelectContent>
            </Select></div>
          <div className="space-y-1"><Label className="text-xs">Tempo sem contribuir</Label>
            <Select value={filtros.faixa || "__todas__"} onValueChange={v => aoMudarFiltros({ faixa: v === "__todas__" ? "" : (v as FaixaSemContribuicao) })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__todas__">Qualquer</SelectItem>{FAIXAS_SEM_CONTRIBUICAO.map(f => (<SelectItem key={f.id} value={f.id}>{f.rotulo} ({a.faixas[f.id]})</SelectItem>))}</SelectContent>
            </Select></div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer"><Switch checked={filtros.incluirMenores} onCheckedChange={v => aoMudarFiltros({ incluirMenores: v })} data-opcao="menores" /> Incluir menores de 18 anos</label>
          <label className="flex items-center gap-2 text-xs cursor-pointer"><Switch checked={filtros.semFamilia} onCheckedChange={v => aoMudarFiltros({ semFamilia: v })} data-opcao="sem-familia" /> Esconder quem tem família contribuindo</label>
        </div>
      </CardContent></Card>

      {travada ? (
        <Card className="border-warning/40 bg-warning/5" data-trava="pendencias"><CardContent className="py-5 px-4 space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning-text"><AlertTriangle className="w-4 h-4" aria-hidden />Antes de ver a lista com nomes</p>
          <p className="text-sm">{textoDoAlerta(confiabilidade!)}</p>
          <p className="text-xs text-muted-foreground">Recomendamos concluir a análise das pendências antes de usar esta lista para decisões pastorais: alguém pode aparecer aqui só porque a contribuição ainda não foi vinculada à pessoa.</p>
          <div className="flex flex-wrap gap-2">
            {aoVerPendencias && <Button size="sm" onClick={aoVerPendencias} data-acao="resolver-pendencias">Resolver as pendências primeiro</Button>}
            <Button size="sm" variant="outline" onClick={aoReconhecer} data-acao="ver-lista-mesmo-assim">Ver a lista mesmo assim</Button>
          </div>
        </CardContent></Card>
      ) : registro.estado === "erro" ? (
        <Card className="border-dashed" data-registro="erro"><CardContent className="py-6 text-center space-y-2">
          <p className="text-sm">Não foi possível registrar este acesso, então a lista com nomes não é mostrada.</p>
          <p className="text-xs text-muted-foreground">{registro.erro}</p>
          <Button size="sm" variant="outline" onClick={registro.tentarDeNovo}>Tentar de novo</Button>
        </CardContent></Card>
      ) : !registro.liberado ? (
        <div className="flex items-center justify-center h-24 text-sm text-muted-foreground" data-registro="aguardando"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Registrando o acesso…</div>
      ) : (
        <div className="space-y-2" data-lista="sem-contribuicao">
          {textoDoRegistro(registro.estado) && <p className={`text-xs ${registro.estado === "indisponivel" ? "text-warning-text" : "text-muted-foreground"}`} data-registro={registro.estado}>{textoDoRegistro(registro.estado)}</p>}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground" data-contagem>{visiveis.length} pessoa{visiveis.length !== 1 ? "s" : ""} · em ordem alfabética</p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="gap-1 h-8" disabled={exportando || visiveis.length === 0} onClick={() => aoExportar("xlsx", visiveis)}><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</Button>
              <Button size="sm" variant="outline" className="gap-1 h-8" disabled={exportando || visiveis.length === 0} onClick={() => aoExportar("csv", visiveis)}><FileText className="w-3.5 h-3.5" /> CSV</Button>
            </div>
          </div>
          {visiveis.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground">Ninguém com esses filtros.</CardContent></Card>
          ) : (
            <div className="space-y-1">
              {visiveis.map(p => (
                <div key={p.id} data-pessoa={p.id} className="border rounded-md px-3 py-2 min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <NomePessoa id={p.id} nome={p.nome} somenteLeitura className="font-medium text-sm truncate min-w-0" />
                    <span className="text-xs text-muted-foreground shrink-0">{p.tipo === "membro" ? "Membro" : p.tipo === "visitante" ? "Visitante" : "Congregado"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.ultima ? `Última contribuição${filtros.considerar === "dizimo" ? " de dízimo" : ""}: ${dataBr(p.ultima)} (há ${p.dias} dias)` : "Sem contribuição no período e sem registro anterior"}
                    {p.familiaContribui ? " · alguém da família contribuiu" : ""}{p.menor ? " · menor de 18 anos" : ""}{p.semNascimento ? " · sem data de nascimento" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
