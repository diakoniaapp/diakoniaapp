import { createClient } from '@supabase/supabase-js';
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
