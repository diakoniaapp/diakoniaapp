export interface Verse {
  texto: string;
  ref: string;
}

/**
 * Curadoria de versículos sobre servir, amor e cuidado com o próximo.
 * Fonte de referência: bibliaon.com / NVI/ARA.
 */
export const VERSES_SERVICO: Verse[] = [
  { texto: "Servi ao Senhor com alegria; apresentai-vos a ele com cânticos.", ref: "Salmos 100:2" },
  { texto: "Cada um exerça o dom que recebeu para servir aos outros, administrando fielmente a graça de Deus em suas múltiplas formas.", ref: "1 Pedro 4:10" },
  { texto: "Pois o Filho do Homem não veio para ser servido, mas para servir e dar a sua vida em resgate por muitos.", ref: "Marcos 10:45" },
  { texto: "Sirvam uns aos outros mediante o amor.", ref: "Gálatas 5:13" },
  { texto: "Levai as cargas uns dos outros e, assim, cumprireis a lei de Cristo.", ref: "Gálatas 6:2" },
  { texto: "Amarás o teu próximo como a ti mesmo.", ref: "Mateus 22:39" },
  { texto: "Acima de tudo, amem-se sinceramente uns aos outros, porque o amor cobre multidão de pecados.", ref: "1 Pedro 4:8" },
  { texto: "Em tudo vos dei o exemplo de que, assim trabalhando, é necessário ajudar os fracos.", ref: "Atos 20:35" },
  { texto: "Não nos cansemos de fazer o bem, pois no tempo próprio colheremos, se não desanimarmos.", ref: "Gálatas 6:9" },
  { texto: "O que vale é a fé que atua pelo amor.", ref: "Gálatas 5:6" },
  { texto: "Tudo o que fizerem, façam de todo o coração, como para o Senhor, e não para os homens.", ref: "Colossenses 3:23" },
  { texto: "Pois Deus não é injusto; ele não se esquecerá do trabalho de vocês e do amor que demonstraram por ele, servindo aos santos.", ref: "Hebreus 6:10" },
  { texto: "Eu, no entanto, estou entre vocês como quem serve.", ref: "Lucas 22:27" },
  { texto: "Ame o seu próximo como a si mesmo. Não há mandamento maior do que estes.", ref: "Marcos 12:31" },
  { texto: "A religião pura e sem mácula, para com o nosso Deus e Pai, é esta: visitar os órfãos e as viúvas nas suas tribulações.", ref: "Tiago 1:27" },
];

/** Versículo determinístico pelo dia (rotativo). */
export function verseOfTheDay(date = new Date()): Verse {
  // Dia juliano simples para garantir rotação diária
  const day = Math.floor(date.getTime() / 86_400_000);
  return VERSES_SERVICO[day % VERSES_SERVICO.length];
}