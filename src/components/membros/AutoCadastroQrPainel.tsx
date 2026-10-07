// ─── AutoCadastroQrPainel — a recepção: o QR Code, o culto de agora e "Visitantes de hoje" ────────────────────
//
// O QR aponta para a página pública /visitante?p=<código>. O código é aleatório, desligável e trocável (tabela
// `visitante_pontos`): se o link vazar, desliga-se e cria-se outro. "Visitantes de hoje" atualiza sozinho; a recepção
// vê só "pediu oração/contato", nunca o conteúdo do pedido (isso é da fila pastoral).
// Sem a migration do AutoCadastro o painel não aparece.

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Loader2, Printer, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { conferir } from "@/lib/escritaConferida";

interface Ponto { id: string; codigo: string; nome: string; ativo: boolean }
interface DeHoje {
  checkin_id: string; membro_id: string; nome_completo: string; tipo_pessoa: string; numero_visitas: number | null;
  novo_cadastro: boolean; culto: string | null; criado_em: string; deseja_contato: boolean;
  oracao_familia: boolean; oracao_saude: boolean; oracao_trabalho: boolean; oracao_outro: boolean;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function AutoCadastroQrPainel() {
  const [disponivel, setDisponivel] = useState<boolean | null>(null);
  const [ponto, setPonto] = useState<Ponto | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [lista, setLista] = useState<DeHoje[]>([]);
  const [cultoAgora, setCultoAgora] = useState<string | null>(null);
  const [cultoManual, setCultoManual] = useState("");
  const [salvandoCulto, setSalvandoCulto] = useState(false);

  const link = ponto ? `${window.location.origin}/visitante?p=${ponto.codigo}` : "";

  const carregarPonto = useCallback(async () => {
    const { data, error } = await supabase.from("visitante_pontos" as never).select("id, codigo, nome, ativo").eq("ativo" as never, true as never)
      .order("created_at" as never).limit(1);
    if (error) { setDisponivel(false); return; }
    setDisponivel(true);
    setPonto(((data ?? []) as unknown as Ponto[])[0] ?? null);
  }, []);
  useEffect(() => { carregarPonto(); }, [carregarPonto]);

  useEffect(() => {
    if (!link) { setQr(null); return; }
    QRCode.toDataURL(link, { width: 280, margin: 2 }).then(setQr).catch(() => setQr(null));
  }, [link]);

  const carregarHoje = useCallback(async () => {
    const { data } = await supabase.from("vw_visitantes_de_hoje" as never).select("*");
    setLista((data ?? []) as unknown as DeHoje[]);
    const r = await supabase.rpc("visitante_culto_agora" as never);
    const linha = ((r.data ?? []) as unknown as { culto: string }[])[0];
    setCultoAgora(linha?.culto ?? null);
  }, []);
  useEffect(() => {
    if (!disponivel) return;
    carregarHoje();
    const id = window.setInterval(carregarHoje, 15_000);
    return () => window.clearInterval(id);
  }, [disponivel, carregarHoje]);

  // "Trocar QR" desativa o atual: pede um segundo toque (sem confirm() nativo, que não funciona em WebView)
  const [confirmaTroca, setConfirmaTroca] = useState(false);
  async function trocarCodigo() {
    if (!ponto) return;
    if (!confirmaTroca) { setConfirmaTroca(true); window.setTimeout(() => setConfirmaTroca(false), 5000); return; }
    setConfirmaTroca(false);
    const { data: novo, error } = await supabase.from("visitante_pontos" as never).insert({ nome: ponto.nome } as never).select("id, codigo, nome, ativo");
    if (error || !novo) { toast.error(error?.message ?? "Não foi possível criar o novo QR"); return; }
    const r = conferir(await supabase.from("visitante_pontos" as never).update({ ativo: false } as never).eq("id" as never, ponto.id as never).select("id"), "O QR antigo");
    if (!r.ok) { toast.error(r.erro); return; }
    toast.success("QR novo criado. O antigo deixou de funcionar: imprima o novo.");
    await carregarPonto();
  }

  async function definirCulto() {
    const texto = cultoManual.trim();
    if (!texto) return;
    setSalvandoCulto(true);
    try {
      await supabase.from("visitante_sessoes" as never).update({ ativo: false } as never).eq("ativo" as never, true as never);
      const { error } = await supabase.from("visitante_sessoes" as never).insert({ culto: texto } as never);
      if (error) throw new Error(error.message);
      toast.success(`Culto de hoje: ${texto}`);
      setCultoManual("");
      await carregarHoje();
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível definir o culto"); }
    finally { setSalvandoCulto(false); }
  }

  if (!disponivel) return null;

  return (
    <section className="rounded-lg border bg-card p-4 space-y-4" aria-labelledby="qr-visitantes">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 id="qr-visitantes" className="text-sm font-bold flex items-center gap-1.5"><QrCode className="w-4 h-4" /> AutoCadastro por QR Code</h2>
          <p className="text-xs text-muted-foreground">O visitante lê o QR com a câmera do celular e preenche em menos de 1 minuto.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="space-y-2 print:block">
          {qr ? <img src={qr} alt="QR Code do cadastro de visitantes" className="w-48 h-48 rounded border bg-white mx-auto md:mx-0" /> : <div className="w-48 h-48 rounded border grid place-items-center"><Loader2 className="w-5 h-5 animate-spin" /></div>}
          <div className="flex flex-wrap gap-1.5 print:hidden">
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}>
              <Copy className="w-3 h-3" /> Copiar link
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => window.print()}>
              <Printer className="w-3 h-3" /> Imprimir
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={trocarCodigo} title="Se o QR vazar: cria um novo e desativa o atual">
              <RefreshCw className="w-3 h-3" /> {confirmaTroca ? "Toque de novo para confirmar" : "Trocar QR"}
            </Button>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Culto/evento agora (pela agenda): </span>
            <strong>{cultoAgora ?? "nenhum culto na agenda neste horário"}</strong>
            <div className="mt-1.5 flex gap-1.5 print:hidden">
              <Input value={cultoManual} onChange={e => setCultoManual(e.target.value)} placeholder="Ou digite o culto/evento de hoje" className="h-8 text-xs" />
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs shrink-0" disabled={!cultoManual.trim() || salvandoCulto} onClick={definirCulto}>Definir</Button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Visitantes de hoje · {lista.length}</h3>
            {lista.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Ninguém se cadastrou pelo QR hoje ainda. A lista atualiza sozinha.</p>
            ) : (
              <ul className="divide-y">
                {lista.map(v => (
                  <li key={v.checkin_id} className="py-1.5 text-sm flex items-center gap-2 min-w-0">
                    <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{hora(v.criado_em)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{v.nome_completo}</span>
                    {v.tipo_pessoa !== "visitante" && <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{v.tipo_pessoa}</span>}
                    {v.tipo_pessoa === "visitante" && (
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${v.novo_cadastro ? "border-success-line bg-success-soft text-success-text" : "border-info-line bg-info-soft text-info-text"}`}>
                        {v.novo_cadastro ? "novo" : `voltou · visita ${v.numero_visitas ?? "?"}`}
                      </span>
                    )}
                    {(v.oracao_familia || v.oracao_saude || v.oracao_trabalho || v.oracao_outro) && <span title="Pediu oração" className="shrink-0">🙏</span>}
                    {v.deseja_contato && <span title="Quer contato pastoral" className="shrink-0 text-[11px] text-warning-text">contato</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
