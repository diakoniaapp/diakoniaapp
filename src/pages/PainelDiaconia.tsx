// ─── PainelDiaconia.tsx — a bancada da Diaconia e Ação Social ──────────────
//
// ── POR QUE ESTE PAINEL EXISTE ───────────────────────────────────────────
//
// 09/09/2026. A Diaconia e Ação Social tinha módulo pronto — cadastro,
// ficha socioeconômica, chamada de confirmação, "quem parou de vir" — mas
// nenhuma bancada própria. Só se chegava lá abrindo o painel genérico de
// ministério (`/ministerios/:id/painel`), junto de áreas, equipe, escalas e
// checklist que não são o que a Diaconia precisa ver primeiro. Pastoral,
// Secretaria e Tesouraria já tinham essa porta direta; a Diaconia não.
//
// Achado revendo o próprio "Diakonia Care" do Painel Pastoral: aquela seção
// tinha uma aba de Diaconia emprestando o nome de um ministério que não era
// o dela — acolhimento de visitante e candidatos à membresia são cuidado
// PASTORAL, e o cuidado da Diaconia é de outra natureza (socioeconômico).
// A aba saiu de lá — ver o comentário em `PainelPastoral.tsx` — e ganhou
// este painel, no padrão dos outros três.
//
// ── O QUE NÃO ENTROU AQUI ─────────────────────────────────────────────────
//
// Áreas, equipe, escalas e checklist de voluntários da Diaconia continuam
// só no painel genérico do ministério — não são o assunto de quem cuida de
// pessoas assistidas, são o assunto de quem organiza a equipe que cuida
// delas. Duplicar aqui faria duas telas discordarem no dia em que uma
// mudasse. Quem precisar disso encontra pelo grupo "Pessoas → Ministérios".
//
// ── O CORPO É `SecaoDiaconia`, NÃO RECONSTRUÍDO ──────────────────────────
//
// Esse componente já existia — nasceu em 04/09/2026 dentro do painel
// genérico de ministério — e já faz exatamente o que esta bancada precisa:
// áreas com link para chamada e pessoas, "quem parou de vir", e o que a
// ficha diz (cobertura, distribuição por vulnerabilidade, per capita).
// Este arquivo só dá a ele um endereço próprio, com cabeçalho e frase-
// resumo no mesmo molde do Painel Pastoral/Secretaria/Tesouraria.

import { useCallback, useEffect, useState } from "react";
import { HeartHandshake, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarAtualizadoHa } from "@/components/painel/blocos";
import { SecaoDiaconia } from "@/components/painel/SecaoDiaconia";
import {
  resumoDiaconiaPastoral, carregarBancadaDiaconia,
  type ResumoDiaconiaPastoral, type BancadaDiaconia,
} from "@/services/diaconiaService";

export default function PainelDiaconia() {
  const [resumo, setResumo] = useState<ResumoDiaconiaPastoral | null>(null);
  const [dc, setDc] = useState<BancadaDiaconia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  /** Quando os números da tela foram lidos — o "· há 3 minutos" do resumo. */
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await resumoDiaconiaPastoral();
      setResumo(r);
      setDc(r ? await carregarBancadaDiaconia(r.ministerioId) : null);
      setAtualizadoEm(new Date());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="p-6 space-y-4 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
      {/* Mesmo cabeçalho fixo dos outros três painéis — título, data, frase-
          resumo em linguagem natural, "atualizado há" na mesma linha. */}
      <div className="sticky top-0 z-20 bg-background -mx-6 px-6 -mt-6 pt-6 pb-3 space-y-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl flex items-center gap-2">
              <HeartHandshake className="w-6 h-6 text-gold shrink-0" />
              Painel da Diaconia
            </h1>
            <p className="text-sm text-muted-foreground first-letter:uppercase">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>
          <Button
            type="button" variant="ghost" size="sm"
            onClick={carregar} disabled={carregando}
            className="gap-1.5 text-xs shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {resumo && (
          <p className="text-sm text-muted-foreground flex items-start gap-1.5">
            <HeartHandshake className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
            <span className="min-w-0">
              {resumoNatural(resumo, dc)}
              {atualizadoEm && (
                <span className="text-[10px] text-muted-foreground ml-1.5 whitespace-nowrap">
                  · {formatarAtualizadoHa(atualizadoEm)}
                </span>
              )}
            </span>
          </p>
        )}
      </div>

      {erro && (
        <p className="text-sm text-destructive-text py-2 px-3 border border-destructive-line rounded-md bg-destructive-soft">
          {erro}
        </p>
      )}

      {!carregando && !resumo && !erro && (
        <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
          Sem ministério de Diaconia cadastrado, ou ninguém vinculado ainda.
        </p>
      )}

      {resumo && dc && <SecaoDiaconia dc={dc} ministerioId={resumo.ministerioId} />}
    </div>
  );
}

/** Resumo do dia em uma frase — mesmo molde do Painel Pastoral/Secretaria. */
function resumoNatural(r: ResumoDiaconiaPastoral, dc: BancadaDiaconia | null): string {
  const partes: string[] = [];
  if (dc && dc.totalPessoas > 0) {
    partes.push(`${dc.totalPessoas} ${dc.totalPessoas === 1 ? "pessoa assistida" : "pessoas assistidas"}`);
  }
  const atencao: string[] = [];
  if (r.pendencias.length > 0) {
    atencao.push(`${r.pendencias.length} ${r.pendencias.length === 1 ? "pessoa parou de vir" : "pessoas pararam de vir"}`);
  }
  if (r.indicadores.semFicha > 0) {
    atencao.push(`${r.indicadores.semFicha} ${r.indicadores.semFicha === 1 ? "pessoa" : "pessoas"} sem ficha`);
  }

  const frase: string[] = [];
  if (partes.length > 0) frase.push(`${partes.join(", ")}.`);
  if (atencao.length > 0) frase.push(`Atenção: ${atencao.join(", ")}.`);

  if (frase.length === 0) return "Ninguém cadastrado ainda.";
  return frase.join(" ");
}
