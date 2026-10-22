// Os blocos do resumo semanal e as regras de configuração moram em UM arquivo só, que a Edge Function e esta tela dividem (supabase/functions/_shared/resumoSemanal/catalogo.ts):
// assim o que a tela oferece é exatamente o que o e-mail sabe montar.
export * from "../../supabase/functions/_shared/resumoSemanal/catalogo";
