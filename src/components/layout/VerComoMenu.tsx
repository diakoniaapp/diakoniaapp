// ─── O controle do "Ver como", e a faixa que ele acende ───────────────────
//
// Duas peças que andam juntas: o submenu que entra na simulação, dentro do
// menu do usuário, e a faixa fixa que fica no alto da tela enquanto ela dura.
//
// A faixa não é enfeite. Este modo troca o que o aplicativo oferece sem trocar
// o que a conta é — e alguém que esqueça disso pode concluir que a secretaria
// não vê a agenda quando na verdade quem está olhando é uma administradora
// fantasiada. A faixa diz as duas coisas em uma linha e traz a saída.

import {
  DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useVerComo, PAPEIS_SIMULAVEIS, ROTULO_PAPEL, DESCRICAO_PAPEL,
} from "@/hooks/useVerComo";

/**
 * O item de menu.
 *
 * Aparece só para quem é administrador DE VERDADE — `rolesReais`, e não
 * `roles`. Com `roles`, a administradora que entrasse simulando "voluntário"
 * perderia o próprio botão de sair no instante seguinte e ficaria presa no
 * modo, sem caminho de volta que não fosse fechar a aba.
 */
export function VerComoMenu() {
  const { rolesReais } = useAuth();
  const { papel, simulando, entrar, sair } = useVerComo();

  if (!rolesReais.includes("admin")) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs uppercase tracking-widest text-muted-foreground/60 py-1">
        Ver como
      </DropdownMenuLabel>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2 py-2.5">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <span>{simulando ? `Vendo como ${ROTULO_PAPEL[papel!] ?? papel}` : "Ver como outro perfil"}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-72">
            {PAPEIS_SIMULAVEIS.map(p => (
              <DropdownMenuItem key={p} className="cursor-pointer py-2 flex-col items-start gap-0.5"
                onClick={() => entrar(p)}>
                <span className="text-sm font-medium">
                  {ROTULO_PAPEL[p] ?? p}
                  {papel === p && <span className="ml-1.5 text-xs text-gold">· agora</span>}
                </span>
                <span className="text-xs text-muted-foreground leading-snug whitespace-normal">
                  {DESCRICAO_PAPEL[p]}
                </span>
              </DropdownMenuItem>
            ))}
            {simulando && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer py-2 gap-2" onClick={sair}>
                  <EyeOff className="w-4 h-4" />
                  <span>Voltar a ver como eu</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </>
  );
}

/**
 * A faixa que fica no alto enquanto a simulação dura.
 *
 * Diz o papel, diz o limite e oferece a saída — nessa ordem, porque é a ordem
 * em que as três coisas são procuradas.
 *
 * O limite ("o banco continua respondendo pela sua conta") aparece por
 * extenso, e não como ícone de ajuda. Ele é a única coisa aqui que, ignorada,
 * leva alguém a uma conclusão errada sobre o próprio sistema.
 */
export function FaixaVerComo() {
  const { papel, simulando, sair } = useVerComo();
  if (!simulando) return null;

  return (
    <div className="sticky top-0 z-50 bg-gold text-white">
      <div className="px-3 py-1.5 flex items-center gap-2 text-xs">
        <Eye className="w-3.5 h-3.5 shrink-0" />
        <p className="min-w-0 flex-1 leading-snug">
          <strong>Vendo como {ROTULO_PAPEL[papel!] ?? papel}.</strong>{" "}
          <span className="opacity-90">
            É a interface deste perfil — o banco continua respondendo pela sua conta.
          </span>
        </p>
        <button type="button" onClick={sair}
          className="shrink-0 rounded px-2 py-1 font-medium underline underline-offset-2 hover:bg-white/15 transition-colors">
          Sair
        </button>
      </div>
    </div>
  );
}
