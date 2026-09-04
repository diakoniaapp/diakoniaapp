// ─── QuemNinguemProcurou.tsx ─────────────────────────────────────────────────
// A pergunta pastoral do dia, na tela que se abre primeiro.
//
// Reaproveita, sem criar nada paralelo:
//   membros.ultimo_contato_em      o dado (já existia, estava zerado)
//   visita_historico / logHistorico o registro imutável
//   ContatoResultadoDialog          o diálogo de "o que aconteceu?"
//   Widget Registry                 o lugar na tela HOJE
//   /membros?cuidado=…              a lista completa, com o filtro que já existe
//
// DUAS DECISÕES QUE OS DADOS FORÇARAM
//
// 1. Só entra quem TEM telefone. As duas ações oferecidas são WhatsApp e
//    registrar contato; sem telefone a primeira é impossível e a segunda é uma
//    promessa vazia. Listar quem não se pode alcançar transformaria o bloco em
//    lembrete de culpa. Quantos ficaram de fora aparece no rodapé, ligando de
//    volta ao alerta de alcance do painel — que é onde isso se resolve.
//
// 2. Ordem: mais esquecido primeiro, e nunca-contatado antes de todos. Hoje
//    isso significa quase todo mundo (o registro de contato acabou de nascer),
//    então o bloco mostra CINCO pessoas, não uma lista infinita. Cinco é o que
//    se faz numa manhã. Lista que não acaba não é lista de trabalho.

import { useEffect, useState } from "react";
import { NomePessoa } from "@/components/membros/ficha";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, MessageCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { useReportarVazio } from "@/components/hoje/vazio";
import { logHistorico } from "@/lib/historicoFluxo";
import ContatoResultadoDialog from "@/components/membros/ContatoResultadoDialog";

const QUANTAS = 5;

interface PessoaEsquecida {
  id: string;
  nome_completo: string;
  telefone_celular: string | null;
  ultimo_contato_em: string | null;
}

/** Saúde relacional em um símbolo. Verde ≤30 · amarelo 31-60 · vermelho >60 · preto nunca. */
function saude(ultimoContato: string | null) {
  if (!ultimoContato) {
    return { icone: "⚫", texto: "Nunca contatada", dias: null as number | null };
  }
  const dias = Math.floor((Date.now() - new Date(ultimoContato).getTime()) / 86_400_000);
  if (dias <= 30) return { icone: "🟢", texto: `Há ${dias === 0 ? "menos de um dia" : `${dias} dias`}`, dias };
  if (dias <= 60) return { icone: "🟡", texto: `Há ${dias} dias`, dias };
  return { icone: "🔴", texto: `Há ${Math.floor(dias / 30)} meses`, dias };
}

function soDigitos(t: string | null) {
  return (t ?? "").replace(/\D/g, "");
}

export function QuemNinguemProcurou() {
  const [pessoas, setPessoas] = useState<PessoaEsquecida[] | null>(null);
  const [semTelefone, setSemTelefone] = useState(0);
  const [alvoContato, setAlvoContato] = useState<PessoaEsquecida | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    // `nullsFirst` é o que coloca quem nunca foi procurado na frente — sem
    // isso o Postgres joga NULL para o fim e o caso mais grave sumiria.
    const { data } = await supabase
      .from("membros")
      .select("id, nome_completo, telefone_celular, ultimo_contato_em")
      .eq("status", "ativo")
      .not("telefone_celular", "is", null)
      .order("ultimo_contato_em", { ascending: true, nullsFirst: true })
      .limit(QUANTAS);

    const { count } = await supabase
      .from("membros")
      .select("id", { count: "exact", head: true })
      .eq("status", "ativo")
      .is("telefone_celular", null);

    setPessoas((data ?? []) as PessoaEsquecida[]);
    setSemTelefone(count ?? 0);
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try { await carregar(); } catch { if (!cancelado) setPessoas([]); }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useReportarVazio(pessoas !== null && pessoas.length === 0);

  const abrirWhatsApp = (p: PessoaEsquecida) => {
    const fone = soDigitos(p.telefone_celular);
    if (!fone) return toast.error("Telefone não cadastrado");
    const primeiro = p.nome_completo.split(" ")[0];
    const msg = `Olá, ${primeiro}! Passando para saber como você está. 🙏`;
    window.open(
      `https://wa.me/${fone.startsWith("55") ? fone : "55" + fone}?text=${encodeURIComponent(msg)}`,
      "_blank", "noopener,noreferrer",
    );
  };

  const registrar = async (p: PessoaEsquecida, tipo: string, observacao: string) => {
    setSalvando(true);
    // Chama a funcao do banco em vez de escrever direto na tabela.
    //
    // O update direto daqui NUNCA funcionou para quem tem papel "lideranca" —
    // que e o papel de 4 dos 6 usuarios. Nenhuma politica de UPDATE de
    // "membros" menciona esse papel, e quando a politica barra, o Postgres
    // afeta zero linhas e devolve sucesso. O historico, cuja tabela aceita
    // qualquer usuario logado, gravava mesmo assim — e a tela anunciava
    // "Contato registrado" sobre coisa nenhuma.
    const { data: gravou, error } = await supabase.rpc("registrar_contato", {
      p_pessoa: p.id,
      p_tipo: tipo,
      p_obs: observacao || null,
    });

    if (error) {
      toast.error(error.message);
      setSalvando(false);
      return;
    }
    // A funcao devolve false quando nenhuma linha mudou. Sem esta conferencia
    // voltariamos exatamente ao defeito que ela existe para corrigir.
    if (!gravou) {
      toast.error("Não foi possível registrar o contato desta pessoa.");
      setSalvando(false);
      return;
    }
    // So depois de confirmado. Antes, o historico era gravado mesmo quando a
    // ficha nao era — e as duas tabelas passavam a discordar.
    await logHistorico(p.id, "observacao", tipo + (observacao ? ` — ${observacao}` : ""));
    toast.success(`Contato registrado para ${p.nome_completo.split(" ")[0]}`);
    setSalvando(false);
    setAlvoContato(null);
    // Recarrega para a pessoa sair da lista e outra entrar no lugar: a fila
    // anda, e o bloco mostra sempre quem está esperando mais.
    carregar();
  };

  if (pessoas === null) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-5 text-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Vendo quem está esperando...
        </CardContent>
      </Card>
    );
  }

  if (pessoas.length === 0) return null;

  return (
    <>
      <Card>
        <CardContent className="py-3 space-y-1">
          <ul className="divide-y">
            {pessoas.map(p => {
              const s = saude(p.ultimo_contato_em);
              return (
                <li key={p.id} className="py-2 flex items-center gap-3 flex-wrap">
                  <span className="text-base leading-none shrink-0" aria-hidden="true">{s.icone}</span>
                  <div className="flex-1 min-w-[10rem]">
                    <NomePessoa id={p.id} nome={p.nome_completo} className="font-medium truncate leading-tight block w-full" />
                    <p className="text-xs text-muted-foreground">{s.texto}</p>
                  </div>
                  {/* Duas ações de um toque, com rótulo. O ícone sozinho obriga
                      a adivinhar, e quem usa isto está com o telefone na mão. */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      className="h-11 px-3 gap-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white border-0"
                      onClick={() => abrirWhatsApp(p)}
                    >
                      <MessageCircle className="w-4 h-4" />
                      WhatsApp
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-11 px-3 gap-1.5"
                      onClick={() => setAlvoContato(p)}
                    >
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      Registrar
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <Link
              to="/membros?cuidado=nunca"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline min-h-[44px]"
            >
              Ver todos em Pessoas <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            {semTelefone > 0 && (
              <span className="text-xs text-muted-foreground">
                {semTelefone} {semTelefone === 1 ? "pessoa está" : "pessoas estão"} fora desta lista por não ter telefone
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <ContatoResultadoDialog
        open={!!alvoContato}
        onOpenChange={(v) => { if (!v) setAlvoContato(null); }}
        nomeVisitante={alvoContato?.nome_completo ?? ""}
        saving={salvando}
        onConfirm={async (tipo, obs) => {
          if (alvoContato) await registrar(alvoContato, tipo, obs);
        }}
      />
    </>
  );
}
