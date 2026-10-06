// ─── BarraDeContexto.tsx — voltar + trilha, no topo de TODA tela interna ───────
//
// O objetivo dela (03/10/2026): saber sempre 1) onde está, 2) de onde veio, 3) como
// voltar, 4) que módulo está usando — sem precisar do menu lateral para se localizar.
//
//   ← Voltar · Painel da Tesouraria
//   Home › 🏦 Financeiro › Fechamento › Central de Documentos
//
// · "Voltar" respeita o histórico (e diz para onde vai). Sem histórico válido (link
//   colado, primeira tela da aba), vira "← Voltar para Financeiro": a tela-pai, ou o
//   módulo, ou a Home — nunca sai do sistema.
// · No celular a trilha longa se encurta: "Home › Financeiro › … › Tela atual"; o "…"
//   abre o caminho inteiro.
// · Aparece sozinha, vinda do registro de `lib/navegacao.ts`: tela nova = uma linha lá.

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft, ChevronRight, ClipboardCheck, GraduationCap, Gavel, HeartHandshake, Home, Landmark,
  Settings, Sparkles, Users, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavegacao } from "@/hooks/useNavegacao";
import { montarContexto, tituloDaTela, type ModuloKey } from "@/lib/navegacao";

const ICONE_DO_MODULO: Record<ModuloKey, LucideIcon> = {
  financeiro: Landmark, pessoas: Users, diaconia: HeartHandshake, discipulado: GraduationCap,
  pastoral: Sparkles, secretaria: ClipboardCheck, lideranca: Gavel, sistema: Settings,
};

export function BarraDeContexto() {
  const location = useLocation();
  const { anterior, rotulo, voltar, voltarPersonalizado } = useNavegacao();
  const [expandido, setExpandido] = useState(false);

  const ctx = montarContexto(location.pathname, rotulo);
  if (!ctx) return null; // Home, 404 e telas fora do registro

  const { migalhas, fallback } = ctx;
  const nomeDaAnterior = anterior ? tituloDaTela(anterior.split(/[?#]/)[0]) : null;
  const encurtavel = migalhas.length > 3;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 pt-3 print:hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 shrink-0 max-w-full"
          onClick={() => (voltarPersonalizado ? voltarPersonalizado.acao() : voltar(fallback.to))}
          title={voltarPersonalizado ? voltarPersonalizado.rotulo : anterior ? `Voltar${nomeDaAnterior ? ` para ${nomeDaAnterior}` : ""}` : `Voltar para ${fallback.rotulo}`}>
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {voltarPersonalizado ? (
            <span className="truncate">{voltarPersonalizado.rotulo}</span>
          ) : anterior ? (
            <>
              <span>Voltar</span>
              {nomeDaAnterior && (
                <span className="hidden sm:inline text-muted-foreground font-normal truncate max-w-[14rem]">· {nomeDaAnterior}</span>
              )}
            </>
          ) : (
            <span className="truncate">Voltar para {fallback.rotulo}</span>
          )}
        </Button>

        <nav aria-label="Trilha de navegação" className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <ol className="flex items-center flex-wrap gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
            {migalhas.map((m, i) => {
              const ultima = i === migalhas.length - 1;
              const meio = encurtavel && i >= 2 && !ultima; // some no celular enquanto fechada
              const Icone = i === 0 ? Home : m.modulo ? ICONE_DO_MODULO[m.modulo] : null;
              const conteudo = (
                <>
                  {Icone && <Icone className="w-3.5 h-3.5 shrink-0" aria-hidden />}
                  <span className={m.atual ? "truncate" : "truncate max-w-[10rem] sm:max-w-[14rem]"}>{m.rotulo}</span>
                </>
              );
              return (
                <li key={`${i}-${m.rotulo}`} className={`items-center gap-1 min-w-0 ${meio && !expandido ? "hidden sm:flex" : "flex"}`}>
                  {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 opacity-60" aria-hidden />}
                  {/* o "…" que abre o caminho inteiro: só no celular, logo antes da tela atual */}
                  {encurtavel && ultima && !expandido && (
                    <>
                      <button type="button" onClick={() => setExpandido(true)} aria-label="Mostrar o caminho completo"
                        className="sm:hidden px-1 rounded hover:bg-muted hover:text-foreground">…</button>
                      <ChevronRight className="w-3 h-3 shrink-0 opacity-60 sm:hidden" aria-hidden />
                    </>
                  )}
                  {m.to && !m.atual ? (
                    <Link to={m.to} className="flex items-center gap-1 min-w-0 rounded px-0.5 hover:text-foreground hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {conteudo}
                    </Link>
                  ) : (
                    <span aria-current={m.atual ? "page" : undefined}
                      className={`flex items-center gap-1 min-w-0 ${m.atual ? "text-foreground font-medium" : ""}`}>
                      {conteudo}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}
