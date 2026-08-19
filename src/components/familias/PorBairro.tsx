// ─── PorBairro.tsx ─────────────────────────────────────────────────────────
//
// Onde a igreja mora, e onde ela poderia ter um pequeno grupo.
//
// Esta é a parte da inteligência territorial que NÃO precisa de mapa: o campo
// `bairro` já existe e já está preenchido em 83 pessoas. Um agrupamento
// responde hoje três das perguntas que a liderança faz — onde estão, qual
// região concentra, e qual região tem gente sem grupo — sem uma coordenada,
// sem biblioteca de mapa e sem geocodificar nada.
//
// O sinal que vale a tela é a última coluna. Um bairro com muita gente que
// SERVE e ninguém em pequeno grupo é o candidato mais forte que existe: são
// pessoas já comprometidas, que já se deslocam para a igreja, morando perto
// umas das outras.
//
// O que esta tela deliberadamente NÃO faz: esconder o tamanho do buraco. As
// pessoas sem bairro aparecem em primeiro lugar, com o número inteiro. Sem
// isso, "Praça da Bandeira concentra a igreja" viraria uma conclusão sobre
// onde alguém preencheu o cadastro.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Sprout, ChevronRight, TriangleAlert } from "lucide-react";

interface LinhaBairro {
  bairro: string;
  pessoas: number;
  emPgm: number;
  servem: number;
}

/** Um bairro vira candidato quando tem gente servindo e ninguém em grupo. */
const MIN_PESSOAS_CANDIDATO = 4;

function ehCandidato(l: LinhaBairro): boolean {
  return l.pessoas >= MIN_PESSOAS_CANDIDATO && l.emPgm === 0 && l.servem > 0;
}

export function PorBairro() {
  const [linhas, setLinhas] = useState<LinhaBairro[] | null>(null);
  const [semBairro, setSemBairro] = useState(0);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      // Três leituras simples em vez de um join: a lista de pessoas ativas é
      // de 281 linhas, e cruzar em memória custa menos do que manter uma view
      // nova só para esta tela.
      const [pessoas, pgm, voluntarios] = await Promise.all([
        supabase.from("membros").select("id, bairro").eq("status", "ativo"),
        supabase.from("pgm_membros").select("pessoa_id"),
        supabase.from("area_voluntarios").select("membro_id").eq("status", "ativa"),
      ]);

      if (cancelado) return;
      if (pessoas.error) { setErro(true); return; }

      const idsPgm = new Set((pgm.data ?? []).map(p => p.pessoa_id));
      const idsServem = new Set((voluntarios.data ?? []).map(v => v.membro_id));

      const mapa = new Map<string, LinhaBairro>();
      let sem = 0;

      for (const p of pessoas.data ?? []) {
        const bairro = (p.bairro ?? "").trim();
        if (!bairro) { sem++; continue; }

        const atual = mapa.get(bairro) ?? { bairro, pessoas: 0, emPgm: 0, servem: 0 };
        atual.pessoas += 1;
        if (idsPgm.has(p.id)) atual.emPgm += 1;
        if (idsServem.has(p.id)) atual.servem += 1;
        mapa.set(bairro, atual);
      }

      setSemBairro(sem);
      setLinhas([...mapa.values()].sort((a, b) => b.pessoas - a.pessoas));
    })();

    return () => { cancelado = true; };
  }, []);

  if (erro) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Não foi possível carregar os bairros.
        </CardContent>
      </Card>
    );
  }

  if (linhas === null) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Agrupando por bairro...
        </CardContent>
      </Card>
    );
  }

  const maior = Math.max(...linhas.map(l => l.pessoas), 1);
  const candidatos = linhas.filter(ehCandidato);
  const totalComBairro = linhas.reduce((s, l) => s + l.pessoas, 0);

  return (
    <div className="space-y-4">

      {/* O candidato vem antes da tabela: é a única linha desta tela que pede
          uma ação, e não apenas informa. */}
      {candidatos.length > 0 && (
        <Card className="border-l-4 border-l-success">
          <CardContent className="py-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Sprout className="w-4 h-4 text-success shrink-0" />
              {candidatos.length === 1
                ? "Um bairro com potencial para pequeno grupo"
                : `${candidatos.length} bairros com potencial para pequeno grupo`}
            </p>
            <ul className="space-y-1.5">
              {candidatos.map(c => (
                <li key={c.bairro} className="text-sm text-muted-foreground">
                  <b className="text-foreground">{c.bairro}</b> — {c.pessoas} pessoas,{" "}
                  <b className="text-foreground">{c.servem} já servem</b> em algum ministério,
                  e nenhuma em pequeno grupo.
                </li>
              ))}
            </ul>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs -ml-2">
              <Link to="/pgm">Abrir Pequenos Grupos <ChevronRight className="w-3.5 h-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabela de bairros. Barra proporcional ao maior, para a diferença de
          concentração aparecer sem precisar comparar números. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-medium py-2 pr-3">Bairro</th>
              <th className="text-left font-medium py-2 pr-3 w-1/3 hidden sm:table-cell"></th>
              <th className="text-right font-medium py-2 px-3 tabular-nums">Pessoas</th>
              <th className="text-right font-medium py-2 px-3 tabular-nums">Servem</th>
              <th className="text-right font-medium py-2 pl-3 tabular-nums">Em PGM</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.bairro} className="border-t">
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{l.bairro}</span>
                  </span>
                </td>
                <td className="py-2 pr-3 hidden sm:table-cell">
                  <span className="block h-2 rounded-sm bg-muted overflow-hidden">
                    <i
                      className={`block h-full ${ehCandidato(l) ? "bg-success" : "bg-primary/50"}`}
                      style={{ width: `${(l.pessoas / maior) * 100}%` }}
                    />
                  </span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{l.pessoas}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{l.servem}</td>
                <td className={`py-2 pl-3 text-right tabular-nums ${l.emPgm === 0 ? "text-muted-foreground" : ""}`}>
                  {l.emPgm}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* O tamanho do buraco, dito por extenso. */}
      {semBairro > 0 && (
        <Card className="border-l-4 border-l-warning">
          <CardContent className="py-4">
            <p className="text-sm flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 text-warning-text shrink-0 mt-0.5" />
              <span>
                <b>{semBairro} pessoas não têm bairro cadastrado</b>, contra{" "}
                {totalComBairro} que têm. A concentração acima descreve onde alguém
                preencheu o endereço — ainda não onde a igreja mora.
              </span>
            </p>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs -ml-2 mt-1">
              <Link to="/membros">Abrir Pessoas para completar <ChevronRight className="w-3.5 h-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PorBairro;
