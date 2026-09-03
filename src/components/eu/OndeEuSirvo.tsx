// ─── OndeEuSirvo.tsx ─────────────────────────────────────────────────────────
// "Onde você serve, e o que você faz lá" — no Meu Espaço.
//
// ── POR QUE ESTA PERGUNTA É DA PESSOA, E NÃO DO LÍDER ────────────────────────
//
// 114 dos 132 vínculos ativos não dizem o que a pessoa faz. Pedir que um líder
// preencha 114 linhas é pedir a uma pessoa aquilo que 86 sabem melhor. Quem
// sabe o que o Fulano faz na Recepção é o Fulano.
//
// O desenho é o do IDE Escalas, verificado na documentação antes de escrever:
// o voluntário escolhe entre as funções da sua área, a liderança é notificada
// e confirma. A escolha continua sendo do catálogo — autodeclarar não é campo
// livre com outro nome.
//
// ── O QUE ESTA TELA NÃO DEIXA FAZER ──────────────────────────────────────────
//
// Autoconfirmar. A etiqueta nasce "a confirmar" e assim fica até alguém da
// equipe dizer amém. Não é a tela que garante isso: é a política de INSERT do
// banco, que exige `origem = 'autodeclarada'` e `confirmada_em` nulo. Testado
// no ensaio da migration — a tentativa de autoconfirmar volta zero linhas.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, HeartHandshake } from "lucide-react";
import {
  ondeEuSirvo, declararPosto, retirarDeclaracao, type AreaOndeSirvo,
} from "@/services/meuEspacoService";

export function OndeEuSirvo({ pessoaId }: { pessoaId: string }) {
  const [areas, setAreas] = useState<AreaOndeSirvo[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = () => { ondeEuSirvo(pessoaId).then(setAreas); };
  useEffect(carregar, [pessoaId]);

  if (areas === null) {
    return (
      <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </CardContent></Card>
    );
  }

  // Quem não serve em lugar nenhum não tem o que responder aqui, e um cartão
  // vazio convidando a servir seria outra conversa — a de ser convidado, que
  // não é esta tela.
  if (areas.length === 0) return null;

  async function declarar(a: AreaOndeSirvo, posto: { id: string; nome: string }) {
    setOcupado(posto.id);
    const r = await declararPosto(a.vinculo_id, posto.id);
    setOcupado(null);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`Anotado: ${posto.nome} em ${a.area_nome}. A liderança vai confirmar.`);
    carregar();
  }

  async function retirar(m: { ligacao_id: string; nome: string }) {
    setOcupado(m.ligacao_id);
    const r = await retirarDeclaracao(m.ligacao_id);
    setOcupado(null);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`${m.nome} saiu da sua lista.`);
    carregar();
  }

  return (
    <div className="space-y-2">
      {areas.map(a => {
        const ocupados = new Set(a.meus.map(m => m.posto_id));
        const livres = a.catalogo.filter(p => !ocupados.has(p.id));

        return (
          <Card key={a.vinculo_id}>
            <CardContent className="p-4 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <HeartHandshake className="w-4 h-4 text-gold shrink-0" />
                <span className="font-medium">{a.area_nome}</span>
                <span className="text-xs text-muted-foreground">em {a.ministerio_nome}</span>
                {/* Derivado do cadastro da área, nunca digitado. */}
                {a.lideranca && (
                  <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                    {a.lideranca}
                  </Badge>
                )}
              </div>

              {a.meus.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {a.meus.map(m => (
                    <span
                      key={m.ligacao_id}
                      className={`inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-0.5 text-xs ${
                        m.pendente
                          ? "bg-warning-soft text-warning-text border-warning-line"
                          : "bg-success-soft text-success-text border-success-line"
                      }`}
                    >
                      {m.nome}
                      {m.pendente && <span className="opacity-75">· a confirmar</span>}
                      {/* Só o que ainda pende sai por aqui. Depois de
                          confirmado, a função é da equipe — e quem tira é
                          quem responde por ela. A política do banco diz o
                          mesmo; o botão só evita o erro antes da recusa. */}
                      {m.pendente ? (
                        <button
                          type="button"
                          onClick={() => retirar(m)}
                          disabled={ocupado === m.ligacao_id}
                          aria-label={`Retirar ${m.nome}`}
                          className="rounded-full p-0.5 hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      ) : <span className="w-1" />}
                    </span>
                  ))}
                </div>
              )}

              {a.catalogo.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Esta área ainda não listou as funções dela. Quem lidera a equipe é quem
                  monta essa lista.
                </p>
              ) : livres.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {a.meus.length === 0
                      ? "O que você faz aqui? Toque no que se aplica — a liderança confirma depois."
                      : "Faz mais alguma coisa aqui?"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {livres.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => declarar(a, p)}
                        disabled={ocupado === p.id}
                        className="min-h-[32px] rounded-full border border-dashed border-border px-3 text-xs
                                   text-muted-foreground hover:text-foreground hover:border-primary hover:bg-primary/5
                                   transition-colors focus-visible:outline-none focus-visible:ring-2
                                   focus-visible:ring-ring disabled:opacity-50"
                      >
                        {ocupado === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : p.nome}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
