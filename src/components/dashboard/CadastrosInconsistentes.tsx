// ─── CadastrosInconsistentes.tsx ─────────────────────────────────────────────
// Cadastros que se contradizem: o registro afirma uma coisa e deixa em branco
// o campo que a sustenta.
//
// QUAIS pendências existem, e POR QUE só contradição e não "campo vazio",
// mora em `lib/pendenciasCadastro.ts` — junto do recorte que a tela de Pessoas
// usa para listar as mesmas pessoas. Este arquivo só conta e desenha.
//
// ── DE QUEM É ESTA TAREFA ──────────────────────────────────────────────────
//
// Da secretaria. Isso está dito no registro de widgets, em `permissoes`, e até
// 26/08/2026 estava dito errado: a lista trazia `ver_pessoas`, que pertence a
// seis papéis — inclusive `voluntario`. Como o teste do registro é `.some()`,
// bastava um: o aviso aparecia para todo mundo com acesso ao catálogo, e um
// voluntário via um cartão anunciando que 64 pessoas da igreja estavam sem
// telefone.
//
// Tarefa endereçada a todos não é de ninguém — é a razão pela qual esta lista
// não andava.
//
// ── CADA LINHA LEVA À SUA PRÓPRIA LISTA ────────────────────────────────────
//
// Antes havia um link só, para `/membros` sem filtro nenhum. Quem clicava em
// "64 pessoas sem telefone" caía numa lista de 295 e tinha de descobrir
// sozinho quais eram as 64. O aviso era uma cobrança sem instrumento.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronRight } from "lucide-react";
import { useReportarVazio } from "@/components/hoje/vazio";
import { PENDENCIAS_CADASTRO, type PendenciaCadastro } from "@/lib/pendenciasCadastro";

interface Achada {
  def: PendenciaCadastro;
  quantidade: number;
  /** Só a de alcance usa: quantos por cento da igreja sobram alcançáveis. */
  detalhe?: string;
}

export function CadastrosInconsistentes() {
  const [achadas, setAchadas] = useState<Achada[] | null>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const base = () =>
        supabase.from("membros").select("id", { count: "exact", head: true });

      try {
        const [ativosRes, ...contagens] = await Promise.all([
          base().eq("status", "ativo"),
          ...PENDENCIAS_CADASTRO.map(p => p.filtrarConsulta(base())),
        ]);
        if (cancelado) return;

        const ativos = (ativosRes as { count: number | null }).count ?? 0;

        const lista: Achada[] = [];
        PENDENCIAS_CADASTRO.forEach((def, i) => {
          const quantidade = (contagens[i] as { count: number | null }).count ?? 0;
          if (quantidade === 0) return;
          // O alcance ganha um número que os outros não têm: o que importa
          // não é quantas faltam, é quanto da igreja continua alcançável.
          const detalhe =
            def.chave === "sem-telefone" && ativos > 0
              ? `a igreja alcança ${Math.round(((ativos - quantidade) / ativos) * 100)}% de quem está ativo`
              : undefined;
          lista.push({ def, quantidade, detalhe });
        });

        // Destaque primeiro: das três, é a única que impede QUALQUER cuidado
        // de chegar. As outras impedem um recurso específico.
        lista.sort((a, b) => Number(!!b.def.destaque) - Number(!!a.def.destaque));
        setAchadas(lista);
      } catch {
        // Consulta opcional: se falhar, o bloco some em vez de quebrar o painel.
        if (!cancelado) setAchadas([]);
      }
    })();

    return () => { cancelado = true; };
  }, []);

  // Bloco vazio nao existe: sem pendencia, a faixa se esconde.
  useReportarVazio(achadas !== null && achadas.length === 0);

  if (achadas === null) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-5 text-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Conferindo cadastros...
        </CardContent>
      </Card>
    );
  }

  if (achadas.length === 0) return null;

  return (
    <Card>
      <CardContent className="py-2">
        <ul className="divide-y -my-1">
          {achadas.map(({ def, quantidade, detalhe }) => (
            <li key={def.chave}>
              {/* A linha inteira é o link, e não um "abrir Pessoas" no rodapé:
                  o que se quer ao ler "64 sem telefone" é ver quem são as 64,
                  e o alvo do dedo passa a ser a frase toda. `min-h-11` é o
                  mínimo tocável do projeto. */}
              <Link
                to={`/membros?pendencia=${def.chave}`}
                className="flex items-center gap-2 py-2 min-h-11 group"
              >
                <span className="text-sm min-w-0 flex-1">
                  <span className={def.destaque ? "font-medium text-warning-text" : "font-medium"}>
                    {def.texto(quantidade)}
                  </span>
                  <span className="text-muted-foreground"> — {detalhe ?? def.consequencia}</span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
