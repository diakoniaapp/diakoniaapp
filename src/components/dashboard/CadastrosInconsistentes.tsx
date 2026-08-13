// ─── CadastrosInconsistentes.tsx ─────────────────────────────────────────────
// Cadastros que se contradizem: o registro afirma uma coisa e deixa em branco
// o campo que a sustenta.
//
// POR QUE SO CONTRADICAO, E NAO "CAMPO VAZIO"
//
// Medido na base real, entre os 277 cadastros ativos:
//
//   casado sem data de casamento     35   13%
//   membro sem data de entrada       54   19%
//   sem data de nascimento          183   66%
//   sem telefone nem e-mail         127   46%
//
// Os dois primeiros sao contradicoes — alguem marcou "casado" e nao disse
// quando; alguem e membro e nao ha data de entrada. Da para corrigir olhando
// o proprio registro, e o erro tem consequencia: sem data de casamento a
// pessoa nunca aparece nas bodas, sem data de entrada nao entra no tempo de
// casa.
//
// Os dois ultimos sao apenas campo em branco, e em 66% dos casos. Alerta que
// aponta dois tercos da base nao ajuda a decidir nada — vira ruido de fundo, e
// e exatamente o tipo de marca que passei a semana removendo desta interface.
// Por isso ficaram de fora.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowRight } from "lucide-react";
import { useReportarVazio } from "@/components/hoje/vazio";

interface Pendencia {
  chave: string;
  quantidade: number;
  /** Frase completa, ja no singular ou plural certo. */
  texto: (n: number) => string;
  /** O que se perde enquanto nao for corrigido. */
  consequencia: string;
  /** Bloqueia o cuidado inteiro, nao so um recurso. Sobe e ganha cor. */
  destaque?: boolean;
}

export function CadastrosInconsistentes() {
  const [pendencias, setPendencias] = useState<Pendencia[] | null>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const contar = async (aplicar: (q: ReturnType<typeof baseQuery>) => unknown) => {
        const q = baseQuery();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = (await (aplicar(q) as any)) ?? {};
        return count ?? 0;
      };
      function baseQuery() {
        return supabase.from("membros").select("id", { count: "exact", head: true }).eq("status", "ativo");
      }

      try {
        const [semContato, ativos, casados, membrosSemEntrada] = await Promise.all([
          contar(q => q.is("telefone_celular", null)),
          contar(q => q),
          contar(q => q.eq("estado_civil", "casado").is("data_casamento", null)),
          contar(q => q.eq("tipo_pessoa", "membro").is("data_entrada", null)),
        ]);

        if (cancelado) return;

        const achadas: Pendencia[] = [];

        // ALCANCE VEM PRIMEIRO, e nao por ordem alfabetica de importancia.
        //
        // Quando este bloco nasceu, eu deixei "sem telefone" DE FORA: sao 46%
        // da base, e marca presente em quase metade nao distingue nada — era a
        // regra certa quando o objetivo era reduzir ruido visual.
        //
        // Sob o Diakonia Care o objetivo mudou, e com ele a resposta. Quem nao
        // tem telefone nao recebe aniversario, nao recebe convite, nao entra em
        // nenhuma jornada de cuidado. Nao e um campo em branco: e uma pessoa
        // fora de alcance. Deixou de ser ruido para virar a primeira linha.
        if (semContato > 0) {
          const alcancaveis = ativos - semContato;
          const pct = ativos > 0 ? Math.round((alcancaveis / ativos) * 100) : 0;
          achadas.push({
            chave: "sem-telefone",
            quantidade: semContato,
            destaque: true,
            texto: n => `${n} ${n === 1 ? "pessoa" : "pessoas"} sem telefone cadastrado`,
            consequencia: `a igreja alcança ${pct}% de quem está ativo`,
          });
        }

        if (casados > 0) {
          achadas.push({
            chave: "casado-sem-data",
            quantidade: casados,
            texto: n => `${n} ${n === 1 ? "pessoa casada" : "pessoas casadas"} sem data de casamento`,
            consequencia: "não aparecem nas bodas do mês",
          });
        }
        if (membrosSemEntrada > 0) {
          achadas.push({
            chave: "membro-sem-entrada",
            quantidade: membrosSemEntrada,
            texto: n => `${n} ${n === 1 ? "membro" : "membros"} sem data de entrada`,
            consequencia: "ficam de fora do tempo de casa",
          });
        }
        setPendencias(achadas);
      } catch {
        // Consulta opcional: se falhar, o bloco some em vez de quebrar o painel.
        if (!cancelado) setPendencias([]);
      }
    })();

    return () => { cancelado = true; };
  }, []);

  // Bloco vazio nao existe: sem pendencia, a faixa se esconde.
  useReportarVazio(pendencias !== null && pendencias.length === 0);

  if (pendencias === null) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-5 text-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Conferindo cadastros...
        </CardContent>
      </Card>
    );
  }

  if (pendencias.length === 0) return null;

  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <ul className="space-y-1.5">
          {pendencias.map(p => (
            <li key={p.chave} className="text-sm">
              {/* A linha de alcance leva a cor de alerta: das tres, e a unica
                  que impede QUALQUER cuidado de chegar. As outras impedem um
                  recurso especifico. */}
              <span className={p.destaque ? "font-medium text-warning" : "font-medium"}>
                {p.texto(p.quantidade)}
              </span>
              <span className="text-muted-foreground"> — {p.consequencia}</span>
            </li>
          ))}
        </ul>
        {/* Um caminho so, para a lista onde se corrige. A tela de Pessoas ja
            tem busca e filtros; nao vale inventar uma tela nova para isto. */}
        <Link
          to="/membros"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline min-h-[44px]"
        >
          Abrir Pessoas para corrigir <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
