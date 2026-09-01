// ─── TiraDaSemana — sete dias, e o seletor de um deles ────────────────────
//
// Saiu de dentro do `PainelPastoral.tsx` quando a Home passou a precisar da
// mesma coisa. Não foi copiada: são as MESMAS sete casas, com os mesmos
// rótulos e o mesmo comportamento, porque duas versões da tira acabariam
// discordando — este repositório tem cicatriz disso, e ela está escrita no
// comentário de `AgendaDoDia.onJanela`: o indicador "Agenda (7d)" marcava 21
// enquanto a soma dos dias na tela dava 22, por haver quem contasse por fora.
//
// O comportamento inteiro está descrito nos comentários abaixo, que vieram
// junto — inclusive a decisão de qual número é o grande, tomada em 28/08.

export function rotuloDoDia(iso: string, hojeIso: string): string {
  if (iso === hojeIso) return "Hoje";
  const d = new Date(iso + "T00:00");
  const h = new Date(hojeIso + "T00:00");
  const dif = Math.round((d.getTime() - h.getTime()) / 86_400_000);
  if (dif === 1) return "Amanhã";
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
}

/** Só o dia e o mês — "28/ago". Usado na tira da semana. */
export function rotuloCurto(iso: string, hojeIso: string): string {
  if (iso === hojeIso) return "Hoje";
  const d = new Date(iso + "T00:00");
  const h = new Date(hojeIso + "T00:00");
  if (Math.round((d.getTime() - h.getTime()) / 86_400_000) === 1) return "Amanhã";
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

/**
 * A semana inteira em uma faixa — e o seletor do dia.
 *
 * **Não é só um resumo: é o controle.** Empilhar os sete dias de uma vez era
 * o que obrigava a rolar a tela para ler tudo. Agora a faixa mostra a forma
 * da semana (quantas datas em cada dia) sem rolagem nenhuma, e o dia clicado
 * é o único que se abre embaixo.
 *
 * Dia vazio continua clicável de propósito: "não há nada nesta sexta" é uma
 * resposta, e desabilitar o botão obrigaria a pessoa a deduzi-la do traço.
 */
export function TiraDaSemana({
  dias, hojeIso, aberto, onAbrir,
}: {
  dias: { data: string; total: number }[];
  hojeIso: string;
  aberto: string;
  onAbrir: (iso: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Dias da semana">
      {dias.map(d => {
        const ehHoje = d.data === hojeIso;
        const ehAberto = d.data === aberto;
        const n = d.total;
        const dia = new Date(d.data + "T00:00").getDate();
        return (
          <button
            key={d.data}
            type="button"
            role="tab"
            aria-selected={ehAberto}
            onClick={() => onAbrir(d.data)}
            title={`${rotuloDoDia(d.data, hojeIso)} — ${n === 0 ? "nada marcado" : n === 1 ? "1 item" : `${n} itens`}`}
            className={`rounded-md border px-1 py-1.5 text-center min-w-0 transition-colors
              hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              ${ehAberto ? "border-gold bg-muted ring-1 ring-gold/40" : n === 0 ? "border-dashed opacity-60" : ""}`}
          >
            {/* ── Quem é o número grande ────────────────────────────────
                Era a QUANTIDADE de itens, com o dia do mês miúdo embaixo.
                Invertido a pedido, e a inversão tem razão de ser: esta
                tira é o SELETOR do dia. O que se escolhe aqui é uma data,
                não uma contagem — então a data é a identidade do ladrilho
                e a contagem é a anotação sobre ela.

                O sinal disso estava na própria tela: para saber que dia
                era "SÁB" era preciso ler o número miúdo, enquanto o número
                grande respondia a uma pergunta que ninguém tinha feito
                ainda. Agora o ladrilho diz "sábado, dia 29" e, em voz
                baixa, "tem 1 coisa". */}
            <p className={`text-[10px] uppercase tracking-wide truncate ${ehHoje ? "text-gold-text" : "text-muted-foreground"}`}>
              {rotuloCurto(d.data, hojeIso)}
            </p>
            <p className="text-base font-semibold leading-none tabular-nums mt-0.5">
              {dia}
            </p>
            {/* O traço, e não "0", quando o dia está vazio: zero é um
                número e entra na leitura como se fosse contagem de algo.
                E a linha existe sempre, mesmo vazia, para os sete
                ladrilhos manterem a mesma altura. */}
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {n === 0 ? <span className="text-muted-foreground/50">–</span> : n}
            </p>
          </button>
        );
      })}
    </div>
  );
}
