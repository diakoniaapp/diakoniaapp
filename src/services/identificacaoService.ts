// ─── identificacaoService.ts — achar a pessoa/fornecedor que a descrição cita ───
//
// A regra de texto está em `lib/identificacao.ts` (extrair o nome) e `lib/fuzzyNome.ts`
// (casar com o cadastro, só quando há UM candidato). Aqui só a ida ao banco: os
// candidatos (membros e fornecedores), guardados por alguns minutos — o formulário e a
// importação OFX perguntam várias vezes seguidas.
//
// Regra de ouro herdada do `fuzzyNome`: na dúvida, NÃO preenche. Um lançamento ligado à
// pessoa errada é pior que um campo em branco (o doador errado recebe o recibo do dízimo).

import { supabase } from "@/integrations/supabase/client";
import { limparFornecedor } from "@/lib/documentos/dossie";
import { encontrarCandidatoPorNome, type CandidatoNome } from "@/lib/fuzzyNome";
import type { CandidatoFavorecido } from "@/lib/favorecidoNoTexto";
import { extrairNome, type ExtracaoDeNome } from "@/lib/identificacao";

export interface Achado { tipo: "pessoa" | "fornecedor"; id: string; nome: string }

export interface Cadastro { pessoas: CandidatoNome[]; fornecedores: CandidatoFavorecido[] }

const VALIDADE_MS = 5 * 60 * 1000;
let cache: { em: number; dados: Cadastro } | null = null;

async function paginar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const tudo: T[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await consulta(p * 1000, p * 1000 + 999);
    if (error) throw error;
    tudo.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return tudo;
}

/** Todo o cadastro que pode ser "a pessoa" de um lançamento. */
export async function carregarCadastro(forcar = false): Promise<Cadastro> {
  if (!forcar && cache && Date.now() - cache.em < VALIDADE_MS) return cache.dados;
  const [pessoas, fornecedores] = await Promise.all([
    paginar((de, ate) => supabase.from("membros").select("id, nome_completo").order("id").range(de, ate)),
    paginar((de, ate) => supabase.from("fin_fornecedores").select("id, nome, cnpj_cpf").eq("ativo", true).order("id").range(de, ate)),
  ]);
  const dados: Cadastro = {
    pessoas: pessoas.map(p => ({ id: p.id, nome: p.nome_completo })),
    // o Omie grava o CNPJ-base na frente do nome ("59.407.727 Marco Antonio …"); atrapalha o casamento
    fornecedores: fornecedores.map(f => ({ id: f.id, nome: limparFornecedor(f.nome), pj: (f.cnpj_cpf ?? "").replace(/\D/g, "").length === 14 })),
  };
  cache = { em: Date.now(), dados };
  return dados;
}

/** Descarta o cache (depois de cadastrar uma pessoa ou fornecedor novo). */
export function esquecerCadastroEmCache() { cache = null; }

/** Núcleo puro, sobre um cadastro já carregado — usado também em lote (importação OFX). */
export function identificarNoCadastro(descricao: string | null | undefined, cadastro: Cadastro): { achado: Achado | null; extracao: ExtracaoDeNome } {
  const extracao = extrairNome(descricao);
  if (!extracao.nome) return { achado: null, extracao };
  const pessoa = encontrarCandidatoPorNome(extracao.nome, cadastro.pessoas);
  const fornecedor = encontrarCandidatoPorNome(extracao.nome, cadastro.fornecedores);
  // pessoa E fornecedor com o mesmo nome: é ambíguo, não escolhe por ela
  if (pessoa && fornecedor) return { achado: null, extracao };
  if (pessoa) return { achado: { tipo: "pessoa", id: pessoa.id, nome: pessoa.nome }, extracao };
  if (fornecedor) return { achado: { tipo: "fornecedor", id: fornecedor.id, nome: fornecedor.nome }, extracao };
  return { achado: null, extracao };
}

export async function identificarPorDescricao(descricao: string | null | undefined) {
  if (!descricao?.trim()) return { achado: null, extracao: extrairNome(null) };
  return identificarNoCadastro(descricao, await carregarCadastro());
}
