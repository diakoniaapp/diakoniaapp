// ─── mensagensVisitante/padroes — os textos que a igreja recebe de partida (a migration semeia ESTES mesmos; "Restaurar padrão" na tela volta a eles) ───────────────────────────────────────────
// Não são "texto fixo em código": são o ponto de partida editável. O que vale para o envio é sempre o que está no banco; estes só aparecem quando a administração pede para restaurar um modelo.
// Um teste confere que a migration traz exatamente estes textos (src/lib/mensagensVisitante.test.ts).
import type { ConfigDaMensagem, IdentidadeDaIgreja, ModeloDaMensagem, SituacaoDaMensagem } from "./montar.ts";

type Texto = Pick<ModeloDaMensagem, "assunto" | "abertura" | "texto_pastoral" | "convite_retorno" | "fechamento">;

export const TEXTOS_PADRAO: Record<SituacaoDaMensagem, Texto> = {
  primeira_visita: {
    assunto: "Foi uma alegria receber você, {{nome}}!",
    abertura: "Olá, {{nome}}! 😊 Que alegria receber você na {{igreja}}!",
    texto_pastoral: "Foi um privilégio ter você conosco. Deus conhece cada um de nós pelo nome, e queremos que você se sinta em casa. Se houver algo pelo qual possamos orar ou conversar com você, estamos à disposição.",
    convite_retorno: "Esperamos ver você de novo em breve. Veja o que vem por aí:",
    fechamento: "Que a graça e a paz de Cristo estejam com você!",
  },
  segunda_visita: {
    assunto: "Que bom ver você de novo, {{nome}}!",
    abertura: "Olá, {{nome}}! 💙 Que alegria ver você de novo na {{igreja}}!",
    texto_pastoral: "Sua presença nos alegra muito. Queremos caminhar com você: se quiser conhecer um pequeno grupo, a escola bíblica ou conversar com a nossa equipe, é só nos chamar.",
    convite_retorno: "Que tal participar também destes encontros?",
    fechamento: "Estamos juntos nessa caminhada!",
  },
  nao_retornou: {
    assunto: "Sentimos a sua falta, {{nome}}",
    abertura: "Olá, {{nome}}! Sentimos a sua falta 💙",
    texto_pastoral: "Faz um tempinho desde a sua visita à {{igreja}} e queríamos saber como você está. Estamos orando por você e pela sua família. Se precisar de algo, pode contar conosco.",
    convite_retorno: "As portas estão sempre abertas! Estes são os próximos encontros:",
    fechamento: "Será uma alegria receber você de novo.",
  },
  interesse_membresia: {
    assunto: "Seu interesse em fazer parte da {{igreja}}",
    abertura: "Olá, {{nome}}! 🙏 Obrigado por demonstrar interesse em fazer parte da família da {{igreja}}!",
    texto_pastoral: "Ser membro é caminhar junto, servir e crescer na fé em comunidade. Nossa equipe vai explicar com carinho como funciona o processo e tirar todas as suas dúvidas, sem pressa.",
    convite_retorno: "Para dar o próximo passo, fale com a nossa equipe ou venha a um dos encontros:",
    fechamento: "Será uma alegria caminhar com você!",
  },
  infantil: {
    assunto: "Foi uma alegria receber {{nome}} na {{igreja}}",
    abertura: "Olá! 🧸 Foi uma alegria receber {{nome}} na {{igreja}}!",
    texto_pastoral: "Temos um trabalho especial com as crianças, com ensino bíblico no nível delas, num ambiente seguro e acolhedor. Será um prazer receber a sua família de novo.",
    convite_retorno: "Veja as próximas programações:",
    fechamento: "Um abraço carinhoso para a sua família!",
  },
  jovem: {
    assunto: "Bora de novo, {{nome}}?",
    abertura: "E aí, {{nome}}! 😄 Que bom ter você na {{igreja}}!",
    texto_pastoral: "Aqui os jovens têm espaço para fazer amizades, aprender a Bíblia e servir. Queremos conhecer você melhor e te chamar para o próximo encontro.",
    convite_retorno: "Bora de novo? Olha o que vem aí:",
    fechamento: "Conte com a gente!",
  },
  indicado_ministerio: {
    assunto: "Seja muito bem-vindo(a), {{nome}}!",
    abertura: "Olá, {{nome}}! 😊 Que alegria receber você na {{igreja}}!",
    texto_pastoral: "Soubemos que você chegou até nós por meio de um dos nossos ministérios. Ele ficará feliz em saber da sua visita, e queremos que você se sinta acolhido(a) em toda a igreja.",
    convite_retorno: "Venha conhecer mais da nossa programação:",
    fechamento: "Deus abençoe você!",
  },
};

/** Os blocos ligados de partida (oração e plano de leitura só aparecem quando a administração informar o endereço do link). */
export const BLOCOS_PADRAO = { incluir_eventos: true, incluir_redes: true, incluir_endereco: true, incluir_contato: true, incluir_whatsapp: true, incluir_oracao: true, incluir_leitura: false } as const;

export function modeloPadrao(situacao: SituacaoDaMensagem, canal: ModeloDaMensagem["canal"]): ModeloDaMensagem {
  return { situacao, canal, ativo: true, ...TEXTOS_PADRAO[situacao], ...BLOCOS_PADRAO };
}

export const CONFIG_PADRAO: ConfigDaMensagem = {
  // {{igreja}} é o nome da Identidade da Igreja
  assinatura: "Com carinho,\nEquipe de Acolhimento\n{{igreja}}",
  link_pedido_oracao: "", link_plano_leitura: "", titulo_eventos: "Próximos eventos", dias_sem_retorno: 15, eventos_max: 4, redes_ocultas: [],
};

/** A Identidade quando ainda não há nenhuma cadastrada (ou a função do banco não a devolveu): só o nome, para a mensagem nunca sair sem a igreja. */
export const IGREJA_PADRAO: IdentidadeDaIgreja = { nome: "Quarta Igreja Batista do Rio de Janeiro", site: "", redes: [], endereco: "", telefone: "", email: "", resumo: "", missao: "" };
