// ─── AbasDeCadastros — Favorecidos · Contas e categorias · Centros de custo · Recorrências · Projetos · Contratados: uma área só ──────────────────────────────
// Fase E (20/10/2026). Cada cadastro tinha uma página E uma gaveta sobre o Painel da Tesouraria (a gaveta era cópia da página dentro de um Sheet). As gavetas saíram; a página de cada
// cadastro é a única casa dele, e esta barra liga uma à outra para que "Cadastros" seja um lugar, não seis. Cada aba mantém o endereço que já tinha (favoritos e links continuam valendo).
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Building2, DollarSign, FolderKanban, Layers, RotateCw } from "lucide-react";

export type CadastroAtivo = "favorecidos" | "contas" | "centros" | "recorrencias" | "projetos" | "contratados";

export const CADASTROS: { chave: CadastroAtivo; rotulo: string; to: string; icone: typeof Layers }[] = [
  { chave: "favorecidos", rotulo: "Favorecidos", to: "/financas/favorecidos", icone: Building2 },
  { chave: "contas", rotulo: "Contas e categorias", to: "/financas/admin", icone: DollarSign },
  { chave: "centros", rotulo: "Centros de custo", to: "/financas/centros", icone: Layers },
  { chave: "recorrencias", rotulo: "Recorrências", to: "/financas/recorrencias", icone: RotateCw },
  { chave: "projetos", rotulo: "Projetos", to: "/financas/projetos", icone: FolderKanban },
  // as calculadoras de folha moram na mesma página (aba "Contratados" é a que abre)
  { chave: "contratados", rotulo: "Contratados", to: "/financas/folha?aba=contratados", icone: Briefcase },
];

export function AbasDeCadastros({ ativa }: { ativa: CadastroAtivo }) {
  // no celular a barra rola de lado: traz a aba atual para o meio, para a pessoa saber onde está
  const barra = useRef<HTMLElement>(null);
  useEffect(() => { barra.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView?.({ inline: "center", block: "nearest" }); }, [ativa]);
  return (
    <nav ref={barra} aria-label="Cadastros do Financeiro" className="-mb-px flex gap-0.5 overflow-x-auto border-b sm:gap-1 print:hidden">
      {CADASTROS.map(c => {
        const atual = c.chave === ativa;
        const Icone = c.icone;
        return (
          <Link key={c.chave} to={c.to} aria-current={atual ? "page" : undefined} data-cadastro={c.chave}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 py-1.5 text-[13px] sm:px-3 sm:text-sm ${atual ? "border-gold font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icone className="hidden h-3.5 w-3.5 sm:block" /> {c.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
