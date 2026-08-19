// ─── escritaConferida.ts ─────────────────────────────────────────────────────
// Um UPDATE que não alterou nada não é sucesso.
//
// ── O DEFEITO ────────────────────────────────────────────────────────────────
//
// No Postgres com RLS, quando a política de UPDATE barra a linha, o comando
// afeta ZERO linhas e devolve SUCESSO. Não há erro. O PostgREST repassa isso
// como `{ error: null }`, e código que confere só o erro segue adiante achando
// que gravou.
//
// Isso não é teórico neste sistema. A política `staff_update_membros` não
// inclui o papel `lideranca` — que é o papel de 4 dos 6 usuários. Contado no
// código: 15 escritas na tabela `membros`, e apenas 1 conferia o resultado.
//
// O efeito, já registrado na migration 20260818000000_registrar_contato.sql:
// "existe hoje no banco um histórico dizendo que alguém foi contatado e uma
// ficha dizendo que nunca foi. As duas tabelas discordam sobre quem pode
// escrever." O histórico grava porque a política dele aceita qualquer usuário
// logado; a ficha não grava porque a dela não aceita. E a tela dizia "salvo".
//
// ── O QUE ESTE ARQUIVO FAZ, E O QUE NÃO FAZ ──────────────────────────────────
//
// NÃO concede permissão a ninguém. Quem podia gravar continua podendo; quem
// não podia continua não podendo.
//
// O que muda é que a pessoa passa a SABER. Em vez de um "salvo" que mente, ela
// recebe uma frase que diz o que aconteceu e a quem pedir. Perder o trabalho é
// ruim; perder o trabalho achando que ele foi salvo é pior, porque ninguém vai
// refazer o que acredita estar feito.
//
// ── COMO USAR ────────────────────────────────────────────────────────────────
//
//   const r = conferir(
//     await supabase.from("membros").update({ ... }).eq("id", id).select("id"),
//     "O status de acolhimento",
//   );
//   if (!r.ok) return toast.error(r.erro);
//
// O `.select()` é o que faz a diferença: sem ele o PostgREST não devolve as
// linhas afetadas, e não há como distinguir "gravou" de "foi barrado".

export interface ResultadoEscrita {
  ok: boolean;
  erro?: string;
}

export const RECADO_SEM_PERMISSAO =
  "seu perfil não tem permissão para alterar este cadastro. " +
  "Peça a alguém da secretaria ou à administração.";

/**
 * @param resultado o retorno do Supabase, com `.select()` no fim da consulta
 * @param oQue      sujeito da frase de erro, com maiúscula: "O status", "A observação"
 */
export function conferir(
  resultado: { data: unknown[] | null; error: { message: string } | null },
  oQue: string,
): ResultadoEscrita {
  if (resultado.error) return { ok: false, erro: resultado.error.message };

  // Zero linhas com zero erros: a política barrou em silêncio.
  if (!resultado.data || resultado.data.length === 0) {
    return { ok: false, erro: `${oQue} não foi salvo — ${RECADO_SEM_PERMISSAO}` };
  }

  return { ok: true };
}
