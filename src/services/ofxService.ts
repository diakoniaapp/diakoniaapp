// ─── ofxService.ts ───────────────────────────────────────────────────────
//
// Item 7 do roadmap do ERP financeiro: conciliação bancária automática a
// partir de um extrato OFX exportado do banco. Formato confirmado com um
// arquivo real do Bradesco (internet banking, 09/09/2026) — sem esse
// exemplo, o parser estaria adivinhando: OFX 1.02 em SGML (tags sem
// fechamento, exceto blocos como `<STMTTRN>...</STMTTRN>`),
// `CHARSET:1252` (Windows-1252 — sem decodificar assim, nome com acento
// vira lixo), `TRNAMT` com vírgula decimal e sinal já correto por
// TRNTYPE (CREDIT positivo, DEBIT negativo).
//
// ACHADO no arquivo real: `DTPOSTED` nem sempre é o dia de verdade da
// transação — o Bradesco agrupa vários dias sob uma única data de
// processamento quando há fim de semana/feriado no meio (no exemplo,
// transações de sábado a segunda de feriado apareceram todas com
// DTPOSTED de terça). Por isso o casamento usa uma JANELA de dias, não
// igualdade exata — ver `JANELA_DIAS_CASAMENTO`.
//
// ESCOPO DELIBERADO: `casarComLancamentos` casa transações do extrato com
// lançamentos que JÁ EXISTEM no sistema (`status = 'realizado'`) — nunca
// cria lançamento novo a partir do extrato. Categoria e centro de custo
// são decisão de quem lança, e o MEMO do banco ("PIX RECEBIDO REM:
// Fulano") não basta pra adivinhar nenhum dos dois com segurança. Uma
// transação do extrato sem correspondência fica listada para revisão
// manual — a tesouraria já fazia essa revisão comparando papel com tela;
// agora a lista sai pronta.
import type { FinLancamentoExtenso, FinMovimentoTipo } from "./finService";

export interface OFXTransacao {
  fitid: string;
  tipo: FinMovimentoTipo;
  data: string;   // YYYY-MM-DD, de DTPOSTED
  valor: number;  // sempre positivo — o sinal já virou `tipo`
  memo: string;
}

const JANELA_DIAS_CASAMENTO = 5;

function diffDias(a: string, b: string): number {
  const da = new Date(a + "T00:00").getTime();
  const db = new Date(b + "T00:00").getTime();
  return Math.abs(da - db) / 86400000;
}

/**
 * Lê o CHARSET declarado no cabeçalho OFX (sempre puro ASCII, mesmo
 * quando o corpo do arquivo não é) e devolve o nome de encoding que o
 * TextDecoder entende. Banco que não declara, ou declara algo que o
 * TextDecoder não reconhece, cai em utf-8 — o caso mais comum fora do
 * OFX 1.x estilo Bradesco.
 */
export function encodingDoOFX(bytes: Uint8Array): string {
  const cabecalho = new TextDecoder("ascii").decode(bytes.slice(0, 400));
  const m = cabecalho.match(/CHARSET:\s*(\S+)/i);
  const charset = m?.[1]?.toUpperCase();
  if (charset === "1252") return "windows-1252";
  if (charset === "8859-1" || charset === "ISO-8859-1") return "iso-8859-1";
  return "utf-8";
}

export function parseOFX(texto: string): OFXTransacao[] {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const campo = (bloco: string, tag: string): string => {
    const m = bloco.match(new RegExp(`<${tag}>([^\r\n<]*)`, "i"));
    return m ? m[1].trim() : "";
  };

  return blocos
    .map(bloco => {
      const trntype = campo(bloco, "TRNTYPE").toUpperCase();
      const dtposted = campo(bloco, "DTPOSTED");
      const trnamt = campo(bloco, "TRNAMT");
      const fitid = campo(bloco, "FITID");
      const memo = campo(bloco, "MEMO");
      const data = dtposted.length >= 8
        ? `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`
        : "";
      const valor = Math.abs(parseFloat(trnamt.replace(",", ".")));
      return {
        fitid,
        tipo: (trntype === "CREDIT" ? "entrada" : "saida") as FinMovimentoTipo,
        data,
        valor,
        memo,
      };
    })
    .filter(t => t.data.length === 10 && Number.isFinite(t.valor) && t.valor > 0);
}

export type OFXStatusCasamento = "encontrado" | "sem_correspondencia" | "ambiguo";

export interface OFXCasamento {
  transacao: OFXTransacao;
  status: OFXStatusCasamento;
  lancamentoId?: string;              // só quando status === "encontrado"
  candidatos: FinLancamentoExtenso[]; // só quando status === "ambiguo"
}

/**
 * Casa cada transação do extrato com no máximo um lançamento `realizado`
 * do sistema — mesmo tipo, mesmo valor (2 casas), dentro da janela de
 * dias. Guloso: o lançamento casado sai do lote antes da próxima
 * transação, pra duas transações iguais no extrato nunca roubarem o
 * mesmo lançamento.
 *
 * Limite conhecido: se o extrato tem duas transações de mesmo valor no
 * mesmo dia e o sistema tem dois lançamentos iguais, cada transação vê 2
 * candidatos e as duas caem em "ambíguo" — mesmo que a correspondência
 * 1-para-1 exista. Errar para o lado de pedir revisão manual, em vez de
 * arriscar casar a transação errada, é a escolha certa aqui: dado
 * financeiro não é lugar para adivinhar em caso de empate.
 */
export function casarComLancamentos(
  transacoes: OFXTransacao[],
  lancamentosRealizados: FinLancamentoExtenso[],
): OFXCasamento[] {
  const disponiveis = [...lancamentosRealizados];

  return transacoes.map(t => {
    const candidatos = disponiveis.filter(l =>
      l.tipo === t.tipo &&
      Math.abs(Number(l.valor) - t.valor) < 0.005 &&
      diffDias(l.data, t.data) <= JANELA_DIAS_CASAMENTO,
    );

    if (candidatos.length === 1) {
      const idx = disponiveis.indexOf(candidatos[0]);
      disponiveis.splice(idx, 1);
      return { transacao: t, status: "encontrado" as const, lancamentoId: candidatos[0].id, candidatos: [] };
    }
    if (candidatos.length === 0) {
      return { transacao: t, status: "sem_correspondencia" as const, candidatos: [] };
    }
    return { transacao: t, status: "ambiguo" as const, candidatos };
  });
}
