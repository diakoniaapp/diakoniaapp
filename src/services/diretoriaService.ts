// ─── diretoriaService.ts — quem é a diretoria, lido da ficha da pessoa ──────
//
// ── O QUE ISTO SUBSTITUI ──────────────────────────────────────────────────
//
// A diretoria vinha de `pessoa_cargo_estatutario`, uma tabela de vínculo com
// `cargos_estatutarios`. Três telas liam essa junção com a mesma consulta
// copiada — Organograma, Estrutura da Igreja e PessoaCard — e as três traziam
// um comentário confessando "TABELA AUSENTE EM PRODUCAO".
//
// A tabela existe. Está vazia:
//
//     pessoa_cargo_estatutario     0 linhas
//     v_diretoria_atual            0 linhas   (a view que depende dela)
//     cargos_estatutarios          6 cargos semeados, sem ninguém ligado
//     cargos_institucionais       21 linhas = 3 cópias idênticas de 7 cargos
//
// Ou seja: dois cadastros de cargo, sobrepostos entre si, um deles com os
// dados semeados três vezes, e nenhuma pessoa ligada a nenhum dos dois. O
// organograma mostrava "Nenhum cargo estatutário cadastrado ainda" desde
// sempre, e a instrução na tela mandava atribuir num lugar que a ficha não
// tinha.
//
// Por decisão: a diretoria passa a ser lida de `membros.funcao_ministerial`,
// que é onde a igreja já está preenchendo. Uma verdade, no lugar onde a
// secretaria já digita.
//
// ── O QUE SE GANHA E O QUE SE PERDE ───────────────────────────────────────
//
// Ganha-se: quem preenche a ficha vê o organograma mudar. Antes eram dois
// cadastros e um deles ninguém sabia que existia.
//
// Perde-se: histórico de sucessão. `pessoa_cargo_estatutario` guardaria todos
// os mandatos que a pessoa já teve; a ficha guarda um. Enquanto a pergunta for
// "quem é o tesoureiro hoje", uma linha por pessoa responde. No dia em que for
// "quem foi tesoureiro antes", a tabela volta — e as duas datas da ficha
// (`funcao_inicio`, `funcao_fim`) são a semente daquela migração.
//
// As tabelas antigas ficam onde estão, vazias. Não removi nada: apagar tabela
// é irreversível e ninguém pediu.

import { supabase } from "@/integrations/supabase/client";
import {
  FUNCOES_DIRETORIA, nivelDiretoria, rotuloFuncao, mandatoLegivel,
} from "@/lib/funcaoMinisterial";

export interface CargoDiretoria {
  id: string;
  cargo: string;
  nivel: number;
  pessoa_id: string;
  pessoa_nome: string;
  pessoa_foto: string | null;
  mandato: string | null;
}

/**
 * A diretoria atual, ordenada por nível e nome.
 *
 * Só gente ativa: um tesoureiro desligado não deve seguir no organograma da
 * igreja, e o cadastro já sabe disso pelo status.
 */
export async function carregarDiretoria(): Promise<CargoDiretoria[]> {
  const { data, error } = await supabase
    .from("membros")
    .select("id, nome_completo, foto_url, funcao_ministerial, funcao_inicio, funcao_fim")
    .eq("status", "ativo")
    .in("funcao_ministerial", FUNCOES_DIRETORIA)
    .order("nome_completo");

  if (error || !data) return [];

  return data
    .map((m) => ({
      // O id é o da pessoa: sem tabela de vínculo, não há id de vínculo. As
      // telas usavam esse campo só como chave de React e para navegar até a
      // pessoa — os dois seguem funcionando.
      id: m.id,
      cargo: rotuloFuncao(m.funcao_ministerial),
      nivel: nivelDiretoria(m.funcao_ministerial),
      pessoa_id: m.id,
      pessoa_nome: m.nome_completo,
      pessoa_foto: m.foto_url ?? null,
      mandato: mandatoLegivel(m.funcao_inicio, m.funcao_fim),
    }))
    .sort((a, b) => a.nivel - b.nivel || a.cargo.localeCompare(b.cargo));
}

/** Os cargos de diretoria de UMA pessoa — hoje, no máximo um. */
export async function cargosDaPessoa(pessoaId: string): Promise<
  { cargo: string; nivel: number; mandato: string | null }[]
> {
  const { data } = await supabase
    .from("membros")
    .select("funcao_ministerial, funcao_inicio, funcao_fim")
    .eq("id", pessoaId)
    .maybeSingle();

  if (!data || !FUNCOES_DIRETORIA.includes(data.funcao_ministerial as never)) return [];

  return [{
    cargo: rotuloFuncao(data.funcao_ministerial),
    nivel: nivelDiretoria(data.funcao_ministerial),
    mandato: mandatoLegivel(data.funcao_inicio, data.funcao_fim),
  }];
}
