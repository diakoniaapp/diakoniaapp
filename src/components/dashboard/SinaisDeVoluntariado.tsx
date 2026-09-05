// ─── SinaisDeVoluntariado.tsx ────────────────────────────────────────────────
// Quem está servindo demais, quem parou de servir, quem volta em breve.
//
// Sprint 5. Fecha o ciclo da iniciativa: as Sprints 2 a 4 coletaram
// disponibilidade e criaram escalas; esta transforma o que se acumulou em
// perguntas pastorais na tela que a igreja abre todo dia.
//
// ── A REGRA QUE MANDA AQUI ───────────────────────────────────────────────────
//
// Sobrecarga e recusa são sinais sobre PESSOAS, não sobre produtividade. Se
// aparecerem como ranking, a ferramenta muda de lado: vira controle de
// desempenho de gente que serve de graça, no domingo, por amor.
//
// Então nada de número em destaque, nada de ordenação por "quem produz mais",
// nada de comparação entre pessoas. Cada linha é um nome e uma frase que
// sugere uma conversa — do mesmo jeito que a ficha diz "último contato há 78
// dias". Um convite a procurar alguém, não uma nota.
//
// E o widget some inteiro quando não há sinal nenhum. Um bloco permanente
// dizendo "está tudo bem" ocupa espaço todo dia para não informar nada.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { HeartHandshake, TrendingUp, PauseCircle, MessageCircleOff } from "lucide-react";
import { hojeMaisDias } from "@/lib/data";

type Tipo = "sobrecarga" | "sumido" | "recusou" | "volta";

interface Sinal {
  tipo: Tipo;
  pessoa_id: string;
  nome: string;
  frase: string;
}

const APARENCIA: Record<Tipo, { Icone: typeof TrendingUp; cor: string }> = {
  // Carga alta é âmbar, não vermelho: a pessoa não fez nada errado — ela
  // aceitou. O vermelho aqui acusaria quem está ajudando.
  sobrecarga: { Icone: TrendingUp,        cor: "text-warning-text" },
  sumido:     { Icone: HeartHandshake,    cor: "text-info-text" },
  recusou:    { Icone: MessageCircleOff,  cor: "text-muted-foreground" },
  volta:      { Icone: PauseCircle,       cor: "text-success-text" },
};

const DIA = 86_400_000;

export function SinaisDeVoluntariado() {
  const [sinais, setSinais] = useState<Sinal[] | null>(null);

  useEffect(() => {
    (async () => {
      const emQuinzeDias = hojeMaisDias(15);

      const [{ data: perfis }, { data: vinculos }, { data: recusas }] = await Promise.all([
        supabase.from("perfil_servico")
          .select("pessoa_id, nivel_sobrecarga, em_descanso, descanso_ate"),
        supabase.from("area_voluntarios")
          .select("membro_id, ultima_escala_em, total_escalas")
          .eq("status", "ativa"),
        supabase.from("escala_voluntarios")
          .select("pessoa_id, status")
          .eq("status", "recusado"),
      ]);

      const ids = new Set<string>();
      (perfis ?? []).forEach((p: any) => ids.add(p.pessoa_id));
      (vinculos ?? []).forEach((v: any) => ids.add(v.membro_id));
      (recusas ?? []).forEach((r: any) => ids.add(r.pessoa_id));
      if (ids.size === 0) { setSinais([]); return; }

      const { data: pessoas } = await supabase
        .from("membros").select("id, nome_completo").in("id", [...ids]);
      const nomeDe = new Map((pessoas ?? []).map((p: any) => [p.id, p.nome_completo]));

      const achados: Sinal[] = [];
      const jaCitado = new Set<string>();

      // 1. Servindo demais. Primeiro na lista de propósito: é o sinal que a
      //    pessoa nunca dá sozinha — ninguém pede descanso a tempo.
      for (const p of (perfis ?? []) as any[]) {
        if ((p.nivel_sobrecarga ?? 0) < 7 || p.em_descanso) continue;
        const nome = nomeDe.get(p.pessoa_id);
        if (!nome || jaCitado.has(p.pessoa_id)) continue;
        jaCitado.add(p.pessoa_id);
        achados.push({ tipo: "sobrecarga", pessoa_id: p.pessoa_id, nome,
          frase: "está servindo acima do que combinou" });
      }

      // 2. Descanso terminando. Para receber de volta, não para escalar no dia.
      for (const p of (perfis ?? []) as any[]) {
        if (!p.em_descanso || !p.descanso_ate) continue;
        if (p.descanso_ate > emQuinzeDias) continue;
        const nome = nomeDe.get(p.pessoa_id);
        if (!nome || jaCitado.has(p.pessoa_id)) continue;
        jaCitado.add(p.pessoa_id);
        const d = new Date(p.descanso_ate + "T12:00:00");
        achados.push({ tipo: "volta", pessoa_id: p.pessoa_id, nome,
          frase: `volta do descanso em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}` });
      }

      // 3. Recusou três vezes. Recusa repetida quase nunca é falta de vontade.
      const contaRecusa = new Map<string, number>();
      (recusas ?? []).forEach((r: any) =>
        contaRecusa.set(r.pessoa_id, (contaRecusa.get(r.pessoa_id) ?? 0) + 1));
      for (const [pid, n] of contaRecusa) {
        if (n < 3) continue;
        const nome = nomeDe.get(pid);
        if (!nome || jaCitado.has(pid)) continue;
        jaCitado.add(pid);
        achados.push({ tipo: "recusou", pessoa_id: pid, nome,
          frase: `recusou ${n} escalas seguidas` });
      }

      // 4. Sumiu do serviço. Só de quem JÁ SERVIU: quem nunca serviu não
      //    sumiu — nunca foi chamado, e isso é outra conversa.
      const ultimaPorPessoa = new Map<string, string>();
      for (const v of (vinculos ?? []) as any[]) {
        if (!v.ultima_escala_em || (v.total_escalas ?? 0) === 0) continue;
        const atual = ultimaPorPessoa.get(v.membro_id);
        if (!atual || v.ultima_escala_em > atual) ultimaPorPessoa.set(v.membro_id, v.ultima_escala_em);
      }
      for (const [pid, ultima] of ultimaPorPessoa) {
        const dias = Math.floor((Date.now() - new Date(ultima + "T12:00:00").getTime()) / DIA);
        if (dias < 90) continue;
        const nome = nomeDe.get(pid);
        if (!nome || jaCitado.has(pid)) continue;
        jaCitado.add(pid);
        achados.push({ tipo: "sumido", pessoa_id: pid, nome,
          frase: `não serve há ${dias} dias` });
      }

      setSinais(achados);
    })();
  }, []);

  if (sinais === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        <span className="sr-only">Carregando…</span>
        <Skeleton className="h-4 w-3/5" /><Skeleton className="h-4 w-2/5" />
      </div>
    );
  }

  // Silêncio quando não há o que dizer. Ver o comentário do topo.
  if (sinais.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {sinais.slice(0, 6).map(s => {
        const { Icone, cor } = APARENCIA[s.tipo];
        return (
          <li key={s.tipo + s.pessoa_id} className="flex items-start gap-2 text-sm">
            <Icone className={`w-3.5 h-3.5 mt-[3px] shrink-0 ${cor}`} aria-hidden="true" />
            <span className="min-w-0">
              <strong className="font-medium">{s.nome}</strong>{" "}
              <span className="text-muted-foreground">{s.frase}</span>
            </span>
          </li>
        );
      })}
      {sinais.length > 6 && (
        <li className="text-xs text-muted-foreground pl-5">
          e mais {sinais.length - 6} — veja em{" "}
          <Link to="/ministerios" className="underline">Ministérios</Link>
        </li>
      )}
    </ul>
  );
}
