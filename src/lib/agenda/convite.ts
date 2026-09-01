// ─── convite.ts — a mensagem que convida a igreja para um evento ───────────
//
// Saiu de dentro do diálogo porque deixou de ser uma concatenação de três
// linhas: agora tem saudação por horário, assinatura de quem envia, e três
// formas de participar (presencial, online, híbrido). Regra com decisão é
// regra que precisa de teste, e teste precisa que ela viva em `lib/`.
//
// ── O QUE ESTA MENSAGEM É ──────────────────────────────────────────────────
//
// Um texto que uma pessoa da liderança vai colar no WhatsApp e mandar para
// gente da igreja. Não é notificação de sistema: é recado de alguém para
// alguém. Daí a saudação, daí a assinatura — e daí ela ser EDITÁVEL antes de
// enviar, no diálogo que a usa.

/** Bom dia até 12h, boa tarde até 18h, boa noite depois. */
export function saudacaoDoHorario(agora = new Date()): string {
  const h = agora.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * O tratamento de quem assina.
 *
 * "Pr." e "Pra." dependem do sexo, e o rótulo da função não flexiona — em
 * `funcaoMinisterial.ts` está escrito "Pastor", que assinaria "Pastor Maria".
 * Quando o sexo não é conhecido, o tratamento é omitido: assinar com o nome
 * limpo é melhor que assinar errado.
 */
export function tratamento(funcao?: string | null, sexo?: string | null): string {
  if (!funcao) return "";
  // Sem os acentos: "Diácono" e "Presbítero" não casariam com /diacon/ e
  // /presbiter/, e o tratamento sumiria justo para as duas funções que mais
  // aparecem numa assinatura depois de pastor.
  const f = funcao.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const fem = sexo === "feminino";
  const masc = sexo === "masculino";
  if (/pastor|presidente/.test(f)) {
    if (fem) return "Pra.";
    if (masc) return "Pr.";
    return "";
  }
  if (/diacon/.test(f)) {
    if (fem) return "Diaconisa";
    if (masc) return "Diác.";
    return "";
  }
  if (/presbiter/.test(f)) return masc ? "Presb." : fem ? "Presb.ª" : "";
  return "";
}

/** "Pr. Lúcio Paulo | Quarta Igreja Batista do Rio de Janeiro" */
export function assinatura(p: {
  nome?: string | null;
  funcao?: string | null;
  sexo?: string | null;
  igreja?: string | null;
}): string {
  const nome = (p.nome || "").trim();
  if (!nome) return p.igreja?.trim() || "";
  const t = tratamento(p.funcao, p.sexo);
  const quem = t ? `${t} ${nome}` : nome;
  return p.igreja ? `${quem} | ${p.igreja}` : quem;
}

/** "terça-feira, 02/09/2026" — o dia da semana primeiro, que é como se planeja. */
export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  const dt = new Date(a, m - 1, d);
  const semana = dt.toLocaleDateString("pt-BR", { weekday: "long" });
  return `${semana}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
}

const hhmm = (h: string) => h.slice(0, 5);

export interface DadosDoConvite {
  titulo: string;
  data: string;                      // yyyy-mm-dd
  horaInicio?: string | null;
  horaFim?: string | null;
  local?: string | null;
  /** O evento é transmitido ao vivo. */
  transmitido?: boolean;
  /** Endereço da transmissão: o programado desta data, ou o canal da igreja. */
  urlTransmissao?: string | null;
  /** Verdadeiro quando a URL é de uma transmissão programada, e não o atalho
   *  permanente do canal. Muda a frase: uma se assiste agora, a outra se
   *  agenda com lembrete. */
  urlEhProgramada?: boolean;
  quemAssina?: { nome?: string | null; funcao?: string | null; sexo?: string | null; igreja?: string | null };
  agora?: Date;
}

/**
 * Monta a mensagem inteira.
 *
 * A ordem não é enfeite. Quem recebe no WhatsApp vê as primeiras linhas na
 * prévia da notificação: por isso a saudação é curta e o QUE/QUANDO vêm antes
 * de qualquer outra coisa. O como-participar vem depois, e a assinatura por
 * último — que é como se escreve um recado.
 */
export function montarConvite(p: DadosDoConvite): string {
  const linhas: string[] = [];

  linhas.push(`${saudacaoDoHorario(p.agora)}! Graça e paz. 🙏`);
  linhas.push("Tenho um convite especial para você:");
  linhas.push("");

  linhas.push(`📅 *${p.titulo}*`);

  const quando = [
    dataPorExtenso(p.data),
    p.horaInicio ? `às ${hhmm(p.horaInicio)}` : null,
  ].filter(Boolean).join(", ");
  // "das 19:30 às 20:30" e não "às 19:30 — até 20:30": é como se fala.
  linhas.push(
    p.horaInicio && p.horaFim
      ? `${dataPorExtenso(p.data)}, das ${hhmm(p.horaInicio)} às ${hhmm(p.horaFim)}`
      : quando,
  );

  if (p.local) linhas.push(`📍 ${p.local}`);

  if (p.transmitido && p.urlTransmissao) {
    linhas.push(
      p.urlEhProgramada
        ? `📺 Transmissão ao vivo — ative o lembrete: ${p.urlTransmissao}`
        : `📺 Ao vivo pelo YouTube: ${p.urlTransmissao}`,
    );
  }

  linhas.push("");
  // A frase final diz o que é possível fazer. Num evento híbrido, dizer só
  // "ter você conosco" ignora metade de quem vai participar.
  linhas.push(
    p.transmitido && p.local
      ? "Será uma alegria ter você conosco, presencialmente ou pela transmissão! 🙏"
      : p.transmitido
        ? "Será uma alegria ter você conosco na transmissão! 🙏"
        : "Será uma alegria ter você conosco! 🙏",
  );

  const assina = p.quemAssina ? assinatura(p.quemAssina) : "";
  if (assina) {
    linhas.push("");
    linhas.push(assina);
  }

  return linhas.join("\n");
}

/**
 * O endereço permanente de transmissão de um canal do YouTube.
 *
 * `@canal/live` aponta sempre para o que está NO AR — e para o canal quando
 * não há nada. É o que serve a uma série recorrente, onde cada domingo tem uma
 * transmissão diferente e não há onde guardar um endereço por data.
 */
export function atalhoDoCanal(urlDoCanal?: string | null): string | null {
  if (!urlDoCanal) return null;
  const u = urlDoCanal.trim().replace(/\/+$/, "");
  if (!/youtube\.com/i.test(u)) return null;
  if (/\/live$/i.test(u)) return u;
  // Só o formato @canal tem o atalho /live. Um link de vídeo não vira canal.
  return /youtube\.com\/@[^/]+$/i.test(u) ? `${u}/live` : null;
}
