// ─── FechamentoMensal.tsx — a aba "4 Fechamento" como CHECKLIST do mês ───────────
//
// Pedido dela (03/10/2026): a aba mostrava informação que não é o fechamento real
// (agenda fiscal, "sem comprovante" duplicado da Central, próximos vencimentos). O
// processo real é: conferir conciliações → conferir classificação (categoria, centro) →
// conferir documentos (na Central) → gerar o Malote → enviar à contabilidade.
//
// A pergunta que a aba responde ao abrir: "Estou pronta para gerar e enviar o malote?".
// Só entra aqui o que IMPEDE o fechamento (conta sem conciliar, sem categoria, sem centro,
// saldo inconsistente). Documentos faltando e subcentro são atenção: a Central de
// Documentos cuida deles e o ZIP sai mesmo com pendência (decisão dela, 02/10/2026).
// Fiscal NÃO está aqui — mora em Financeiro > Módulo Fiscal.
//
// Cada etapa carrega sozinha: uma que falha mostra o erro na própria linha e as outras
// seguem de pé.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, CircleDashed, Download, FileStack, Loader2, RefreshCw, Send, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LancamentosACorrigirDialog } from "@/components/financas/LancamentosACorrigirDialog";
import { hojeLocal } from "@/lib/data";
import { formatarPercentual } from "@/lib/documentos/cobertura";
import {
  mesEmFechamento, rotuloDoMes, ultimosMeses, veredito, type Avaliacao,
} from "@/lib/fechamentoMensal";
import {
  avaliarMes, documentacaoDoMes, pacoteDoMes, registrarEnvio, ultimoEnvio,
  type EstadoDoEnvio, type ResumoDocumentacao, type ResumoPacote,
} from "@/services/fechamentoMensalService";
import { baixarPacoteContabil, prepararPacoteContabil } from "@/services/pacoteContabilService";

type Parte<T> = { estado: "carregando" } | { estado: "ok"; dados: T } | { estado: "erro"; msg: string };
const carregando = <T,>(): Parte<T> => ({ estado: "carregando" });

async function como<T>(f: () => Promise<T>): Promise<Parte<T>> {
  try { return { estado: "ok", dados: await f() }; }
  catch (e: any) { return { estado: "erro", msg: e?.message ?? "erro desconhecido" }; }
}

const dataHoraBr = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

interface Props {
  /** Abre a conciliação de uma conta (o painel já sabe fazer isso). */
  onConciliar: (conta: { id: string; nome: string }) => void;
}

export function FechamentoMensal({ onConciliar }: Props) {
  const hoje = hojeLocal();
  const meses = useMemo(() => ultimosMeses(hoje, 13), [hoje]);
  const [alvo, setAlvo] = useState(() => mesEmFechamento(hoje));

  const [av, setAv] = useState<Parte<Avaliacao>>(carregando());
  const [doc, setDoc] = useState<Parte<ResumoDocumentacao>>(carregando());
  const [pacote, setPacote] = useState<Parte<ResumoPacote>>(carregando());
  const [envio, setEnvio] = useState<Parte<EstadoDoEnvio>>(carregando());
  const [correcoes, setCorrecoes] = useState(false);
  const [gerando, setGerando] = useState<[number, number] | null>(null);
  const [gerouAgora, setGerouAgora] = useState(false);
  const [registrando, setRegistrando] = useState(false);

  const { ano, mes } = alvo;
  const rotulo = rotuloDoMes(ano, mes);

  const carregar = useCallback(() => {
    setAv(carregando()); setDoc(carregando()); setPacote(carregando()); setEnvio(carregando());
    setGerouAgora(false);
    void como(() => avaliarMes(ano, mes)).then(setAv);
    void como(() => documentacaoDoMes(ano, mes)).then(setDoc);
    void como(() => pacoteDoMes(ano, mes)).then(setPacote);
    void como(() => ultimoEnvio(ano, mes)).then(setEnvio);
  }, [ano, mes]);
  useEffect(() => { carregar(); }, [carregar]);

  async function gerarMalote() {
    setGerando([0, 1]);
    try {
      const plano = await prepararPacoteContabil(ano, mes);
      const r = await baixarPacoteContabil(plano, (f, t) => setGerando([f, t]));
      setGerouAgora(true);
      if (r.falhas.length > 0) toast.warning(`Malote gerado, mas ${r.falhas.length} arquivo(s) não entraram — veja ERROS.txt no ZIP.`);
      else if (r.pendencias > 0) toast.warning(`Malote gerado com ${r.pendencias} saída(s) sem documento — a lista está em PENDENCIAS.csv.`);
      else toast.success("Malote gerado e baixado");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar o malote");
    } finally {
      setGerando(null);
    }
  }

  async function marcarEnviado() {
    if (pacote.estado !== "ok") return;
    setRegistrando(true);
    try {
      await registrarEnvio(ano, mes, { dossies: pacote.dados.dossies, pendencias: pacote.dados.pendencias });
      toast.success(`Envio de ${rotulo} registrado`);
      void como(() => ultimoEnvio(ano, mes)).then(setEnvio);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível registrar o envio");
    } finally {
      setRegistrando(false);
    }
  }

  const a = av.estado === "ok" ? av.dados : null;
  const aprontando = av.estado === "carregando";

  return (
    <div className="space-y-3">
      {/* ── cabeçalho: o mês e a resposta ───────────────────────────────── */}
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label htmlFor="mes-fechamento" className="text-[10px] uppercase tracking-wide text-muted-foreground block">Mês em fechamento</label>
          <select id="mes-fechamento" value={`${ano}-${mes}`}
            onChange={e => { const [y, m] = e.target.value.split("-").map(Number); setAlvo({ ano: y, mes: m }); }}
            className="h-9 rounded-md border bg-background px-2 text-sm">
            {meses.map(m => <option key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>{rotuloDoMes(m.ano, m.mes)}</option>)}
          </select>
        </div>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={carregar}>
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </Button>
      </div>

      <Veredito av={av} />

      {/* ── os bloqueios, no topo: só o que impede o fechamento ─────────── */}
      {a && !a.pronto && (
        <div className="rounded-md border border-destructive-line bg-destructive-soft/30 p-3 space-y-1.5">
          <p className="text-xs uppercase tracking-wide text-destructive-text font-semibold">Impedem o fechamento</p>
          <ul className="divide-y text-sm">
            {a.bloqueios.slice(0, 6).map(b => (
              <li key={b.id} className="py-1.5 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive-text shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{b.titulo}</span>
                  <span className="block text-xs text-muted-foreground truncate">{b.detalhe}</span>
                </span>
                {b.tipo === "conciliacao" && b.contaId && (
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                    onClick={() => onConciliar({ id: b.contaId!, nome: b.titulo.replace("Conta sem conciliar — ", "") })}>Conciliar</Button>
                )}
                {(b.tipo === "sem_categoria" || b.tipo === "sem_centro") && (
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setCorrecoes(true)}>Corrigir</Button>
                )}
              </li>
            ))}
          </ul>
          {a.bloqueios.length > 6 && <p className="text-xs text-muted-foreground">+ {a.bloqueios.length - 6} outras pendências nas etapas abaixo.</p>}
        </div>
      )}

      {/* ── 1. conciliação ──────────────────────────────────────────────── */}
      <Etapa n={1} titulo="Conciliação" parte={av}
        situacao={a ? (a.conciliacao.pendentes.length > 0 ? "bloqueio" : a.semMovimento.length > 0 ? "atencao" : "ok") : undefined}
        acao={a && (a.conciliacao.pendentes.length > 0 || a.semMovimento.length > 0) && (() => {
          const alvoConta = a.conciliacao.pendentes[0]?.conta ?? a.semMovimento[0];
          return (
            <Button size="sm" className="h-8" onClick={() => onConciliar({ id: alvoConta.id, nome: alvoConta.nome })}>
              {a.conciliacao.pendentes.length > 0 ? "Abrir Conciliação" : "Importar extrato (OFX)"}
            </Button>);
        })()}>
        {a && (a.conciliacao.contas === 0
          ? <p className="text-sm text-muted-foreground">
              {a.semMovimento.length > 0
                ? <><strong>{a.semMovimento.map(c => c.nome).join(", ")}</strong> não tem nenhum lançamento em {rotulo} — o extrato foi importado?</>
                : <>Nenhuma conta de banco teve movimento em {rotulo}.</>}
            </p>
          : <>
              <Numero rotulo="Contas conciliadas" valor={`${a.conciliacao.conciliadas} de ${a.conciliacao.contas}`} />
              <Numero rotulo="Pendentes" valor={String(a.conciliacao.pendentes.length)} alerta={a.conciliacao.pendentes.length > 0} />
              {a.semMovimento.length > 0 && (
                <p className="basis-full text-xs text-warning-text">{a.semMovimento.map(c => c.nome).join(", ")}: sem lançamento nenhum em {rotulo} — o extrato foi importado?</p>
              )}
              {a.conciliacao.pendentes.length > 0 && (
                <p className="basis-full text-xs text-muted-foreground">
                  {a.conciliacao.pendentes.map(p => `${p.conta.nome}: ${p.lancamentos.length} a conciliar`).join(" · ")}
                </p>
              )}
            </>)}
        <p className="basis-full text-[11px] text-muted-foreground">Vale para contas de banco (as únicas com extrato para conferir).</p>
      </Etapa>

      {/* ── 2. lançamentos ──────────────────────────────────────────────── */}
      <Etapa n={2} titulo="Lançamentos" parte={av}
        situacao={a ? (a.semCategoria.length + a.semCentro.length > 0 ? "bloqueio" : a.semSubcentro.length + a.possiveisOfertasMissionarias.length > 0 ? "atencao" : "ok") : undefined}
        acao={a && a.semCategoria.length + a.semCentro.length + a.semSubcentro.length + a.possiveisOfertasMissionarias.length > 0 && (
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setCorrecoes(true)}><Wrench className="w-3.5 h-3.5" /> Abrir Correções</Button>
        )}>
        {a && <>
          <Numero rotulo="Sem categoria" valor={String(a.semCategoria.length)} alerta={a.semCategoria.length > 0} />
          <Numero rotulo="Sem centro de custo" valor={String(a.semCentro.length)} alerta={a.semCentro.length > 0} />
          <Numero rotulo="Sem subcentro" valor={String(a.semSubcentro.length)} atencao={a.semSubcentro.length > 0} />
          <Numero rotulo="⚠ Possível oferta missionária" valor={String(a.possiveisOfertasMissionarias.length)} atencao={a.possiveisOfertasMissionarias.length > 0} />
          {a.possiveisOfertasMissionarias.length > 0 && <p className="basis-full text-[11px] text-muted-foreground">Pix terminado em ,10 fora de Ofertas para Missões: a tesouraria usa essa marca para missões. É só um aviso para conferir — nada é reclassificado sozinho e o malote não é impedido.</p>}
          {a.semSubcentro.length > 0 && <p className="basis-full text-[11px] text-muted-foreground">Despesa sem subcentro é só atenção: ficou no centro-pai e não impede o malote. Receita (dízimos, ofertas) não precisa de subcentro.</p>}
        </>}
      </Etapa>

      {/* ── 3. documentação (só o resumo; o trabalho é na Central) ──────── */}
      <Etapa n={3} titulo="Documentação" parte={doc}
        situacao={doc.estado === "ok" ? (doc.dados.pendencias > 0 ? "atencao" : "ok") : undefined}
        acao={<Button asChild size="sm" className="h-8 gap-1.5"><Link to="/financas/documentos"><FileStack className="w-3.5 h-3.5" /> Abrir Central de Documentos</Link></Button>}>
        {doc.estado === "ok" && <>
          <Numero rotulo="Cobertura documental" valor={formatarPercentual(doc.dados.cobertura)} />
          <Numero rotulo="Pendências" valor={String(doc.dados.pendencias)} atencao={doc.dados.pendencias > 0} />
          <p className="basis-full text-[11px] text-muted-foreground">
            {doc.dados.comDocumento} de {doc.dados.exigem} saídas com documento em {rotulo}. Faltar documento não impede gerar o malote (vai em PENDENCIAS.csv).
          </p>
        </>}
      </Etapa>

      {/* ── 4. pacote contábil ──────────────────────────────────────────── */}
      <Etapa n={4} titulo="Pacote contábil" parte={pacote}
        situacao={pacote.estado === "ok" ? (a && !a.pronto ? "atencao" : "ok") : undefined}
        acao={
          <Button size="sm" className="h-8 gap-1.5" disabled={!!gerando || pacote.estado !== "ok"} onClick={gerarMalote}>
            {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {gerando ? `Gerando ${gerando[0]}/${gerando[1]}` : "Gerar Malote"}
          </Button>}>
        {pacote.estado === "ok" && <>
          <Numero rotulo="Período" valor={rotulo} />
          <Numero rotulo="Documentos (dossiês)" valor={String(pacote.dados.dossies)} />
          <Numero rotulo="Saídas sem documento" valor={String(pacote.dados.pendencias)} atencao={pacote.dados.pendencias > 0} />
          {a && !a.pronto && <p className="basis-full text-[11px] text-warning-text">Há pendências que impedem o fechamento (acima) — o malote sai mesmo assim, mas o ideal é resolvê-las antes.</p>}
        </>}
      </Etapa>

      {/* ── 5. envio à contabilidade ────────────────────────────────────── */}
      <Etapa n={5} titulo="Envio à contabilidade" parte={envio}
        situacao={envio.estado === "ok" ? (envio.dados.envio ? "ok" : "pendente") : undefined}
        acao={envio.estado === "ok" && !envio.dados.indisponivel && (
          <Button size="sm" variant={gerouAgora || !envio.dados.envio ? "default" : "outline"} className="h-8 gap-1.5"
            disabled={registrando || pacote.estado !== "ok"} onClick={marcarEnviado}>
            {registrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {envio.dados.envio ? "Registrar novo envio" : "Registrar envio"}
          </Button>)}>
        {envio.estado === "ok" && (envio.dados.indisponivel
          ? <p className="text-sm text-muted-foreground">Registro de envio indisponível — falta aplicar a migration <code>20261003130000</code> no banco.</p>
          : <>
              <Numero rotulo="Último envio" valor={envio.dados.envio ? dataHoraBr(envio.dados.envio.enviado_em) : "—"} />
              <Numero rotulo="Status" valor={envio.dados.envio ? "Enviado" : "Não enviado"} atencao={!envio.dados.envio} />
              {envio.dados.envio && (
                <p className="basis-full text-[11px] text-muted-foreground">
                  Foram {envio.dados.envio.dossies} documentos, {envio.dados.envio.pendencias_documentos} saída(s) ainda sem documento.
                </p>
              )}
              <p className="basis-full text-[11px] text-muted-foreground">O envio em si é por fora (e-mail/WhatsApp); aqui só fica registrado quando foi.</p>
            </>)}
      </Etapa>

      <p className="text-xs text-muted-foreground pt-1">
        Fora do fechamento:{" "}
        <Link to="/financas/fiscal" className="underline underline-offset-2">Módulo Fiscal</Link>{" · "}
        <Link to="/financas/prestacao-de-contas" className="underline underline-offset-2">Prestação de Contas</Link>{" · "}
        <Link to="/financas/reunioes" className="underline underline-offset-2">Reuniões Financeiras</Link>{" · "}
        <Link to="/financas/auditoria-anexos" className="underline underline-offset-2">Auditoria de documentos</Link>
      </p>

      {a && <LancamentosACorrigirDialog open={correcoes} onOpenChange={setCorrecoes} avaliacao={a} onCorrigido={carregar} />}
      {aprontando && null}
    </div>
  );
}

// ── peças ────────────────────────────────────────────────────────────────────

function Veredito({ av }: { av: Parte<Avaliacao> }) {
  if (av.estado === "carregando") {
    return <div className="rounded-md border p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Conferindo o fechamento…</div>;
  }
  if (av.estado === "erro") {
    return <div className="rounded-md border border-destructive-line p-3 text-sm text-destructive-text">Não foi possível conferir o fechamento: {av.msg}</div>;
  }
  const pronto = av.dados.pronto;
  return (
    <div className={`rounded-md border p-3 flex items-center gap-2 ${pronto ? "border-success-line bg-success-soft/40 text-success-text" : "border-warning-line bg-warning-soft/40 text-warning-text"}`}
      role="status">
      {pronto ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
      <div>
        <p className="font-medium">{pronto ? "Estou pronta para gerar o malote: sim." : "Estou pronta para gerar o malote: ainda não."}</p>
        <p className="text-xs opacity-90">{veredito(av.dados)}</p>
      </div>
    </div>
  );
}

type Situacao = "ok" | "bloqueio" | "atencao" | "pendente";

function Etapa<T>({ n, titulo, parte, situacao, acao, children }: {
  n: number; titulo: string; parte: Parte<T>; situacao?: Situacao; acao?: React.ReactNode | false; children?: React.ReactNode;
}) {
  const icone = parte.estado === "carregando" ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
    : parte.estado === "erro" ? <AlertTriangle className="w-4 h-4 text-destructive-text" />
    : situacao === "ok" ? <CheckCircle2 className="w-4 h-4 text-success-text" />
    : situacao === "bloqueio" ? <AlertTriangle className="w-4 h-4 text-destructive-text" />
    : situacao === "atencao" ? <AlertTriangle className="w-4 h-4 text-warning-text" />
    : <CircleDashed className="w-4 h-4 text-muted-foreground" />;
  const texto = parte.estado === "ok" ? (situacao === "ok" ? "em ordem" : situacao === "bloqueio" ? "impede o fechamento" : situacao === "atencao" ? "atenção" : "a fazer") : "";
  return (
    <section className="rounded-md border bg-card p-3" aria-label={`Etapa ${n}: ${titulo}`}>
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-muted text-[11px] font-semibold flex items-center justify-center shrink-0" aria-hidden>{n}</span>
        <h3 className="font-medium text-sm flex-1 min-w-0">{titulo}</h3>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">{icone}{texto}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
        {parte.estado === "erro" && <p className="text-sm text-destructive-text">Não foi possível carregar: {parte.msg}</p>}
        {parte.estado === "ok" && children}
        {acao && <div className="ml-auto">{acao}</div>}
      </div>
    </section>
  );
}

function Numero({ rotulo, valor, alerta, atencao }: { rotulo: string; valor: string; alerta?: boolean; atencao?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
      <p className={`font-semibold tabular-nums text-lg leading-tight ${alerta ? "text-destructive-text" : atencao ? "text-warning-text" : ""}`}>{valor}</p>
    </div>
  );
}
