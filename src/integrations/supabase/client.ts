import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Variáveis de ambiente — defina no .env (local) e no painel da Vercel (produção)
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL   as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error(
    "Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não definidas. " +
    "Crie o arquivo .env na raiz do projeto com esses valores."
  );
}

// Uso: import { supabase } from "@/integrations/supabase/client";
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Mesmo cliente, sem inferência de tipos no schema.
 *
 * Use SOMENTE em consultas com embedding de relacionamento — por exemplo
 * `.select("funcao, areas(nome, ministerios(nome))")`. Para resolver esses
 * selects aninhados o TypeScript percorre o grafo de relacionamentos do
 * schema; com 284 objetos isso estoura o limite de profundidade e falha com
 * "Type instantiation is excessively deep" (TS2589). Pior: o erro contamina
 * a cadeia inteira e transforma os argumentos de `.eq()` em `never`.
 *
 * A consulta em si é válida — o limite é do compilador, não do código.
 *
 * Como o retorno não vem tipado, declare o formato esperado ao consumir.
 * Para qualquer consulta sem embedding, use `supabase` e mantenha a
 * verificação completa.
 */
export const supabaseRel = supabase as unknown as SupabaseClient<any, "public", any>;
