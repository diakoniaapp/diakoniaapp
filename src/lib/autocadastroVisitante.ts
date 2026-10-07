// ─── lib/autocadastroVisitante.ts — o formulário público do QR Code (puro, testado) ───────────────────────
//
// O visitante preenche no celular, sem login, em 3 passos. A função do banco `visitante_autocadastro` valida de novo tudo;
// aqui só se evita ida e volta à toa e se monta o JSON no formato que ela espera. Ver docs/AUTOCADASTRO_UX_MOBILE.md.

import { hojeLocal } from "@/lib/data";

export type ComoConheceu = "amigo_familiar" | "redes_sociais" | "evento_igreja" | "vizinhanca" | "outros";

export const OPCOES_COMO_CONHECEU: { valor: ComoConheceu; rotulo: string }[] = [
  { valor: "amigo_familiar", rotulo: "Convite de familiar ou amigo" },
  { valor: "redes_sociais", rotulo: "Redes sociais" },
  { valor: "evento_igreja", rotulo: "Evento ou campanha" },
  { valor: "vizinhanca", rotulo: "Sou da vizinhança" },
  { valor: "outros", rotulo: "Outro" },
];

export type SimNao = "sim" | "nao" | "";
export type CanalContato = "whatsapp" | "ligacao" | "";
export type HorarioContato = "manha" | "tarde" | "noite" | "";

export interface FormularioDoVisitante {
  nome: string;
  dataNascimento: string; // dd/mm/aaaa, digitado (convertido para AAAA-MM-DD em `montarPedido`)
  telefone: string;
  whatsapp: string;
  mesmoNumero: boolean; // "meu telefone também é WhatsApp"
  email: string;
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
  canalContato: CanalContato;     // só vale com desejaContato = "sim"
  horarioContato: HorarioContato; // idem
  desejaInformacoes: SimNao;
  lgpd: boolean;
}

export const FORMULARIO_VAZIO: FormularioDoVisitante = {
  nome: "", dataNascimento: "", telefone: "", whatsapp: "", mesmoNumero: true, email: "", endereco: "",
  comoConheceu: "", quemConvidou: "", comoConheceuOutro: "",
  oracaoFamilia: false, oracaoSaude: false, oracaoTrabalho: false, oracaoOutro: false, oracaoOutroTexto: "",
  primeiraVisita: "", desejaContato: "", canalContato: "", horarioContato: "", desejaInformacoes: "", lgpd: false,
};

export const TEXTO_DO_ACEITE =
  "Concordo que a Quarta Igreja Batista do Rio de Janeiro use meus dados e pedidos de oração para contato e acompanhamento pastoral.";

export const PASSOS = [
  { n: 1, titulo: "Dados pessoais" },
  { n: 2, titulo: "Sobre sua visita" },
  { n: 3, titulo: "Oração e acompanhamento" },
] as const;

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

/** Máscara enquanto digita: 17/05/1990. Aceita também o que o preenchimento automático do celular entrega (1990-05-17). */
export function mascararData(s: string): string {
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = (iso ? `${iso[3]}${iso[2]}${iso[1]}` : soDigitos(s)).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "17/05/1990" → "1990-05-17"; data que não existe no calendário (31/02) ou incompleta → null. */
export function dataBrParaIso(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]), mes = Number(m[2]), ano = Number(m[3]);
  const t = new Date(ano, mes - 1, dia);
  if (t.getFullYear() !== ano || t.getMonth() !== mes - 1 || t.getDate() !== dia) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Vazio vale (é opcional); preenchido precisa ser uma data real entre 1900 e hoje. */
export function nascimentoValido(s: string): boolean {
  if (s.trim() === "") return true;
  const iso = dataBrParaIso(s);
  return iso !== null && iso >= "1900-01-01" && iso <= hojeLocal();
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Vazio vale (é opcional); preenchido precisa parecer um e-mail. */
export const emailValido = (s: string) => s.trim() === "" || EMAIL.test(s.trim());

export interface Problema { campo: string; msg: string }

/** O que impede de AVANÇAR de cada passo (vazio = pode avançar). `campo` é o id do campo, para pôr o foco nele. */
export function problemasDoPasso(f: FormularioDoVisitante, passo: 1 | 2 | 3): Problema[] {
  const p: Problema[] = [];
  if (passo === 1) {
    if (f.nome.trim().length < 3) p.push({ campo: "v-nome", msg: "Informe seu nome completo." });
    const tel = telefoneValido(f.telefone), zap = !f.mesmoNumero && f.whatsapp.trim() !== "" && telefoneValido(f.whatsapp);
    if (f.telefone.trim() !== "" && !tel) p.push({ campo: "v-tel", msg: "O telefone parece incompleto (DDD + número)." });
    else if (!tel && !zap) p.push({ campo: "v-tel", msg: "Informe um telefone com DDD." });
    if (!f.mesmoNumero && f.whatsapp.trim() !== "" && !telefoneValido(f.whatsapp)) p.push({ campo: "v-zap", msg: "O WhatsApp parece incompleto (DDD + número)." });
    if (!nascimentoValido(f.dataNascimento)) p.push({ campo: "v-nasc", msg: "Confira a data de nascimento (dia/mês/ano)." });
    if (!emailValido(f.email)) p.push({ campo: "v-email", msg: "Confira o e-mail (exemplo: nome@email.com)." });
  }
  if (passo === 3) {
    if (f.oracaoOutro && f.oracaoOutroTexto.trim() === "") p.push({ campo: "v-oracao-texto", msg: "Escreva o seu pedido de oração em \"Outro\"." });
    if (!f.lgpd) p.push({ campo: "v-lgpd", msg: "Marque a concordância com o uso dos seus dados." });
  }
  return p;
}

/** Tudo que impede de enviar (os três passos), em mensagens curtas. */
export function problemasDoFormulario(f: FormularioDoVisitante): string[] {
  return ([1, 2, 3] as const).flatMap(n => problemasDoPasso(f, n)).map(x => x.msg);
}

/** O jsonb de `visitante_autocadastro` (o servidor revalida tudo). `medida` é o funil: sem nenhum dado da pessoa. */
export function montarPedido(f: FormularioDoVisitante, medida?: { sessaoId: string; duracaoS: number }): Record<string, unknown> {
  const sim = (v: SimNao) => v === "sim";
  const tel = f.telefone.trim();
  const quer = sim(f.desejaContato);
  return {
    nome: f.nome.trim(),
    data_nascimento: dataBrParaIso(f.dataNascimento),
    telefone: tel || null,
    whatsapp: f.mesmoNumero ? tel || null : f.whatsapp.trim() || null,
    email: f.email.trim().toLowerCase() || null,
    endereco: f.endereco.trim() || null,
    como_conheceu: f.comoConheceu || null,
    quem_convidou: f.comoConheceu === "amigo_familiar" ? f.quemConvidou.trim() || null : null,
    como_conheceu_outro: f.comoConheceu === "outros" ? f.comoConheceuOutro.trim() || null : null,
    oracao_familia: f.oracaoFamilia,
    oracao_saude: f.oracaoSaude,
    oracao_trabalho: f.oracaoTrabalho,
    oracao_outro: f.oracaoOutro ? f.oracaoOutroTexto.trim() || null : null,
    primeira_visita: f.primeiraVisita === "" ? null : sim(f.primeiraVisita),
    deseja_contato: quer,
    canal_contato: quer ? f.canalContato || null : null,
    horario_contato: quer ? f.horarioContato || null : null,
    deseja_informacoes: sim(f.desejaInformacoes),
    lgpd_aceito: f.lgpd,
    ...(medida ? { sessao_id: medida.sessaoId, duracao_s: Math.max(0, Math.round(medida.duracaoS)) } : {}),
  };
}

/** Quem pediu oração (qualquer motivo): é o que a fila pastoral prioriza. */
export const pediuOracao = (c: { oracao_familia?: boolean; oracao_saude?: boolean; oracao_trabalho?: boolean; oracao_outro?: unknown }) =>
  !!(c.oracao_familia || c.oracao_saude || c.oracao_trabalho || c.oracao_outro);

export function rotulosDaOracao(c: { oracao_familia?: boolean; oracao_saude?: boolean; oracao_trabalho?: boolean; oracao_outro?: unknown }): string[] {
  return [c.oracao_familia && "Família", c.oracao_saude && "Saúde", c.oracao_trabalho && "Trabalho", c.oracao_outro && "Outro"].filter(Boolean) as string[];
}

const NOME_DO_CANAL: Record<string, string> = { whatsapp: "WhatsApp", ligacao: "ligação" };
const NOME_DO_HORARIO: Record<string, string> = { manha: "de manhã", tarde: "à tarde", noite: "à noite" };

/** "prefere WhatsApp, à tarde" — para a fila pastoral (vazio se o visitante não disse). */
export function preferenciaDeContato(c: { canal_contato?: string | null; horario_contato?: string | null }): string {
  const canal = c.canal_contato ? NOME_DO_CANAL[c.canal_contato] : null;
  const hora = c.horario_contato ? NOME_DO_HORARIO[c.horario_contato] : null;
  if (!canal && !hora) return "";
  return `prefere ${canal ?? "contato"}${hora ? `, ${hora}` : ""}`;
}
