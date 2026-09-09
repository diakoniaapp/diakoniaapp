// ─── usePodeOperarModulo — o portão de EBD/PGM, igual ao do banco ──────────
//
// Quem pode CRIAR, EDITAR e DESATIVAR classes de EBD e grupos de PGM. As
// quatro telas do assunto (Ebd, EbdClasse, Pgm, PgmGrupo) checavam isto com
// um `hasRole(["admin", "secretaria", "pastor", "diakonia"])` escrito à mão
// em cada arquivo — só o primeiro dos dois ramos que a RLS aplica.
//
// ── O QUE A RLS DIZ, DESDE 03/09/2026 ────────────────────────────────────
//
// A migration `20260903160000_lideranca_so_opera_o_proprio_modulo.sql` (B·2)
// dividiu o acesso de escrita das tabelas `ebd_*` e `pgm_*` em duas políticas
// que se somam com OR:
//
//   *_equipe / *_modify_lider   papel em [admin, secretaria, pastor, diakonia]
//   lider_<modulo>_opera_*       lidero_ministerio_do_modulo('ebd' | 'pgm')
//
// O segundo ramo NÃO é papel: é `ministerios.lider_id` / `vice_lider_id` /
// `co_lider_id` do ministério cujo `modulo` é este. A líder da EBD tem papel
// `lideranca` — fora do array — e por isso via a tela mas nenhum botão,
// mesmo com o banco deixando gravar. Medido em 09/09/2026 com a ficha da
// Patricia Oliveira (Educação Cristã): UPDATE em `ebd_classes` liberado pela
// RLS, "Nova classe" e "Editar" escondidos pela tela. É o defeito da "tela
// que promete o que não entrega" ao contrário — a tela ENTREGA menos do que
// o banco.
//
// Este hook fecha os dois ramos, reusando a MESMA função SQL que a política
// `lider_<modulo>_opera_*` chama — sem lista paralela que possa divergir.
//
// ── IDENTIDADE, NÃO PAPEL — LOGO, IMUNE A "VER COMO" ─────────────────────
//
// `lidero_ministerio_do_modulo` roda contra a conta de verdade (`auth.uid()`),
// igual à RLS. "Ver como" troca só o papel efetivo (ver useVerComo.tsx), não
// a identidade — então este resultado não muda na simulação, e é o
// comportamento certo: liderar um ministério nunca foi um papel de
// `user_roles`.
//
// `false` enquanto a ficha (`pessoaId`) não respondeu e para a conta sem
// ficha ligada — a mesma prudência de `pessoaCarregada` em useAuth.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function usePodeOperarModulo(modulo: "ebd" | "pgm"): boolean {
  const { hasRole, pessoaId, pessoaCarregada } = useAuth();
  const [lideraModulo, setLideraModulo] = useState(false);

  useEffect(() => {
    if (!pessoaCarregada) return;
    if (!pessoaId) {
      setLideraModulo(false);
      return;
    }
    let vivo = true;
    // `.rpc(...)` do supabase-js é thenable, não Promise — `.then().catch()`
    // não encadeia (ver AD-4 no CLAUDE.md). Daí o `await` dentro de um IIFE.
    (async () => {
      try {
        const { data } = await supabase.rpc("lidero_ministerio_do_modulo", { p_modulo: modulo });
        if (vivo) setLideraModulo(data === true);
      } catch {
        if (vivo) setLideraModulo(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [modulo, pessoaId, pessoaCarregada]);

  return hasRole(["admin", "secretaria", "pastor", "diakonia"]) || lideraModulo;
}
