// A regra de atraso lida dos documentos mora em `supabase/functions/_shared/atraso/regras.ts` (puro) para o app, os e-mails e as Edge Functions dizerem o mesmo número. Aqui só se reexporta (alias `@/lib`).
export * from "../../supabase/functions/_shared/atraso/regras";
