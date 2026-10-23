// ─── textos institucionais dos resumos da Tesouraria — UMA fonte para a visualização, o teste e o envio (manual e automático) ────────────────────────────────────────────────────────────────────
//
// Pedido dela (23/10/2026): texto padrão do Resumo Diário mais institucional, adequado a qualquer igreja, sem citar o DiakoniaApp no parágrafo de abertura nem cargos (tesoureiro, auxiliar…), cordial, objetivo e
// profissional — o MESMO na visualização e no envio. Tudo o que abre um resumo/envio da Tesouraria sai daqui, para as telas e os e-mails não divergirem. `src/lib/emailDesignSystem.test.ts` trava: sem a marca do
// sistema nem cargo nestes textos, e o diário, o semanal e o envio manual dizendo a mesma coisa.

/** A saudação que abre os resumos e o envio manual de pagamentos. */
export const SAUDACAO_INSTITUCIONAL = "Prezados, graça e paz!";

/** Fecha o parágrafo de abertura: a quem recorrer, sem citar cargo. */
export const ENCERRAMENTO_INSTITUCIONAL = "Havendo necessidade de esclarecimentos ou documentação complementar, favor contatar a equipe administrativa da igreja.";

/** O parágrafo do Resumo Diário da Tesouraria. */
export const INTRODUCAO_DO_DIARIO = "Segue o resumo diário da Tesouraria, com os compromissos financeiros que requerem atenção nesta data, incluindo pagamentos em atraso, vencimentos do dia e reembolsos pendentes.";

/** O parágrafo do resumo semanal (o mesmo tom; os blocos mudam por perfil, então não se citam áreas). */
export const INTRODUCAO_DO_SEMANAL = "Segue o resumo semanal, com os pontos que requerem atenção nesta semana.";

/** Quando o dia não tem nenhum pagamento nem reembolso (o resumo só sai assim se a configuração mandar enviar mesmo vazio). */
export const SEM_PAGAMENTOS_NO_DIA = "Não há pagamentos em aberto nesta data.";

/** A abertura completa do diário: saudação, introdução e encerramento — em parágrafos. */
export const ABERTURA_DO_DIARIO: readonly string[] = [SAUDACAO_INSTITUCIONAL, INTRODUCAO_DO_DIARIO, ENCERRAMENTO_INSTITUCIONAL];
/** A abertura do semanal. */
export const ABERTURA_DO_SEMANAL: readonly string[] = [SAUDACAO_INSTITUCIONAL, INTRODUCAO_DO_SEMANAL, ENCERRAMENTO_INSTITUCIONAL];
