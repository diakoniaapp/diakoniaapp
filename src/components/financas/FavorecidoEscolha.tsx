// ─── FavorecidoEscolha — primeiro passo de "Novo favorecido": quem é? (Pessoa do cadastro ou Empresa) ────────
//
// Pedido dela (07/10/2026): ao criar um favorecido, PESQUISAR o Cadastro de Pessoas primeiro. Se achar (Telma, Pastor
// Alexandre, Missionária Nina…): "Vincular pessoa existente como favorecido financeiro", sem registro duplicado — e se já
// existir cadastro financeiro dela (mesmo CPF/nome, ex. MEI com CNPJ no nome), oferecer LIGAR aquele. Se não houver pessoa:
// 🏢 Favorecido Empresarial. Funcionários, pastores, missionários, membros e preletores continuam sendo Pessoas.

import { useEffect, useState } from "react";
import { Building2, Link2, Loader2, Search, User } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FinFornecedor } from "@/services/finService";
import {
  buscarPessoasParaFavorecido, candidatosDaPessoa, vincularPessoaComoFavorecido,
  type CandidatoFinanceiro, type PessoaBusca,
} from "@/services/favorecidoService";

const ROTULO_VINCULO: Record<string, string> = { membro: "membro", congregado: "congregado", visitante: "visitante" };

export function FavorecidoEscolha({ onFavorecido, onEmpresa }: {
  /** A pessoa já é (ou acabou de virar) favorecida: segue para os dados financeiros dela. */
  onFavorecido: (f: FinFornecedor) => void;
  onEmpresa: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [achadas, setAchadas] = useState<PessoaBusca[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [escolhida, setEscolhida] = useState<PessoaBusca | null>(null);
  const [candidatos, setCandidatos] = useState<CandidatoFinanceiro[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (escolhida) return;
    if (termo.trim().length < 2) { setAchadas(null); return; }
    setBuscando(true);
    const id = window.setTimeout(() => {
      buscarPessoasParaFavorecido(termo).then(setAchadas).catch(() => setAchadas([])).finally(() => setBuscando(false));
    }, 250);
    return () => window.clearTimeout(id);
  }, [termo, escolhida]);

  async function escolher(p: PessoaBusca) {
    setEscolhida(p);
    setCandidatos(null);
    if (p.favorecidoId) return; // já é favorecida: não há o que decidir
    try { setCandidatos(await candidatosDaPessoa(p.id)); } catch { setCandidatos([]); }
  }

  async function vincular(cadastroId?: string) {
    if (!escolhida) return;
    setOcupado(true);
    try {
      const f = await vincularPessoaComoFavorecido(escolhida.id, cadastroId);
      toast.success(cadastroId ? `Cadastro financeiro ligado a ${escolhida.nome}` : `${escolhida.nome} agora é favorecida`);
      onFavorecido(f);
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível vincular"); }
    finally { setOcupado(false); }
  }

  return (
    <div className="space-y-4">
      {!escolhida ? (
        <>
          <div>
            <label htmlFor="fav-busca" className="text-sm font-medium">Procure no Cadastro de Pessoas</label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="fav-busca" className="pl-8" autoFocus placeholder="Nome da pessoa (funcionário, pastor, missionário, membro…)"
                value={termo} onChange={e => setTermo(e.target.value)} />
            </div>
          </div>
          {buscando && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Procurando…</p>}
          {achadas && achadas.length === 0 && !buscando && (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
              Ninguém com esse nome no Cadastro de Pessoas. Se for uma empresa, use o botão abaixo.
            </p>
          )}
          {achadas && achadas.length > 0 && (
            <ul className="divide-y rounded-md border">
              {achadas.map(p => (
                <li key={p.id}>
                  <button type="button" onClick={() => escolher(p)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{ROTULO_VINCULO[p.vinculo] ?? p.vinculo}</span>
                    {p.favorecidoId && <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-success-text border-success-line bg-success-soft">já é favorecida</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Não é uma pessoa da igreja?</p>
            <Button type="button" variant="outline" className="gap-2" onClick={onEmpresa}>
              <Building2 className="w-4 h-4" /> Favorecido Empresarial
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">Light, Amil, Vivo, Claro… e prestadores de fora da igreja.</p>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><User className="w-4 h-4" /> {escolhida.nome}</p>
            <p className="text-xs text-muted-foreground">{ROTULO_VINCULO[escolhida.vinculo] ?? escolhida.vinculo} · do Cadastro de Pessoas</p>
          </div>

          {escolhida.favorecidoId ? (
            <>
              <p className="text-sm">Esta pessoa <strong>já é favorecida</strong>. Não se cria um segundo cadastro: abra o dela para completar Pix, banco e os dados habituais.</p>
              <Button type="button" disabled={ocupado} onClick={() => vincular()}>{ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : "Abrir o favorecido dela"}</Button>
            </>
          ) : candidatos === null ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Conferindo se já existe cadastro financeiro dela…</p>
          ) : (
            <>
              {candidatos.length > 0 && (
                <div className="rounded-md border border-warning-line bg-warning-soft/40 p-3 space-y-2">
                  <p className="text-sm font-medium">Já existe cadastro financeiro com {candidatos[0].motivo === "mesmo CPF" ? "o mesmo CPF" : "o mesmo nome"}. Ligue-o em vez de criar outro:</p>
                  {candidatos.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{c.nome} <span className="text-xs text-muted-foreground">· {c.lancamentos} lançamento{c.lancamentos === 1 ? "" : "s"}</span></span>
                      <Button type="button" size="sm" variant="outline" className="gap-1 shrink-0" disabled={ocupado} onClick={() => vincular(c.id)}>
                        <Link2 className="w-3 h-3" /> Ligar este
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" disabled={ocupado} onClick={() => vincular()} className="gap-2">
                {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {candidatos.length > 0 ? "Não é nenhum destes: criar um novo" : "Vincular pessoa existente como favorecido financeiro"}
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => { setEscolhida(null); setCandidatos(null); }}>← Escolher outra pessoa</Button>
        </div>
      )}
    </div>
  );
}
