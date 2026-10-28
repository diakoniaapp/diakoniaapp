// ─── DeclaracaoDoTerceiroCard — a Declaração do Terceiro: gerar, imprimir, colher a assinatura e anexar a via assinada ─────────────────────────────────────────────
//
// Fase 1D-a. O documento é GERADO PELO SISTEMA (ninguém o escreve) e cada via traz uma única frase, a da intenção registrada. Depois de assinada, a via vira a prova FORMAL da intenção. Se o que o
// terceiro declarou mudar (valor, nota, forma de pagamento, chave PIX, intenção…), a via assinada deixa de valer e é preciso gerar e assinar uma nova; centro e categoria não invalidam.
// Só aparece quando o banco já tem a Fase 1D-a e a quitação é de reembolso ou oferta de quem se sabe quem é.
import { useCallback, useEffect, useState } from "react";
import { FileDown, FileSignature, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hojeLocal } from "@/lib/data";
import { baixarDaVia } from "@/lib/declaracaoDoTerceiro";
import { mensagemErro } from "@/lib/erroRede";
import { FORMAS_DE_PAGAMENTO, ROTULO_FORMA, type FormaDePagamento } from "@/lib/quitacao";
import { adicionarAnexo } from "@/services/finService";
import {
  alterarQuitacao, declaracaoDisponivel, gerarDeclaracao, registrarAssinaturaDaDeclaracao, situacaoDaDeclaracao,
  type QuitacaoDaObrigacao, type SituacaoDaDeclaracao, type ViaDaDeclaracao,
} from "@/services/quitacaoService";

const dataBr = (ymd: string | null | undefined) => (ymd ? ymd.slice(0, 10).split("-").reverse().join("/") : "—");

const ROTULO_ESTADO: Record<SituacaoDaDeclaracao["estado"], { texto: string; cls: string }> = {
  sem_declaracao: { texto: "Ainda não gerada", cls: "border-warning-line bg-warning-soft/60 text-warning-text" },
  aguardando_assinatura: { texto: "Aguardando assinatura", cls: "border-warning-line bg-warning-soft/60 text-warning-text" },
  assinada: { texto: "Assinada", cls: "border-success-line bg-success-soft/60 text-success-text" },
  desatualizada: { texto: "Desatualizada", cls: "border-destructive-line bg-destructive-soft text-destructive-text" },
  externa: { texto: "Declaração externa anexada", cls: "border-info-line bg-info-soft text-info-text" },
};

const baixarPdf = (via: ViaDaDeclaracao) => baixarDaVia(via);

export function DeclaracaoDoTerceiroCard({ q, podeEscrever, aberta, recarga, onMudou }: { q: QuitacaoDaObrigacao; podeEscrever: boolean; aberta: boolean; recarga?: number; onMudou?: () => void }) {
  const [disponivel, setDisponivel] = useState(false);
  const [s, setS] = useState<SituacaoDaDeclaracao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [forma, setForma] = useState<FormaDePagamento | "">("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  // Campo de arquivo que NÃO limpa (auditoria da Tesouraria, 27/10/2026, F-09): o <input type="file"> não é controlado — zerar o estado não apaga o nome do arquivo que a tela continua mostrando. A `key` o remonta.
  const [chaveDoArquivo, setChaveDoArquivo] = useState(0);
  const [data, setData] = useState("");
  const [n, setN] = useState(0);
  const recarregar = useCallback(() => { setN(x => x + 1); onMudou?.(); }, [onMudou]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const ok = await declaracaoDisponivel();
      if (!vivo) return;
      setDisponivel(ok);
      if (ok) { const sit = await situacaoDaDeclaracao(q.quitacaoId).catch(() => null); if (vivo) setS(sit); }
    })();
    return () => { vivo = false; };
  }, [q.quitacaoId, n, recarga]);

  if (!disponivel || !s) return null;
  if (q.responsavel === "nao_localizado" || (q.intencao !== "reembolso" && q.intencao !== "oferta")) return null;
  const e = ROTULO_ESTADO[s.estado];
  const editavel = podeEscrever && aberta;
  // REEMBOLSO (28/10/2026): um documento só — Solicitação e Recibo. Assinado pelo recebedor NO ATO do pagamento, é também o comprovante do pagamento em espécie
  const reembolso = q.intencao === "reembolso";

  async function guardarForma() {
    if (!forma) return;
    setOcupado(true);
    try { await alterarQuitacao(q.quitacaoId, { forma_pagamento_terceiro: forma }, "Forma de pagamento do terceiro informada"); toast.success("Forma de pagamento guardada."); recarregar(); }
    catch (err) { toast.error(mensagemErro(err)); } finally { setOcupado(false); }
  }
  async function gerarEBaixar() {
    setOcupado(true);
    try {
      await gerarDeclaracao(q.quitacaoId);
      const sit = await situacaoDaDeclaracao(q.quitacaoId);
      if (sit?.ultima) await baixarPdf(sit.ultima);
      toast.success(reembolso ? "Solicitação e Recibo gerados. Imprima, pague, colha a assinatura do recebedor e anexe a via assinada aqui." : "Declaração gerada. Imprima, colha a assinatura e anexe a via assinada aqui.");
      recarregar();
    } catch (err) { toast.error(mensagemErro(err)); } finally { setOcupado(false); }
  }
  async function anexarAssinada() {
    if (!arquivo || !data || !s?.ultima) return;
    setOcupado(true);
    try {
      const anexo = await adicionarAnexo(q.obrigacaoId, arquivo, "declaracao_terceiro");
      await registrarAssinaturaDaDeclaracao(s.ultima.id, anexo.id, data);
      toast.success(reembolso ? "Via assinada registrada: vale como prova formal e como comprovante do recebimento." : "Via assinada registrada: a intenção agora tem a prova Formal.");
      setArquivo(null); setData(""); setChaveDoArquivo(k => k + 1); recarregar();
    } catch (err) { toast.error(mensagemErro(err)); } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 px-3 py-2.5" aria-label="Declaração do Terceiro">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><FileSignature className="h-3.5 w-3.5" /> Declaração do Terceiro</h4>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${e.cls}`}>{e.texto}</span>
        {s.ultima && <span className="text-[11px] text-muted-foreground">{s.ultima.numero} · versão {s.ultima.versao}{s.ultima.assinadaEm ? ` · assinada em ${dataBr(s.ultima.assinadaEm)}` : ""}</span>}
      </div>

      {!s.forma && editavel && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="decl-forma" className="text-xs">Como o terceiro pagou o fornecedor? (necessário para gerar o documento)</Label>
            <select id="decl-forma" className="h-9 rounded-md border bg-background px-2 text-sm" value={forma} onChange={ev => setForma(ev.target.value as FormaDePagamento | "")}>
              <option value="">Escolha…</option>
              {FORMAS_DE_PAGAMENTO.map(f => <option key={f} value={f}>{ROTULO_FORMA[f]}</option>)}
            </select>
          </div>
          <Button size="sm" className="h-9" disabled={ocupado || !forma} onClick={() => void guardarForma()}>Guardar</Button>
        </div>
      )}
      {s.forma && <p className="text-xs text-muted-foreground">Forma de pagamento do terceiro: <b>{ROTULO_FORMA[s.forma]}</b>.</p>}

      {s.estado === "desatualizada" && <p className="text-xs text-destructive-text">O que o terceiro declarou mudou depois de gerada: a via assinada não vale mais para este registro. Gere uma nova via e colha nova assinatura.</p>}
      {reembolso && (
        <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground" aria-label="Como funciona o reembolso">
          <li>Gere o documento <b>Solicitação e Recibo de Reembolso</b> (o sistema o monta; ninguém escreve).</li>
          <li>Imprima na hora do pagamento: a igreja paga, o recebedor preenche o recibo e assina.</li>
          <li>Anexe a via assinada aqui: vale como <b>comprovante do recebimento</b> — em espécie, não pede PIX, TED nem comprovante de banco.</li>
        </ol>
      )}
      {s.estado === "sem_declaracao" && !reembolso && <p className="text-xs text-muted-foreground">O sistema monta a Declaração com os dados já cadastrados; ninguém a escreve. A via traz só a frase da intenção registrada (oferta, sem reembolso).</p>}
      {s.estado === "externa" && <p className="text-xs text-muted-foreground">Há uma declaração assinada fora do sistema anexada a esta despesa; ela vale. Para padronizar, você pode gerar a Declaração do sistema.</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {editavel && s.forma && (s.estado === "sem_declaracao" || s.estado === "desatualizada" || s.estado === "externa") && (
          <Button size="sm" className="h-8 gap-1.5" disabled={ocupado} onClick={() => void gerarEBaixar()}>
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} {s.estado === "desatualizada" ? "Gerar nova via" : reembolso ? "Gerar Solicitação e Recibo (PDF)" : "Gerar Declaração (PDF)"}
          </Button>
        )}
        {s.ultima && (s.estado === "aguardando_assinatura" || s.estado === "assinada") && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={ocupado} onClick={() => void baixarPdf(s.ultima!)}><FileDown className="h-3.5 w-3.5" /> Baixar PDF</Button>
        )}
      </div>

      {editavel && s.estado === "aguardando_assinatura" && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-2">
          <div className="space-y-1">
            <Label htmlFor="decl-arq" className="flex items-center gap-1 text-xs"><Paperclip className="h-3 w-3" /> {reembolso ? "Via assinada pelo recebedor (foto ou PDF)" : "Via assinada (foto ou PDF)"}</Label>
            <input id="decl-arq" key={chaveDoArquivo} type="file" accept="image/jpeg,image/png,application/pdf" onChange={ev => setArquivo(ev.target.files?.[0] ?? null)} className="text-xs file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1 file:text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="decl-data" className="text-xs">{reembolso ? "Pago em (data da assinatura)" : "Data da assinatura"}</Label>
            <Input id="decl-data" type="date" className="h-9 w-40" max={hojeLocal()} value={data} onChange={ev => setData(ev.target.value)} />
          </div>
          <Button size="sm" className="h-9" disabled={ocupado || !arquivo || !data} onClick={() => void anexarAssinada()}>Registrar assinatura</Button>
        </div>
      )}
    </div>
  );
}
