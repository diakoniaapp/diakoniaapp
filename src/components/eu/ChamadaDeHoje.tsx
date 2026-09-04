// ─── ChamadaDeHoje.tsx — o cartão que leva a professora direto pra chamada ──
//
// Pedido dela: "imagine uma professora acessando o sistema no domingo para
// fazer a chamada da classe... torne intuitivo". O resolvedor que já existia
// (`hoje/tarefaPrincipal.ts`, `chamadaEbd`) só chegava até a aba adaptativa
// da barra inferior do celular — discreto, e só lá. Isto é o pedido: destaque,
// na tela que ela vê primeiro ao entrar.
//
// **Só aparece aos domingos.** Um cartão parecido — "Sua tarefa" — existiu na
// Home antiga e foi tirado de propósito (ver o comentário em Dashboard.tsx):
// aparecia TODO dia, tivesse ou não algo a fazer ("Lançamento financeiro"
// sempre lá), e um bloco que diz a mesma coisa todo dia não informa nada.
// Este cartão não repete o erro — de segunda a sábado ele nem consulta o
// banco, e a seção some sozinha (ver `Secao.tsx`/`vazio.ts`).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useReportarVazio } from "@/components/hoje/vazio";

interface ClasseDoProfessor { id: string; nome: string }

export function ChamadaDeHoje({ pessoaId }: { pessoaId: string }) {
  const [classe, setClasse] = useState<ClasseDoProfessor | null | undefined>(undefined);

  useEffect(() => {
    // domingo = 0. Fora disso, nem pergunta ao banco — é a diferença entre
    // "sinal" e o ruído que fez o cartão antigo ser tirado da Home.
    if (new Date().getDay() !== 0) { setClasse(null); return; }
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("ebd_professores")
        .select("classe_id")
        .eq("pessoa_id", pessoaId)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      if (cancelado) return;
      if (!data?.classe_id) { setClasse(null); return; }

      const { data: c } = await supabase
        .from("ebd_classes")
        .select("nome")
        .eq("id", data.classe_id)
        .maybeSingle();
      if (cancelado) return;
      setClasse({ id: data.classe_id, nome: c?.nome ?? "sua classe" });
    })();
    return () => { cancelado = true; };
  }, [pessoaId]);

  // `undefined` (ainda carregando) também conta como vazio: a seção nasce
  // escondida e aparece já com conteúdo, em vez de piscar vazia.
  useReportarVazio(!classe);
  if (!classe) return null;

  return (
    <Card className="border-gold/40 bg-gradient-verse">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center shrink-0">
          <GraduationCap className="w-5 h-5 text-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{classe.nome}</p>
          <p className="text-xs text-muted-foreground">Registrar presença de hoje</p>
        </div>
        <Button asChild size="sm" className="shrink-0 bg-gold hover:bg-gold/90 text-white border-0">
          <Link to={`/ebd/${classe.id}/chamada`}>Fazer chamada</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
