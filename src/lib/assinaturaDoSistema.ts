// ─── assinaturaDoSistema — a assinatura discreta do DiakoniaApp em tudo o que o sistema gera ───────────────────────────────────────────────────────────
// Pedido dela (20/10/2026): "identificar a origem dos documentos e registrar a autoria do trabalho de implantação e parametrização", sem virar peça publicitária: rodapé do documento, final do
// e-mail, arquivo de informações do pacote ZIP. Uma definição só (nome, slogan, autoria, CNPJ) para o e-mail de pagamentos, o WhatsApp, o ZIP dos boletos, o pacote do malote e os rodapés dos
// relatórios impressos — mudar uma palavra aqui muda em todos. O CNPJ é o mesmo do rodapé da tela de entrada (`AuthShell`).
//
// Se algum dia o CNPJ não deva aparecer nos e-mails operacionais (houve a sugestão de deixá-lo só nos documentos institucionais), é `comCnpj: false` na chamada — uma linha.

export const SISTEMA = {
  nome: "DiakoniaApp",
  slogan: "Conectando pessoas, organizando o propósito.",
  descricao: "Plataforma de gestão administrativa, financeira e ministerial da igreja.",
  autoria: "Telma Souza",
  cnpj: "34.926.658/0001-40",
} as const;

/** Como o documento se apresenta: "Mensagem preparada…", "Documento gerado…", "Pacote preparado…". */
export type TipoDeSaida = "mensagem" | "documento" | "pacote";

const ABERTURA: Record<TipoDeSaida, string> = {
  mensagem: `Mensagem preparada automaticamente pelo ${SISTEMA.nome}.`,
  documento: `Documento gerado automaticamente pelo ${SISTEMA.nome}.`,
  pacote: `Pacote preparado automaticamente pelo ${SISTEMA.nome}.`,
};

export interface OpcoesDaAssinatura { comCnpj?: boolean }

const autoria = (o: OpcoesDaAssinatura = {}) => `Desenvolvimento e parametrização: ${SISTEMA.autoria}${o.comCnpj === false ? "" : ` · CNPJ ${SISTEMA.cnpj}`}`;

/** As linhas da assinatura, sem formatação. */
export function linhasDaAssinatura(tipo: TipoDeSaida, o: OpcoesDaAssinatura = {}): string[] {
  return [ABERTURA[tipo], SISTEMA.slogan, SISTEMA.descricao, autoria(o)];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Final do e-mail: cinza e pequeno, separado por um traço. */
export function assinaturaEmHtml(tipo: TipoDeSaida, o: OpcoesDaAssinatura = {}): string {
  const [abertura, slogan, descricao, aut] = linhasDaAssinatura(tipo, o);
  return `<div style="margin-top:22px;padding-top:8px;border-top:1px solid #ddd;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;color:#777">`
    + `<b>${esc(SISTEMA.nome)}</b> · ${esc(slogan)}<br>${esc(abertura)} ${esc(descricao)}<br>${esc(aut)}</div>`;
}

/** Final da mensagem de WhatsApp. */
export function assinaturaEmWhatsapp(tipo: TipoDeSaida, o: OpcoesDaAssinatura = {}): string {
  const [abertura, slogan, descricao, aut] = linhasDaAssinatura(tipo, o);
  return ["—", `_${SISTEMA.nome} · ${slogan}_`, `_${abertura} ${descricao}_`, `_${aut}_`].join("\n");
}

/** Final do texto simples. */
export function assinaturaEmTexto(tipo: TipoDeSaida, o: OpcoesDaAssinatura = {}): string {
  const [abertura, slogan, descricao, aut] = linhasDaAssinatura(tipo, o);
  return ["—", `${SISTEMA.nome} · ${slogan}`, `${abertura} ${descricao}`, aut].join("\n");
}

/** O LEIA-ME.txt de um pacote ZIP: o que ele é, o que tem, e a assinatura. Quebra de linha do Windows (abre bem no Bloco de Notas). */
export function leiaMeDoPacote(titulo: string, linhas: string[], o: OpcoesDaAssinatura = {}): string {
  return [titulo, "=".repeat(Math.min(titulo.length, 70)), "", ...linhas, "", "—", ...linhasDaAssinatura("pacote", o), ""].join("\r\n");
}
