// A regra de como um reembolso a pagar é APRESENTADO (quem recebe em destaque · o que quitou · valor · conta prevista) mora em `supabase/functions/_shared/reembolsos/apresentacao.ts`, porque os e-mails
// (Edge Functions) e as telas a dividem — assim a Mesa, o Extrato e os resumos diário e semanal dizem a mesma coisa. Este arquivo só a reexporta para o aplicativo (alias `@/lib`).
export * from "../../supabase/functions/_shared/reembolsos/apresentacao";
