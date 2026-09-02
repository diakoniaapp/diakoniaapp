// ─── PermissoesDosPerfis.tsx — o que cada perfil pode fazer ─────────────────
//
// Um perfil por vez, e não uma grade de perfis × permissões.
//
// A grade completa seria 6 perfis × 39 permissões = 234 caixas numa tela só.
// Quem abre isto abre com uma pergunta concreta na cabeça — "a liderança pode
// editar pessoa?" —, e a grade obriga a achar o cruzamento certo antes de
// responder. Escolhendo o perfil primeiro, a tela responde a pergunta que a
// pessoa veio fazer e nada mais.
//
// Ver a nota longa em `services/permissoesPerfilService.ts` sobre por que isto
// escreve em `role_permissoes` e não na grade de `permissoes_modulo`.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, ShieldCheck, Loader2 } from "lucide-react";
import { ListSkeleton } from "@/components/ListState";
import { ROLE_LABEL } from "@/types/usuario";
import type { AppRole } from "@/hooks/useAuth";
import {
  catalogoDePermissoes, concessoesAtuais, chaveDaConcessao,
  conceder, revogar, rotuloDoModulo,
  type ModuloDePermissoes,
} from "@/services/permissoesPerfilService";

/**
 * `diakonia` — "Pastor titular" — entra na lista. Corrigido em 26/08/2026.
 *
 * O comentário anterior dizia que ele estava "já migrado para `pastor`" e por
 * isso ficava de fora. **A migração nunca aconteceu.** O arquivo que o
 * comentário citava, `sql/migrations/diakonia_para_pastor.sql`, não existe; e
 * `diakonia` está no enum desde a primeira migration, enquanto `pastor` veio
 * depois.
 *
 * Medido no banco: `pastor` sozinho não enxerga famílias, vínculos familiares,
 * visitas, histórico de membresia nem acompanhamento de visitante. `diakonia`
 * enxerga. São 62 combinações tabela+operação contra 34.
 *
 * Deixá-lo de fora escondia da administração o único perfil que dá ao pastor
 * o que ele precisa para o cuidado pastoral.
 */
// Sem `diakonia`: ele tem o catálogo inteiro por definição (dono do
// sistema), e mostrar 47 caixas todas marcadas só ocuparia a tela.
const PERFIS: AppRole[] = ["admin", "secretaria", "tesouraria", "pastor", "lideranca", "voluntario", "membro"];

export function PermissoesDosPerfis({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [perfil, setPerfil]     = useState<AppRole>("lideranca");
  const [modulos, setModulos]   = useState<ModuloDePermissoes[]>([]);
  const [concedidas, setConcedidas] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([catalogoDePermissoes(), concessoesAtuais()])
      .then(([cat, con]) => {
        if (cancelado) return;
        setModulos(cat);
        setConcedidas(con);
      })
      .catch((e) => {
        if (!cancelado) toast.error(e instanceof Error ? e.message : "Não foi possível ler as permissões.");
      })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, []);

  async function alternar(codigo: string, marcar: boolean) {
    const chave = chaveDaConcessao(perfil, codigo);
    setSalvando(chave);

    // Otimista: a caixa muda na hora. O contrário — esperar o banco para só
    // então mover — faz a caixa parecer travada, e a pessoa clica de novo.
    setConcedidas((antes) => {
      const novo = new Set(antes);
      if (marcar) novo.add(chave); else novo.delete(chave);
      return novo;
    });

    const r = marcar ? await conceder(perfil, codigo) : await revogar(perfil, codigo);
    setSalvando(null);

    if (!r.ok) {
      // Devolve a caixa ao estado real. Uma caixa marcada que não virou
      // permissão é pior que um erro visível: a pessoa sai daqui achando que
      // liberou o acesso, e quem precisava dele continua barrado sem saber
      // por quê.
      setConcedidas((antes) => {
        const novo = new Set(antes);
        if (marcar) novo.delete(chave); else novo.add(chave);
        return novo;
      });
      toast.error(r.erro ?? "Não foi possível alterar a permissão.");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Permissões dos perfis
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          O que cada perfil enxerga e pode fazer. Vale para todos os usuários daquele perfil.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Escolha do perfil ──────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1.5">
          {PERFIS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPerfil(p)}
              className={`h-9 px-3 rounded-md text-sm border transition-colors ${
                perfil === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-border"
              }`}
            >
              {ROLE_LABEL[p] ?? p}
            </button>
          ))}
        </div>

        {/* ── O alcance, dito antes de a pessoa marcar qualquer coisa ─────
            Sem esta frase a tela promete mais do que entrega: parte das
            regras do sistema mora em políticas do banco que não consultam
            esta lista, e alguém marcaria uma caixa esperando destravar algo
            que continuaria travado. */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Estas marcações governam <strong>o que a interface oferece</strong> — telas,
            blocos do painel e atalhos. Algumas regras do banco decidem por conta própria,
            e nesses casos ele tem a palavra final: se as duas discordarem, o sistema avisa
            na hora de salvar em vez de dizer que salvou.
          </AlertDescription>
        </Alert>

        {!podeGerenciar && (
          <Alert>
            <AlertDescription className="text-xs">
              Você pode consultar, mas só a administração altera permissões.
            </AlertDescription>
          </Alert>
        )}

        {carregando ? (
          <ListSkeleton />
        ) : (
          <div className="space-y-5">
            {modulos.map(({ modulo, permissoes }) => (
              <div key={modulo}>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  {rotuloDoModulo(modulo)}
                </h3>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                  {permissoes.map((perm) => {
                    const chave  = chaveDaConcessao(perfil, perm.codigo);
                    const marcada = concedidas.has(chave);
                    const ocupada = salvando === chave;
                    return (
                      <label
                        key={perm.codigo}
                        className={`flex items-start gap-2.5 py-1.5 px-2 -mx-2 rounded-md ${
                          podeGerenciar ? "cursor-pointer hover:bg-muted/60" : "cursor-default"
                        }`}
                      >
                        <Checkbox
                          checked={marcada}
                          disabled={!podeGerenciar || ocupada}
                          onCheckedChange={(v) => alternar(perm.codigo, v === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-sm block leading-snug">
                            {/* A descrição primeiro, o código depois: a frase é
                                o que responde "isto libera o quê", e o código
                                serve para quem for procurar no sistema. */}
                            {perm.descricao ?? perm.codigo}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {perm.codigo}
                          </span>
                        </span>
                        {ocupada && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 mt-1" />}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
