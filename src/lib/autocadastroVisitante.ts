// ─── lib/autocadastroVisitante.ts — o formulário público do QR Code (puro, testado) ───────────────────────
//
// O visitante preenche no celular, sem login. A função do banco `visitante_autocadastro` valida de novo tudo; aqui só
// se evita ida e volta à toa e se monta o JSON no formato que ela espera. Ver docs/AUTOCADASTRO_VISITANTES_QR.md.

export type ComoConheceu = "amigo_familiar" | "redes_sociais" | "evento_igreja" | "vizinhanca" | "outros";

export const OPCOES_COMO_CONHECEU: { valor: ComoConheceu; rotulo: string }[] = [
  { valor: "amigo_familiar", rotulo: "Convite de Familiar/Amigo" },
  { valor: "redes_sociais", rotulo: "Redes Sociais" },
  { valor: "evento_igreja", rotulo: "Evento/Campanha" },
  { valor: "vizinhanca", rotulo: "Sou da Vizinhança" },
  { valor: "outros", rotulo: "Outro" },
];

export type SimNao = "sim" | "nao" | "";

export interface FormularioDoVisitante {
  nome: string;
  dataNascimento: string; // AAAA-MM-DD (campo de data nativo)
  telefone: string;
  whatsapp: string;
  mesmoNumero: boolean; // "meu telefone também é WhatsApp"
  endereco: string;
  comoConheceu: ComoConheceu | "";
  quemConvidou: string;
  comoConheceuOutro: string;
  oracaoFamilia: boolean;
  oracaoSaude: boolean;
  oracaoTrabalho: boolean;
  oracaoOutro: boolean;
  oracaoOutroTexto: string;
  primeiraVisita: SimNao;
  desejaContato: SimNao;
  desejaInformacoes: SimNao;
  lgpd: boolean;
}

export const FORMULARIO_VAZIO: FormularioDoVisitante = {
  nome: "", dataNascimento: "", telefone: "", whatsapp: "", mesmoNumero: true, endereco: "",
  comoConheceu: "", quemConvidou: "", comoConheceuOutro: "",
  oracaoFamilia: false, oracaoSaude: false, oracaoTrabalho: false, oracaoOutro: false, oracaoOutroTexto: "",
  primeiraVisita: "", desejaContato: "", desejaInformacoes: "", lgpd: false,
};

export const TEXTO_DO_ACEITE =
  "Concordo que a Quarta Igreja Batista do Rio de Janeiro use meus dados e pedidos de oração para contato e acompanhamento pastoral.";

const soDigitos = (s: string) => s.replace(/\D/g, "");

/** DDD + 8 ou 9 dígitos (com ou sem 55 na frente). O banco normaliza para 55DDDNÚMERO. */
export function telefoneValido(s: string): boolean {
  let d = soDigitos(s);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.length === 10 || d.length === 11;
}

/** Máscara enquanto digita: (21) 98399-1229. */
export function mascararTelefone(s: string): string {
  let d = soDigitos(s);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** O que impede de enviar (vazio = pode enviar). Mensagens curtas, para o celular. */
export function problemasDoFormulario(f: FormularioDoVisitante): string[] {
  const p: string[] = [];
  if (f.nome.trim().length < 3) p.push("Informe seu nome completo.");
  const tel = telefoneValido(f.telefone), zap = !f.mesmoNumero && f.whatsapp.trim() !== "" && telefoneValido(f.whatsapp);
  if (!tel && !zap) p.push("Informe um telefone com DDD.");
  if (f.telefone.trim() !== "" && !tel) p.push("O telefone parece incompleto (DDD + número).");
  if (!f.mesmoNumero && f.whatsapp.trim() !== "" && !telefoneValido(f.whatsapp)) p.push("O WhatsApp parece incompleto (DDD + número).");
  if (f.dataNascimento && (f.dataNascimento < "1900-01-01" || f.dataNascimento > new Date().toISOString().slice(0, 10))) {
    p.push("Confira a data de nascimento.");
  }
  if (f.oracaoOutro && f.oracaoOutroTexto.trim() === "") p.push("Escreva o seu pedido de oração em \"Outro\".");
  if (!f.lgpd) p.push("Marque a concordância com o uso dos seus dados.");
  return p;
}

/** O jsonb de `visitante_autocadastro` (o servidor revalida tudo). */
export function montarPedido(f: FormularioDoVisitante): Record<string, unknown> {
  const sim = (v: SimNao) => v === "sim";
  const tel = f.telefone.trim();
  return {
    nome: f.nome.trim(),
    data_nascimento: f.dataNascimento || null,
    telefone: tel || null,
    whatsapp: f.mesmoNumero ? tel || null : f.whatsapp.trim() || null,
    endereco: f.endereco.trim() || null,
    como_conheceu: f.comoConheceu || null,
    quem_convidou: f.comoConheceu === "amigo_familiar" ? f.quemConvidou.trim() || null : null,
    como_conheceu_outro: f.comoConheceu === "outros" ? f.comoConheceuOutro.trim() || null : null,
    oracao_familia: f.oracaoFamilia,
    oracao_saude: f.oracaoSaude,
    oracao_trabalho: f.oracaoTrabalho,
    oracao_outro: f.oracaoOutro ? f.oracaoOutroTexto.trim() || null : null,
    primeira_visita: f.primeiraVisita === "" ? null : sim(f.primeiraVisita),
    deseja_contato: sim(f.desejaContato),
    deseja_informacoes: sim(f.desejaInformacoes),
    lgpd_aceito: f.lgpd,
  };
}

/** Quem pediu oração (qualquer motivo): é o que a fila pastoral prioriza. */
export const pediuOracao = (c: { oracao_familia?: boolean; oracao_saude?: boolean; oracao_trabalho?: boolean; oracao_outro?: unknown }) =>
  !!(c.oracao_familia || c.oracao_saude || c.oracao_trabalho || c.oracao_outro);

export function rotulosDaOracao(c: { oracao_familia?: boolean; oracao_saude?: boolean; oracao_trabalho?: boolean; oracao_outro?: unknown }): string[] {
  return [c.oracao_familia && "Família", c.oracao_saude && "Saúde", c.oracao_trabalho && "Trabalho", c.oracao_outro && "Outro"].filter(Boolean) as string[];
}
