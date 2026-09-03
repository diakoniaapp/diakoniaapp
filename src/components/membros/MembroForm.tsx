import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { AcessoCard }      from "@/components/pessoas/AcessoCard";
import { CamposEndereco } from "@/components/ui/CamposEndereco";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trash2, Heart } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { GraduationCap } from "lucide-react";
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";
import { FamiliaBloco } from "@/components/familias/FamiliaBloco";
import { listarClasses, sugerirClasse, classesDaPessoa, type EbdClasse } from "@/services/ebdService";
import { PassoDisponibilidade } from "@/components/membros/PassoDisponibilidade";
import { carregarPerfil, salvarPerfil, resumoLegivel, PERFIL_VAZIO, type PerfilServico } from "@/services/perfilServico";
import { normalizarTelefone, validarTelefone, formatarTelefoneSemDDI } from "@/lib/telefone";
import {
  FUNCAO_MINISTERIAL, FUNCOES_EM_ORDEM, funcaoAposentada, rotuloFuncao,
  funcoesDe, ordenarFuncoes, type FuncaoMinisterial,
} from "@/lib/funcaoMinisterial";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import {
  MESES, diasDoMes, montarMeiaData, diaDeMeiaData, mesDeMeiaData,
} from "@/lib/idade";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { Membro } from "@/pages/Membros";

// ── Opções "Como conheceu" ────────────────────────────────────────────────
const COMO_CONHECEU_OPTS = [
  { value: "amigo_familiar",      label: "Amigo / Familiar" },
  { value: "indicacao_membro",    label: "Indicacao de membro" },
  { value: "redes_sociais",       label: "Redes sociais" },
  { value: "projeto_social",      label: "Projeto social" },
  { value: "evento_igreja",       label: "Evento da igreja" },
  { value: "pesquisa_google",     label: "Pesquisa no Google" },
  { value: "youtube",             label: "YouTube" },
  { value: "passando_em_frente",  label: "Passando em frente" },
  { value: "outros",              label: "Outros" },
];
const PRECISA_QUEM_CONVIDOU = ["amigo_familiar", "indicacao_membro"];

// ── Estado vazio ──────────────────────────────────────────────────────────
/**
 * Como a pessoa entrou no rol — o enum `tipo_entrada_rol` do banco.
 *
 * **Profissão de fé não está aqui de propósito.** Ela antecede o batismo e é
 * pré-requisito dele, não uma quinta forma de entrar: oferecê-la ao lado de
 * "Batismo" faria escolher entre duas metades do mesmo acontecimento, e a
 * contagem de batismos do ano nasceria repartida entre as duas.
 *
 * O módulo de solicitações de membresia tem um enum concorrente que erra
 * nisso — ver a migration `20260828200000`.
 */
const TIPO_ENTRADA_LABEL: Record<string, string> = {
  aclamacao:     "Aclamação",
  batismo:       "Batismo",
  reconciliacao: "Reconciliação",
  transferencia: "Transferência",
};

/**
 * O dia do aniversário: digita-se, e a lista se estreita.
 *
 * Existe porque um `<Select>` de 31 itens obriga a rolar para dizer "14", e
 * a secretaria faz isso dezenas de vezes seguidas. Aqui teclar 1 e 4 basta.
 *
 * Não usa o Popover do Radix de propósito: isto vive DENTRO de um Dialog do
 * Radix, e dois gerenciadores de foco aninhados brigam pelo cursor — o campo
 * perderia o foco justamente enquanto se digita nele. Uma lista posicionada
 * em CSS não tem esse problema e não precisa de nada além do que já existe.
 *
 * A lista tem o comprimento do MÊS escolhido, então 31 de junho não chega a
 * ser oferecido: a combinação impossível não se constrói.
 */
function DiaDoAniversario({
  valor, maximo, onChange,
}: {
  valor: string;
  maximo: number;
  onChange: (dia: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");

  const dias = Array.from({ length: maximo }, (_, i) => String(i + 1));
  // "1" traz 1, 10..19, 21, 31 — quem digita um dígito ainda está no meio do
  // caminho, e esconder os de dois dígitos obrigaria a apagar e recomeçar.
  const filtrados = texto ? dias.filter(d => d.startsWith(texto)) : dias;

  const escolher = (d: string) => {
    onChange(d);
    setTexto("");
    setAberto(false);
  };

  return (
    <div className="relative">
      <Input
        value={aberto ? texto : valor}
        placeholder="Dia"
        inputMode="numeric"
        aria-label="Dia do aniversário"
        autoComplete="off"
        className="tabular-nums"
        onFocus={() => { setAberto(true); setTexto(""); }}
        // O atraso deixa o clique numa opção acontecer antes do fechamento:
        // sem ele, o blur derruba a lista e o clique cai no vazio.
        onBlur={() => setTimeout(() => setAberto(false), 120)}
        onChange={(e) => {
          const t = e.target.value.replace(/D/g, "").slice(0, 2);
          setTexto(t);
          setAberto(true);
          // Dois dígitos que só podem ser um dia: escolhe sozinho, para não
          // exigir um clique a mais de quem já disse o que queria.
          const exatos = dias.filter(d => d.startsWith(t));
          if (t.length === 2 && exatos.length === 1) escolher(exatos[0]);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtrados.length) { e.preventDefault(); escolher(filtrados[0]); }
          if (e.key === "Escape") { setAberto(false); setTexto(""); }
        }}
      />
      {aberto && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-44 overflow-y-auto rounded-md border border-border bg-popover shadow-md py-1"
        >
          {filtrados.length === 0 && (
            <li className="px-3 py-1.5 text-xs text-muted-foreground">
              Nenhum dia com {texto}
            </li>
          )}
          {filtrados.map(d => (
            <li key={d}>
              <button
                type="button"
                role="option"
                aria-selected={d === valor}
                // onMouseDown, e não onClick: o clique só chegaria depois do
                // blur do campo, e a lista já teria fechado.
                onMouseDown={(e) => { e.preventDefault(); escolher(d); }}
                className={`w-full text-left px-3 py-1.5 text-sm tabular-nums transition-colors
                  hover:bg-accent hover:text-accent-foreground
                  ${d === valor ? "bg-muted font-medium" : ""}`}
              >
                {d}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const empty = {
  nome_completo:            "",
  tipo_pessoa:              "congregado" as const,
  perfil_acesso:            ""               as const, // null no banco; preenchido só se Membro
  cpf:                      "",
  data_nascimento:          "",
  // Dia e mês de quem não teve o ano registrado. O banco recusa esta e
  // data_nascimento preenchidas ao mesmo tempo (CHECK), então a interface
  // limpa uma ao ligar a outra. Ver migration 20260828210000.
  nascimento_dia_mes:       "",
  sexo:                     "",
  estado_civil:             "",
  data_casamento:           "",
  telefone_celular:         "",
  telefone_dispensado:      false,
  email:                    "",
  endereco:                 "",
  numero:                   "",
  complemento:              "",
  bairro:                   "",
  cidade:                   "",
  cep:                      "",
  data_entrada:             new Date().toISOString().slice(0, 10),
  // Vazio por padrão, e nunca chutado. Para os 184 membros que já tinham
  // data quando a coluna nasceu, "não registrado" é a verdade — e "batismo",
  // que seria o palpite óbvio, é justamente o errado para quem veio por
  // carta de outra igreja.
  tipo_entrada:             "",
  status:                   "ativo",
  // Vazia por padrão: só tem sentido com status de saída, e o seletor de
  // status a limpa sozinho quando a pessoa volta ao rol — ver `trocarStatus`.
  data_saida:               "",
  observacoes_pastorais:    "",
  // Funções na igreja e as datas de cada uma. Ver lib/funcaoMinisterial.ts.
  //
  // `funcao_ministerial` (singular) NÃO entra aqui de propósito: virou coluna
  // derivada, escrita pelo gatilho do banco como o primeiro item da lista.
  // Mandá-la junto seria disputar com o gatilho por quem manda.
  funcoes_ministeriais:         [] as string[],
  data_consagracao_pastoral:    "",
  data_ordenacao_diaconal:      "",
  data_ordenacao_presbiteral:   "",
  data_consagracao_missionaria: "",
  funcao_inicio:                "",
  funcao_fim:                   "",
  // campos visitante
  como_conheceu:            "",
  quem_convidou_id:         "",
  como_conheceu_descricao:  "",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  membro: Membro | null;
  onSaved: () => void;
}


// ── Helpers ───────────────────────────────────────────────────────────────
function calcIdade(dataNasc: string): number {
  if (!dataNasc) return 0;
  return Math.floor((Date.now() - new Date(dataNasc).getTime()) / (365.25 * 86_400_000));
}

function addDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Tarefas de acolhimento automáticas ───────────────────────────────────
async function criarTarefasAcolhimento(visitanteId: string, nome: string) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: evt } = await supabase
    .from("eventos").select("data").gte("data", hoje).neq("status", "cancelado")
    .order("data", { ascending: true }).limit(1).maybeSingle();

  const tarefas = [
    { visitante_id: visitanteId, titulo: `Enviar mensagem de boas-vindas — ${nome}`, data: hoje },
    { visitante_id: visitanteId, titulo: `Entrar em contato com visitante — ${nome}`, data: addDias(2) },
    { visitante_id: visitanteId, titulo: `Convidar para proximo evento — ${nome}`, data: evt?.data ?? addDias(5) },
    { visitante_id: visitanteId, titulo: `Recontato com visitante — ${nome}`, data: addDias(7) },
  ];
  const { error } = await supabase.from("acolhimento_tarefas").insert(tarefas);
  if (error) console.error("Erro ao criar tarefas:", error.message);
}

// ── Componente principal ──────────────────────────────────────────────────
export function MembroForm({ open, onOpenChange, membro, onSaved }: Props) {
  const { hasRole } = useAuth();
  // FASE D: helper unificado — "editando" vs "criando".
  const isEditing = Boolean(membro);
  const isAdmin = hasRole("admin");

  const [form, setForm] = useState<any>(empty);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Cinco passos desde que "Acesso ao sistema" saiu de dentro de Vínculos.
  // Estava junto de áreas de atuação e família, e ninguém procura permissão
  // de login nesse meio — a pergunta "onde eu escolho o perfil da pessoa?"
  // tinha resposta e mesmo assim não se achava.
  // Seis passos desde 19/08/2026: "Disponibilidade" entrou antes da Revisão.
  // Ela é a única peça do ecossistema de escalas que não existia — o resto do
  // banco já tinha tudo. Ver services/perfilServico.ts.
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // O perfil de serviço mora em outra tabela (perfil_servico), com política
  // de escrita PRÓPRIA — e mais generosa que a de `membros`: `lideranca`
  // pode gravar aqui, e não pode lá. Por isso é uma gravação lateral, como
  // as áreas e a matrícula de EBD, e não parte do payload.
  const [perfil, setPerfil] = useState<PerfilServico>(PERFIL_VAZIO);

  // Sem isto, salvar QUALQUER pessoa criaria uma linha de perfil vazia — e
  // "ninguém perguntou" viraria indistinguível de "perguntaram e ela não
  // pode nenhum dia". São 282 pessoas: a tabela nasceria poluída, e o
  // painel não teria como dizer a verdade sobre nenhuma delas.
  const [perfilTocado, setPerfilTocado] = useState(false);

  // Reset wizard step quando abrir
  useEffect(() => {
    if (open) setStep(1);
    // Perfil vem junto com a abertura. Pessoa sem perfil devolve null, e o
    // formulário começa no PERFIL_VAZIO — que não é "indisponível", é
    // "ninguém perguntou ainda".
    if (open && membro?.id) carregarPerfil(membro.id).then(p => setPerfil(p ?? PERFIL_VAZIO));
    if (open && !membro) setPerfil(PERFIL_VAZIO);
    if (open) setPerfilTocado(false);
    // As duas listas longas voltam a nascer fechadas a cada abertura. O
    // formulário não desmonta quando o diálogo fecha, então sem esta linha o
    // estado vazava: abrir a ficha de alguém, expandir as áreas, fechar e
    // abrir a ficha de OUTRA pessoa trazia tudo aberto de novo.
    if (open) { setAbrirFuncoes(false); setAbrirAreas(false); }
  }, [open]);

  // EBD: classes disponíveis e seleção atual
  const [ebdClasses, setEbdClasses] = useState<EbdClasse[]>([]);
  const [ebdClasseSelecionada, setEbdClasseSelecionada] = useState<string>("");
  const [ebdSugestaoId, setEbdSugestaoId] = useState<string | null>(null);
  /** "Não sei o ano" ligado. Nasce do registro; não é coluna do banco. */
  const [semAnoNasc, setSemAnoNasc] = useState(false);
  /**
   * Dia e mês guardados SEPARADOS, e não derivados do valor gravado.
   *
   * O valor gravado é uma data única, que só existe inteira: não há como ela
   * representar "mês escolhido, dia ainda não". Derivar as duas metades dela
   * fazia trocar de janeiro para fevereiro com o dia 31 apagar TAMBÉM o mês
   * recém-escolhido — o campo voltava ao zero na cara de quem tinha acabado
   * de responder metade.
   */
  const [nascDia, setNascDia] = useState("");
  const [nascMes, setNascMes] = useState("");


  // Áreas disponíveis (agrupadas por ministério) e selecionadas
  const [areasPorMinisterio, setAreasPorMinisterio] = useState<{
    ministerio: { id: string; nome: string };
    areas: { id: string; nome: string; lider_id: string | null; co_lider_id: string | null }[];
  }[]>([]);
  const [areasSelecionadas, setAreasSelecionadas] = useState<Set<string>>(new Set());
  // ── O QUE A PESSOA FAZ EM CADA ÁREA ─────────────────────────────────
  //
  // Este formulário gravava `funcao: "Voluntário"` fixo no código. Medido em
  // 02/09/2026, é de onde vêm os 46 "Voluntário" do banco — e, contando os
  // nomes de área que também vazaram para a coluna, 80 dos 128 vínculos
  // ativos não dizem o que a pessoa faz. A Comunhão tem 40 de 44.
  //
  // Quem lidera não monta escala de recepção sem isso, e quem marcava a área
  // aqui não tinha onde escrever. Agora tem — e continua opcional: obrigar a
  // função no cadastro de uma pessoa emperraria o trabalho da secretaria por
  // um dado que quem lidera preenche melhor depois, em Atuações.
  // As áreas em que a pessoa JÁ serve quando o formulário abriu. Serve para
  // não oferecer o campo de função onde ele não teria efeito: o insert só
  // acontece para as áreas NOVAS, e mudar a função de um vínculo que já
  // existe é em Atuações.
  const [areasAtuais, setAreasAtuais] = useState<Set<string>>(new Set());

  // ── As duas listas longas nascem fechadas ──────────────────────────────
  //
  // Medido no banco: a tela oferece 25 funções ministeriais e 11 áreas — 36
  // caixas — e a média é de 1,1 função por pessoa. Das 282 pessoas, 52
  // servem em alguma área. Ou seja, quase toda visita a esta aba é para
  // conferir uma escolha, não para mexer nela, e as duas caixas empurravam
  // Família para fora da tela.
  //
  // Fechado NÃO quer dizer escondido: o resumo acima mostra o que está
  // marcado. Um acordeão que só diz "Funções ministeriais ▸" trocaria
  // espaço por um clique a cada visita — quem abre a ficha de alguém quer
  // saber o que a pessoa faz, e teria de abrir para descobrir.
  const [abrirFuncoes, setAbrirFuncoes] = useState(false);
  const [abrirAreas,   setAbrirAreas]   = useState(false);

  /**
   * As funções marcadas, sempre na ordem da hierarquia.
   *
   * Sai do próprio `form` em vez de virar um segundo estado: dois lugares
   * guardando a mesma escolha é como o telefone acabou em duas colunas — um
   * dia divergem, e ninguém sabe qual vale.
   */
  const funcoesSelecionadas = ordenarFuncoes(form.funcoes_ministeriais ?? []);

  const alternarFuncao = (f: FuncaoMinisterial) => {
    const atual = new Set<string>(form.funcoes_ministeriais ?? []);
    if (atual.has(f)) atual.delete(f); else atual.add(f);
    // Grava JÁ ORDENADA: o gatilho do banco pega o primeiro item como função
    // principal, e é o que aparece na coluna Tipo/Função do catálogo. Fora de
    // ordem, o catálogo chamaria de "Professor de EBD" quem também é Presidente.
    set("funcoes_ministeriais", ordenarFuncoes([...atual]));
  };

  // Preencher ao editar
  useEffect(() => {
    if (membro) {
      const f: any = { ...empty };
      Object.keys(empty).forEach((k) => { f[k] = (membro as any)[k] ?? ""; });
      // A lista vem do registro; se ele for antigo e só tiver a coluna única,
      // `funcoesDe` converte. Sem isso, abrir a ficha de quem já tinha função
      // mostraria tudo desmarcado — e salvar apagaria o cargo da pessoa.
      f.funcoes_ministeriais = funcoesDe(membro as any);
      // O laço acima faz `?? ""`, que serve para texto e estraga booleano: um
      // registro carregado sem esta coluna viraria `""`, a caixa apareceria
      // desmarcada para quem está dispensado, e salvar mandaria string vazia
      // para uma coluna `boolean not null`.
      f.telefone_dispensado = !!(membro as any).telefone_dispensado;
      setForm(f);
      // Quem está gravado com meia data abre a ficha já com o interruptor
      // ligado — senão o campo apareceria vazio e salvar apagaria o dia e o
      // mês que a secretaria tinha conseguido.
      const meia = (membro as any).nascimento_dia_mes || "";
      setSemAnoNasc(!!meia);
      setNascDia(diaDeMeiaData(meia));
      setNascMes(mesDeMeiaData(meia));
    } else {
      setForm(empty);
      setSemAnoNasc(false);
      setNascDia("");
      setNascMes("");
    }
  }, [membro, open]);

  // EBD: carregar classes disponíveis e classe atual da pessoa (se houver)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const cs = await listarClasses();
        if (cancelled) return;
        setEbdClasses(cs);
        if (membro?.id) {
          const atuais = await classesDaPessoa(membro.id);
          if (cancelled) return;
          setEbdClasseSelecionada(atuais[0]?.classe_id ?? "");
        } else {
          setEbdClasseSelecionada("");
        }
      } catch (e) {
        console.warn("EBD: erro ao carregar classes", e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, membro?.id]);

  // EBD: ao mudar data_nascimento/sexo, calcular sugestão
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!form.data_nascimento) { setEbdSugestaoId(null); return; }
      const id = await sugerirClasse(form.data_nascimento, form.sexo || null);
      if (!cancelled) {
        setEbdSugestaoId(id);
        if (!membro && !ebdClasseSelecionada && id) {
          setEbdClasseSelecionada(id);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [form.data_nascimento, form.sexo]);

  // Carregar áreas ativas agrupadas por ministério ativo, e seleção atual da pessoa
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: rawAreas } = await supabase
        .from("areas")
        .select("id, nome, ministerio_id, ativo, lider_id, co_lider_id, ministerios!areas_ministerio_id_fkey(id, nome, ativo)")
        .eq("ativo", true)
        .order("nome");
      if (cancelled) return;
      // Agrupar por ministério (apenas ativos)
      //
      // O tipo tem que bater com o do estado `areasPorMinisterio`: as areas
      // carregam lider_id e co_lider_id, que o JSX usa para marcar quem
      // lidera. O Map estava declarado sem esses dois campos, embora o push
      // logo abaixo sempre os tenha enviado.
      const mapaMin: Map<string, {
        ministerio: { id: string; nome: string };
        areas: { id: string; nome: string; lider_id: string | null; co_lider_id: string | null }[];
      }> = new Map();
      (rawAreas ?? []).forEach((a: any) => {
        const m = a.ministerios;
        if (!m || m.ativo === false) return;
        if (!mapaMin.has(m.id)) mapaMin.set(m.id, { ministerio: { id: m.id, nome: m.nome }, areas: [] });
        mapaMin.get(m.id)!.areas.push({ id: a.id, nome: a.nome, lider_id: a.lider_id ?? null, co_lider_id: a.co_lider_id ?? null });
      });
      const grupos = Array.from(mapaMin.values()).sort((a, b) =>
        a.ministerio.nome.localeCompare(b.ministerio.nome)
      );
      setAreasPorMinisterio(grupos);

      if (membro?.id) {
        const { data: vinculos } = await supabase
          .from("area_voluntarios")
          .select("area_id")
          .eq("membro_id", membro.id)
          .eq("status", "ativa");
        if (cancelled) return;
        const jaServe = new Set((vinculos ?? []).map((v: any) => v.area_id as string));
        setAreasSelecionadas(jaServe);
        setAreasAtuais(jaServe);
      } else {
        setAreasSelecionadas(new Set());
        setAreasAtuais(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [open, membro?.id]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  /**
   * Os três status que tiram a pessoa do rol.
   *
   * `inativo` NÃO está aqui: inativo ("Ausente", na tela) é ausência temporária — a pessoa
   * continua membro. Sair do rol é outra coisa, passa por assembleia, e é o
   * que o gatilho `a_assina_saida_do_rol` assina no banco.
   */
  const STATUS_DE_SAIDA = ["transferido", "desligado", "falecido"];
  const saindoDoRol = STATUS_DE_SAIDA.includes(form.status);

  /**
   * Troca o status e limpa a data de saída quando a pessoa volta ao rol.
   *
   * Sem isto, quem marcasse "transferido", pusesse a data e voltasse atrás
   * salvaria um ativo com data de saída — e o gráfico de Movimento de
   * Membros desenharia uma barra de saída para quem não saiu.
   *
   * O banco também limpa (o gatilho zera o carimbo quando o status volta),
   * mas o formulário precisa limpar ANTES: senão o campo continua na tela
   * com um valor que vai ser descartado sem aviso nenhum.
   */
  const trocarStatus = (novo: string) =>
    setForm((f: any) => ({
      ...f,
      status: novo,
      data_saida: STATUS_DE_SAIDA.includes(novo) ? f.data_saida : "",
    }));

  // ── Submit ─────────────────────────────────────────────────────────────
  //
  // `viaAtalho` é o botão "Salvar" que aparece nos passos intermediários ao
  // EDITAR alguém — ver o rodapé, onde está o porquê de ele existir e de só
  // aparecer na edição.
  const onSubmit = async (e?: React.FormEvent, viaAtalho = false) => {
    e?.preventDefault();
    // ⚠️ Guard: só salva no STEP FINAL (Revisão). Avancos intermediarios sao no botao "Proximo".
    //
    // O atalho fura a guarda de propósito, e é seguro: os efeitos que
    // carregam áreas, classe de EBD e perfil de serviço rodam ao ABRIR o
    // diálogo, não ao chegar no passo. Salvar do passo 1 regrava exatamente
    // o que foi lido — a diferença de áreas dá lista vazia, a EBD compara
    // com a matrícula atual e não mexe, e o perfil de serviço só grava se
    // `perfilTocado`. Verificado antes de soltar a guarda.
    if (step !== 6 && !viaAtalho) return;

    if (!form.nome_completo.trim()) return toast.error("Informe o nome");

    // Telefone obrigatorio para visitante
    if (form.tipo_pessoa === "visitante" && !form.telefone_celular.trim()) {
      return toast.error("Telefone é obrigatório para visitantes");
    }

    setBusy(true);

    // ── Montar payload ─────────────────────────────────────────────────
    const payload: any = { ...form, nome_completo: form.nome_completo.trim() };

    // Normaliza telefone para formato canônico (55DDDNNNNNNNNN).
    if (payload.telefone_celular) {
      const valid = validarTelefone(payload.telefone_celular);
      if (!valid.ok) { setBusy(false); return toast.error(valid.erro!); }
      payload.telefone_celular = normalizarTelefone(payload.telefone_celular);
    }

    // "Dispensado" só quer dizer algo sem telefone. Com telefone preenchido a
    // caixa some da tela, mas o valor continuaria no formulário — e ficaria
    // gravado dizendo que uma pessoa com celular não tem telefone próprio.
    //
    // O `!!` também protege da linha abaixo: `"" → null` numa coluna
    // `boolean not null` seria erro de gravação, e o cadastro não salvaria.
    payload.telefone_dispensado = !payload.telefone_celular && !!payload.telefone_dispensado;

    // Strings vazias → null
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });

    // FASE C: membros.perfil_acesso é COLUNA LEGADA. Fonte de verdade do acesso é user_roles.role.
    // Sempre gravamos null aqui para não criar dado fantasma.
    payload.perfil_acesso = null;

    // Campos exclusivos de visitante
    if (!membro && payload.tipo_pessoa === "visitante") {
      payload.numero_visitas    = 1;
      payload.status_acolhimento = "novo";
      payload.status            = "ativo";
    }

    // ── Salvar ─────────────────────────────────────────────────────────
    let savedId: string | null = null;
    let error: any;

    if (membro) {
      // O .select() nao e enfeite: sem ele, um UPDATE barrado pela politica de
      // seguranca chega aqui como sucesso com zero linhas alteradas, e o
      // formulario fecha anunciando que salvou. Foi o que vinha acontecendo com
      // todo lider que editava uma pessoa — telefone corrigido, nascimento
      // preenchido, tudo descartado com mensagem de sucesso.
      const { data: alterados, error: e } = await supabase
        .from("membros").update(payload).eq("id", membro.id).select("id");
      error = e;
      if (!e && (alterados?.length ?? 0) === 0) {
        setBusy(false);
        return toast.error("Você não tem permissão para alterar esta pessoa. Nada foi salvo.");
      }
    } else {
      const { data, error: e } = await supabase.from("membros").insert(payload).select("id").single();
      error = e;
      savedId = data?.id ?? null;
    }

    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }

    // Sincronizar vínculos com áreas (area_voluntarios)
    const pessoaId = membro?.id ?? savedId;
    if (pessoaId) {
      try {
        // Buscar áreas atuais (status='ativa')
        const { data: atuais } = await supabase
          .from("area_voluntarios")
          .select("id, area_id")
          .eq("membro_id", pessoaId)
          .eq("status", "ativa");
        const atuaisSet = new Set((atuais ?? []).map((a: any) => a.area_id));

        // Adicionar novos: precisa do ministerio_id da área
        const novos = [...areasSelecionadas].filter(id => !atuaisSet.has(id));
        if (novos.length > 0) {
          // Buscar ministerio_id de cada área nova
          const { data: areasInfo } = await supabase
            .from("areas")
            .select("id, ministerio_id")
            .in("id", novos);
          const infoMap = new Map((areasInfo ?? []).map((a: any) => [a.id, a.ministerio_id]));
          const hoje = new Date().toISOString().slice(0, 10);
          await supabase.from("area_voluntarios").insert(
            novos.map(areaId => ({
              area_id:       areaId,
              ministerio_id: infoMap.get(areaId),
              membro_id:     pessoaId,
              // "Voluntário" deixa de ser a única resposta e passa a ser o
              // recuo de quem não informou. Continua sendo o genérico que a
              // composição do painel lê como ausência — e é honesto: ninguém
              // disse o que a pessoa faz.
              // A coluna é NOT NULL e ninguém mais a lê: quem responde "o que
              // esta pessoa faz" é `area_voluntario_funcoes`. Fica o genérico
              // até a coluna ser aposentada (A·7 do plano).
              funcao:        "Voluntário",
              data_inicio:   hoje,
              status:        "ativa",
            }))
          );
        }

        // Encerrar removidos (status='encerrada')
        const removidos = [...atuaisSet].filter(id => !areasSelecionadas.has(id));
        if (removidos.length > 0) {
          await supabase
            .from("area_voluntarios")
            .update({ status: "encerrada", data_fim: new Date().toISOString().slice(0, 10) })
            .eq("membro_id", pessoaId)
            .in("area_id", removidos)
            .eq("status", "ativa");
        }
      } catch (e: any) {
        console.warn("Sync de áreas falhou:", e?.message);
      }
    }

    // Perfil de serviço — gravação lateral, como as áreas logo acima.
    //
    // Silencia a falha de propósito, no mesmo espírito do sync de áreas: o
    // cadastro da pessoa JÁ foi salvo neste ponto, e derrubar o formulário
    // inteiro porque a disponibilidade não gravou faria a secretária refazer
    // tudo. Mas AVISA — porque, ao contrário do que acontecia antes nesta
    // base, um "salvo" que esconde uma gravação perdida é pior que o erro.
    // `areasSelecionadas.size > 0` também: se a pessoa deixou de servir em
    // toda área, gravar disponibilidade seria guardar resposta de uma
    // pergunta que a tela deixou de fazer.
    if (pessoaId && perfilTocado && areasSelecionadas.size > 0) {
      const r = await salvarPerfil(pessoaId, perfil);
      if (!r.ok) toast.warning("Cadastro salvo, mas a disponibilidade não: " + r.erro);
    }

    // EBD: sincronizar matrícula
    const pessoaIdEbd = membro?.id ?? savedId;
    if (pessoaIdEbd) {
      try {
        const atuais = await classesDaPessoa(pessoaIdEbd);
        const atualId = atuais[0]?.classe_id ?? null;
        if (ebdClasseSelecionada && ebdClasseSelecionada !== atualId) {
          // Desativar matrículas anteriores
          for (const a of atuais) {
            await supabase
              .from("ebd_matriculas")
              .update({ ativo: false })
              .eq("pessoa_id", pessoaIdEbd)
              .eq("classe_id", a.classe_id)
              .eq("ativo", true);
          }
          await supabase
            .from("ebd_matriculas")
            .insert({ pessoa_id: pessoaIdEbd, classe_id: ebdClasseSelecionada, ativo: true });
        } else if (!ebdClasseSelecionada && atualId) {
          // Removeu a classe
          await supabase
            .from("ebd_matriculas")
            .update({ ativo: false })
            .eq("pessoa_id", pessoaIdEbd)
            .eq("ativo", true);
        }
      } catch (e: any) {
        console.warn("EBD sync falhou:", e?.message);
      }
    }

    // Tarefas de acolhimento so para novos visitantes
    if (!membro && savedId && payload.tipo_pessoa === "visitante") {
      await criarTarefasAcolhimento(savedId, form.nome_completo.trim());
      toast.success("Visitante registrado! Tarefas de acolhimento criadas");
    } else {
      toast.success(membro ? "Pessoa atualizada" : "Pessoa cadastrada");
    }

    setBusy(false);
    onOpenChange(false);
    onSaved();
  };

  // ── Excluir ────────────────────────────────────────────────────────────
  //
  // Excluir uma pessoa nao apaga so a pessoa. Sao 61 tabelas apontando para
  // `membros`: 40 apenas soltam o vinculo, mas DEZESSEIS apagam em cascata —
  // entre elas presencas de EBD, presencas de PGM, vinculos familiares,
  // historico do membro e presenca em assembleias. Anos de chamada somem
  // junto, e a confirmacao dizia apenas "tem certeza?".
  //
  // Este levantamento conta o que sera perdido para mostrar ANTES, na propria
  // confirmacao. Nao impede nada: informa.
  const [oQueSePerde, setOQueSePerde] = useState<string[] | null>(null);

  const levantarVinculos = async (pessoaId: string) => {
    setOQueSePerde(null);
    const alvos: { tabela: string; coluna: string; rotulo: (n: number) => string }[] = [
      { tabela: "ebd_presencas",         coluna: "pessoa_id", rotulo: n => `${n} ${n === 1 ? "presença" : "presenças"} na EBD` },
      { tabela: "ebd_matriculas",        coluna: "pessoa_id", rotulo: n => `${n} ${n === 1 ? "matrícula" : "matrículas"} na EBD` },
      { tabela: "pgm_presencas",         coluna: "pessoa_id", rotulo: n => `${n} ${n === 1 ? "presença" : "presenças"} em Pequenos Grupos` },
      { tabela: "vinculos_familiares",   coluna: "pessoa_id", rotulo: n => `${n} ${n === 1 ? "vínculo familiar" : "vínculos familiares"}` },
      { tabela: "historico_membro",      coluna: "membro_id", rotulo: n => `${n} ${n === 1 ? "registro" : "registros"} de histórico` },
      // area_voluntarios entrou aqui em 19/08/2026, junto com a chave
      // estrangeira ON DELETE CASCADE. Antes, apagar uma pessoa deixava o
      // vinculo de voluntario para tras, orfao e invisivel — foi assim que
      // 36 deles se acumularam. Agora o vinculo some junto, e por isso
      // precisa aparecer no aviso: o que some tem de ser dito antes.
      { tabela: "area_voluntarios",      coluna: "membro_id", rotulo: n => `${n} ${n === 1 ? "área em que serve" : "áreas em que serve"}` },
      { tabela: "escala_voluntarios",    coluna: "membro_id", rotulo: n => `${n} ${n === 1 ? "escala" : "escalas"} de voluntário` },
    ];
    const achados: string[] = [];
    for (const a of alvos) {
      const { count } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(a.tabela as any)
        .select("*", { count: "exact", head: true })
        .eq(a.coluna, pessoaId);
      if ((count ?? 0) > 0) achados.push(a.rotulo(count!));
    }
    setOQueSePerde(achados);
  };

  const onDelete = async () => {
    if (!membro) return;
    setBusy(true);
    const resultado = await supabase.from("membros").delete().eq("id", membro.id).select("id");
    setBusy(false);
    const { error } = resultado;
    if (error) {
      // A mensagem crua do Postgres — "violates foreign key constraint
      // arr_vendas_membro_id_fkey" — nao diz nada a quem esta na secretaria.
      // Mas dizer "Bazar e Cantina" para QUALQUER violacao de chave era
      // pior: desde 19/08 ha chaves novas em area_voluntarios, e um erro
      // vindo delas mandaria a secretaria procurar uma venda que nao existe.
      // Agora a mensagem le o nome da constraint e diz o lugar certo.
      const bloqueio = /foreign key|violates/i.test(error.message);
      const doBazar  = /\barr_/.test(error.message);
      return toast.error(
        bloqueio
          ? (doBazar
              ? "Esta pessoa tem movimentações no Bazar e Cantina e não pode ser excluída. Marque como inativa."
              : "Esta pessoa tem registros que impedem a exclusão. Marque como inativa — o histórico continua, e ela sai das listas.")
          : "Erro ao excluir: " + error.message,
      );
    }
    // O bloco acima cobre o erro que o Postgres levanta. Falta o outro caso: a
    // politica de DELETE em `membros` e `admin`+`secretaria`, e quando ela barra
    // nao ha erro nenhum — zero linhas e sucesso. Sem esta conferencia a ficha
    // sumia da tela e voltava no proximo carregamento.
    const r = conferir(resultado, "O contato");
    if (!r.ok) return toast.error(r.erro);
    toast.success("Contato excluído");
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  };

  const tipo = form.tipo_pessoa as string;
  const isVisitante   = tipo === "visitante";
  const isCongregado  = tipo === "congregado";
  const isMembro      = tipo === "membro";
  const mostraCasamento = form.estado_civil === "casado";
  const mostraQuemConvidou = PRECISA_QUEM_CONVIDOU.includes(form.como_conheceu);
  const mostraDescreva = form.como_conheceu === "outros";
  const idadeEstimada = calcIdade(form.data_nascimento);
  const candidatoMembresia = isCongregado && form.data_nascimento && idadeEstimada >= 9;

  const tituloDialog = membro
    ? "Editar pessoa"
    : isVisitante ? "Novo visitante"
    : isCongregado ? "Novo congregado"
    : "Novo membro";

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl" translate="no">
              {tituloDialog}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">

            {/* ── INDICADOR DE PASSOS ── */}
            <div className="flex items-center justify-between gap-1 pt-1">
              {([
                { n: 1 as const, label: "Identificação" },
                { n: 2 as const, label: "Contato" },
                { n: 3 as const, label: "Vínculos" },
                { n: 4 as const, label: "Quando serve", inativo: areasSelecionadas.size === 0 },
                { n: 5 as const, label: "Acesso" },
                { n: 6 as const, label: "Revisão" },
              ]).map((p, idx, arr) => (
                <div key={p.n} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => setStep(p.n)}
                    className={`flex flex-col items-center gap-1 ${step === p.n ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                      (p as any).inativo && step !== p.n ? "bg-muted border-dashed border-border text-muted-foreground/60"
                        : step === p.n ? "bg-gold text-white border-gold"
                        : step > p.n ? "bg-success/15 text-success-text border-success-line/40"
                        : "bg-muted border-border"
                    }`}>
                      {step > p.n ? "✓" : p.n}
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wide">{p.label}</span>
                  </button>
                  {idx < arr.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mb-4 ${step > p.n ? "bg-success/40" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>

            {step === 1 && (<>
            {/* ── TIPO DE PESSOA ── */}
            <div>
              <Label translate="no">Tipo de pessoa *</Label>
              <Select
                value={form.tipo_pessoa}
                onValueChange={(v) => {
                  set("tipo_pessoa", v);
                  set("como_conheceu", "");
                  set("quem_convidou_id", "");
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visitante">Visitante</SelectItem>
                  <SelectItem value="congregado">Congregado</SelectItem>
                  <SelectItem value="membro">Membro</SelectItem>
                </SelectContent>
              </Select>
              {isVisitante && (
                <p className="text-xs text-muted-foreground mt-1" translate="no">
                  Cadastro rápido — pode virar congregado depois sem perder o histórico.
                </p>
              )}
            </div>

                        </>)}

            {step === 1 && (<>
            {/* ── CAMPOS BASICOS (todos os tipos) ── */}
            <section className="grid md:grid-cols-2 gap-3">

              <div className="md:col-span-2">
                <Label translate="no">Nome completo *</Label>
                <Input required value={form.nome_completo} onChange={(e) => set("nome_completo", e.target.value)} />
              </div>

              <div>
                <Label translate="no">
                  Telefone celular {isVisitante && <span className="text-destructive">*</span>}
                </Label>
                <TelefoneInput
                  value={form.telefone_celular}
                  onChange={(v) => set("telefone_celular", v)}
                />
                {/* ── Dispensar o telefone ────────────────────────────────
                    Só com o campo vazio. Com telefone preenchido a caixa não
                    quereria dizer nada, e uma caixa que não muda nada é uma
                    pergunta a mais em cada cadastro.

                    Fora para visitante: ali o telefone é obrigatório de
                    verdade — sem ele não há acolhimento, que é a razão de o
                    visitante estar no sistema.

                    O texto não diz "criança" porque a regra não é essa: é
                    "não tem telefone próprio". Vale para o idoso que usa o
                    telefone do filho e para quem é contatado pela família.
                    Criança é o caso mais comum, não o único. */}
                {!isVisitante && !form.telefone_celular?.trim() && (
                  <label className="flex items-start gap-2 mt-2 cursor-pointer">
                    <Checkbox
                      checked={!!form.telefone_dispensado}
                      onCheckedChange={(v) => set("telefone_dispensado", !!v)}
                      className="mt-0.5"
                    />
                    <span className="text-xs text-muted-foreground leading-snug">
                      <span className="font-medium text-foreground">Não tem telefone próprio</span>
                      {" "}— criança, ou quem é contatado pelo telefone de um
                      familiar. Sai da lista de cadastros a corrigir.
                    </span>
                  </label>
                )}
              </div>

              {(isCongregado || isMembro) && (
                <div>
                  <Label translate="no">E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
              )}

              <div>
                <Label translate="no">Sexo</Label>
                <Select value={form.sexo || undefined} onValueChange={(v) => set("sexo", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="feminino">Feminino</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ── Data de nascimento, inteira ou pela metade ──────────────
                  Medido em 27/08/2026: 53 das 294 pessoas ativas não tinham
                  data nenhuma, porque o sistema anterior guardava só o dia e
                  o mês de muita gente e este campo era tudo-ou-nada. O ano
                  que faltava mantinha essas pessoas fora dos ANIVERSÁRIOS —
                  que é o que a igreja de fato faz no dia — para proteger dois
                  indicadores que não dependem dele.

                  As duas colunas nunca convivem: o banco tem CHECK, e a
                  interface limpa uma ao ligar a outra. */}
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label translate="no">Data de nascimento</Label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="rounded border-border w-3.5 h-3.5 accent-dourado"
                      checked={semAnoNasc}
                      onChange={(e) => {
                        setSemAnoNasc(e.target.checked);
                        if (e.target.checked) {
                          set("data_nascimento", "");
                        } else {
                          set("nascimento_dia_mes", "");
                          setNascDia("");
                          setNascMes("");
                        }
                      }}
                    />
                    Não sei o ano
                  </label>
                </div>

                {semAnoNasc ? (
                  <>
                    {/* ── Dia com busca, mês por extenso ─────────────────
                        O dia se digita e a lista se estreita; o mês continua
                        sendo escolhido pelo nome, porque número de mês é o
                        tipo de coisa que ninguém confere.

                        Dia antes do mês: é a ordem brasileira, a ordem em que
                        se fala — "vinte e nove de agosto" — e a mesma do campo
                        de data completa que aparece quando o ano é conhecido.

                        A lista de dias tem o comprimento do mês escolhido, de
                        modo que 31 de junho não chega a ser oferecido. */}
                    <div className="grid grid-cols-[5rem_1fr] gap-2">
                      <DiaDoAniversario
                        valor={nascDia}
                        maximo={diasDoMes(nascMes)}
                        onChange={(d) => {
                          setNascDia(d);
                          set("nascimento_dia_mes", montarMeiaData(d, nascMes));
                        }}
                      />
                      <Select
                        value={nascMes || undefined}
                        onValueChange={(m) => {
                          setNascMes(m);
                          // Trocar o mês pode tornar o dia impossível — 31 de
                          // janeiro virando fevereiro. O dia é DESCARTADO, não
                          // corrigido: cortar 31 para 29 seria o sistema
                          // escolhendo um aniversário no lugar de quem sabe
                          // qual é. O MÊS fica, porque a pessoa acabou de
                          // escolhê-lo; some só o dia, e o campo pede de novo.
                          const cabe = Number(nascDia) <= diasDoMes(m);
                          if (!cabe) setNascDia("");
                          set("nascimento_dia_mes", montarMeiaData(cabe ? nascDia : "", m));
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger>
                        <SelectContent>
                          {MESES.map((nome, i) => (
                            <SelectItem key={i} value={String(i + 1)}>{nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
                      A pessoa passa a receber felicitação de aniversário.
                      <strong className="font-medium text-foreground"> O ano continua pendente</strong>{" "}
                      — sem ele ela fica fora da pirâmide etária e da fila do batismo.
                    </p>
                  </>
                ) : (
                  <Input type="date" value={form.data_nascimento} onChange={(e) => set("data_nascimento", e.target.value)} />
                )}

                {candidatoMembresia && (
                  <Badge variant="outline" className="mt-1 text-xs bg-primary/5">
                    Candidato a membresia ({idadeEstimada} anos)
                  </Badge>
                )}
              </div>

              {(isCongregado || isMembro) && (
                <>
                  <div>
                    <Label translate="no">Estado civil</Label>
                    <Select value={form.estado_civil || undefined} onValueChange={(v) => set("estado_civil", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                        <SelectItem value="casado">Casado(a)</SelectItem>
                        <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                        <SelectItem value="viuvo">Viuvo(a)</SelectItem>
                        <SelectItem value="uniao_estavel">Uniao estavel</SelectItem>
                        <SelectItem value="separado">Separado(a)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {mostraCasamento && (
                    <div>
                      <Label translate="no">Data de casamento</Label>
                      <Input type="date" value={form.data_casamento} onChange={(e) => set("data_casamento", e.target.value)} />
                    </div>
                  )}
                </>
              )}

              {isMembro && (
                <div>
                  <Label translate="no">CPF</Label>
                  <Input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
                </div>
              )}

            </section>

                        </>)}

            {step === 2 && (<>
            {/* ── ENDEREÇO (congregado e membro) ── */}
            {(isCongregado || isMembro) && (
              <>
                <h3 className="font-semibold text-sm mt-2 text-muted-foreground" translate="no">Endereço</h3>
                <CamposEndereco
                  cep={form.cep ?? ""}
                  endereco={form.endereco ?? ""}
                  numero={form.numero ?? ""}
                  complemento={form.complemento ?? ""}
                  bairro={form.bairro ?? ""}
                  cidade={form.cidade ?? ""}
                  onChange={(campo, valor) => set(campo, valor)}
                  disabled={busy}
                  mostrarNumero
                  mostrarComplemento
                  mostrarUf
                />
              </>
            )}

                        </>)}

            {step === 2 && (<>
            {/* ── ENDEREÇO VISITANTE (CEP + bairro + cidade) ── */}
            {isVisitante && (
              <CamposEndereco
                cep={form.cep ?? ""}
                endereco={form.endereco ?? ""}
                bairro={form.bairro ?? ""}
                cidade={form.cidade ?? ""}
                onChange={(campo, valor) => set(campo, valor)}
                disabled={busy}
                mostrarNumero={false}
                mostrarComplemento={false}
              />
            )}

                        </>)}

            {step === 1 && (<>
            {/* ── CAMPOS VISITANTE ── */}
            {isVisitante && (
              <>
                <h3 className="font-semibold text-sm mt-2 text-muted-foreground" translate="no">Visita</h3>
                <section className="grid md:grid-cols-2 gap-3">

                  <div className="md:col-span-2">
                    <Label translate="no">Data da visita *</Label>
                    <Input type="date" value={form.data_entrada} onChange={(e) => set("data_entrada", e.target.value)} />
                  </div>

                  <div className="md:col-span-2">
                    <Label translate="no">Como conheceu a igreja?</Label>
                    <Select
                      value={form.como_conheceu || undefined}
                      onValueChange={(v) => {
                        set("como_conheceu", v);
                        set("quem_convidou_id", "");
                        set("como_conheceu_descricao", "");
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {COMO_CONHECEU_OPTS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {mostraQuemConvidou && (
                    <div className="md:col-span-2 space-y-1">
                      <Label translate="no">Quem convidou?</Label>
                      <BuscaPessoa
                        value={form.quem_convidou_id || ""}
                        onChange={(id) => set("quem_convidou_id", id)}
                        tipos={["membro", "congregado", "visitante"]}
                        ignorarIds={membro ? [membro.id] : []}
                      />
                    </div>
                  )}

                  {mostraDescreva && (
                    <div className="md:col-span-2">
                      <Label translate="no">Descreva como conheceu</Label>
                      <Textarea rows={2} value={form.como_conheceu_descricao}
                        onChange={(e) => set("como_conheceu_descricao", e.target.value)} />
                    </div>
                  )}
                </section>
              </>
            )}

                        </>)}

            {step === 1 && (<>
            {/* ── SITUACAO (congregado e membro) ── */}
            {(isCongregado || isMembro) && (
              <>
                <h3 className="font-semibold text-sm mt-2 text-muted-foreground" translate="no">Situação</h3>
                <section className="grid md:grid-cols-2 gap-3">

                  {/* Data de entrada — apenas para MEMBRO */}
                  {isMembro && (
                    <div>
                      <Label translate="no">Data de entrada</Label>
                      <Input type="date" value={form.data_entrada} onChange={(e) => set("data_entrada", e.target.value)} />
                      {/* A dica dizia "Data do batismo/profissão de fé" e
                          supunha o tipo mais comum. Para quem veio por carta
                          de outra igreja isso estava errado, e não havia onde
                          corrigir. O campo ao lado passou a dizer COMO, e a
                          dica agora aponta para ele em vez de adivinhar. */}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Data em que entrou no rol — ver o tipo ao lado.
                      </p>
                    </div>
                  )}

                  {/* ── Tipo de entrada — logo depois da data ──────────────
                      Uma diz quando, a outra como. É o que a secretaria
                      precisa para emitir carta e para responder à assembleia
                      "quantos batismos tivemos este ano?" — pergunta que não
                      tinha resposta enquanto as quatro formas de entrar
                      estavam somadas numa coluna só.

                      **Profissão de fé não está na lista**, e isso é
                      doutrina, não esquecimento: ela antecede o batismo, é
                      pré-requisito dele. Oferecê-la ao lado de "Batismo"
                      faria escolher entre duas metades do mesmo
                      acontecimento. */}
                  {isMembro && (
                    <div>
                      <Label translate="no">Tipo de entrada</Label>
                      <Select
                        value={form.tipo_entrada || undefined}
                        onValueChange={(v) => set("tipo_entrada", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Não registrado" />
                        </SelectTrigger>
                        {/* A lista sai do mesmo mapa que a Revisão lê: duas
                            listas escritas à mão é como a tela e o resumo
                            passam a discordar sobre a mesma pessoa. */}
                        <SelectContent>
                          {Object.entries(TIPO_ENTRADA_LABEL).map(([valor, rotulo]) => (
                            <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className={isMembro ? "" : "md:col-span-2"}>
                    <Label translate="no">{isMembro ? "Status do membro" : "Status do congregado"}</Label>
                    <Select value={form.status || "ativo"} onValueChange={trocarStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {isMembro ? (
                          <>
                            <SelectItem value="ativo">Ativo</SelectItem>
                            {/* "Ausente" no lugar de "afastamento", trocado a
                                pedido em 26/08/2026. O valor gravado continua
                                sendo `inativo` — muda só a palavra que a
                                igreja lê. */}
                            <SelectItem value="inativo">Inativo (Ausente)</SelectItem>
                            <SelectItem value="transferido">Transferido</SelectItem>
                            <SelectItem value="desligado">Desligado</SelectItem>
                            <SelectItem value="falecido">Falecido</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="ativo">Ativo</SelectItem>
                            <SelectItem value="inativo">Inativo</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* ── Data de saída ────────────────────────────────────
                      Só aparece com transferido, desligado ou falecido —
                      os três que tiram do rol. Inativo não a pede: quem
                      está afastado não saiu.

                      **Sem esta data a saída não existe para o sistema.**
                      O gráfico de Movimento de Membros põe cada saída no
                      ano dela; sem ano, a pessoa fica contada à parte, num
                      rodapé, e nunca vira barra. Por isso o campo é
                      obrigatório quando aparece. */}
                  {isMembro && saindoDoRol && (
                    <div className="md:col-span-2">
                      <Label translate="no">
                        Data de saída <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        required
                        value={form.data_saida || ""}
                        onChange={(e) => set("data_saida", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {form.status === "falecido"
                          ? "Data do falecimento."
                          : form.status === "transferido"
                          ? "Data da transferência para a outra igreja."
                          : "Data em que a assembleia aprovou o desligamento."}
                        {" "}Quem registrar fica assinado na ficha.
                      </p>
                    </div>
                  )}

                  {/* FASE B: Bloco "Perfil de acesso no sistema" REMOVIDO.
                      O acesso ao sistema vive em user_roles.role e é gerenciado pelo
                      bloco "Acesso ao sistema" abaixo (Toggle + AcessoCard). */}

                  <div className="md:col-span-2">
                    <Label translate="no">Observacoes pastorais</Label>
                    <Textarea
                      value={form.observacoes_pastorais}
                      onChange={(e) => set("observacoes_pastorais", e.target.value)}
                      placeholder="Anotacoes internas (visivel apenas para lideranca)"
                      rows={3}
                    />
                  </div>
                </section>
              </>
            )}

                        </>)}

            {step === 3 && (<>
            {/* ── EBD ── */}
            {(isCongregado || isMembro) && ebdClasses.length > 0 && (
              <div className="pt-2 space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1.5" translate="no">
                  <GraduationCap className="w-3.5 h-3.5" /> Classe EBD
                </h3>
                <Select value={ebdClasseSelecionada || undefined} onValueChange={setEbdClasseSelecionada}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar classe..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>— Nenhuma —</SelectItem>
                    {ebdClasses.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                        {ebdSugestaoId === c.id && " ✨"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ebdSugestaoId && (
                  <p className="text-xs text-muted-foreground">
                    ✨ Sugestão pela idade e sexo: {ebdClasses.find(c => c.id === ebdSugestaoId)?.nome ?? "—"}
                  </p>
                )}
              </div>
            )}

                        </>)}

            {/* ── STEP 3 — FUNÇÕES NA IGREJA ── */}
            {step === 3 && (isCongregado || isMembro) && (<>
            <div className="space-y-3 pt-1">
              <div>
                <Label translate="no">Funções ministeriais</Label>
                {/* Caixas, e não seletor: há quem acumule — diácono que também
                    é tesoureiro, pastor auxiliar que também é ministro. Com um
                    seletor, escolher a segunda função apagava a primeira em
                    silêncio.

                    Fica aqui, em Vínculos, e não no passo de Acesso: função na
                    igreja e permissão de login são coisas diferentes — há
                    diácono que nunca abriu o sistema e secretária com acesso e
                    nenhuma função. */}
                {abrirFuncoes && (
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                    Marque quantas a pessoa exercer. A primeira da ordem abaixo é a
                    principal e aparece no catálogo.
                  </p>
                )}

                {/* Fechado, o resumo responde "o que esta pessoa faz". As
                    etiquetas saem na mesma ordem do catálogo, então a
                    primeira é a principal — a mesma regra do texto acima,
                    sem precisar repetir a frase. */}
                {!abrirFuncoes && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-2">
                    {funcoesSelecionadas.length > 0 ? (
                      funcoesSelecionadas.map(f => (
                        <Badge key={f} variant="secondary" className="text-xs font-medium">
                          {rotuloFuncao(f)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Nenhuma função marcada</span>
                    )}
                    <Button
                      type="button" size="sm" variant="ghost"
                      onClick={() => setAbrirFuncoes(true)}
                      className="h-7 px-2 text-xs text-primary"
                    >
                      Alterar
                    </Button>
                  </div>
                )}

                <div className={`grid sm:grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border p-3 ${abrirFuncoes ? "" : "hidden"}`}>
                  {/* A função aposentada que a pessoa JÁ TEM aparece marcada, com
                      aviso. Três pessoas estão em rótulos sem numeração — dois
                      tesoureiros e uma secretária que ninguém sabe se são 1º ou
                      2º. Escondê-las desmarcaria o cargo de alguém por causa de
                      um detalhe de implementação. */}
                  {funcoesSelecionadas.filter(funcaoAposentada).map((f) => (
                    <label key={f} className="flex items-center gap-2 text-sm min-h-[32px] text-warning-text">
                      <Checkbox checked onCheckedChange={() => alternarFuncao(f)} />
                      {rotuloFuncao(f)} <span className="text-xs">(a revisar)</span>
                    </label>
                  ))}

                  {FUNCOES_EM_ORDEM.filter((f) => f !== "membro").map((f) => (
                    <label key={f} className="flex items-center gap-2 text-sm min-h-[32px] cursor-pointer">
                      <Checkbox
                        checked={funcoesSelecionadas.includes(f)}
                        onCheckedChange={() => alternarFuncao(f)}
                      />
                      {FUNCAO_MINISTERIAL[f].label}
                    </label>
                  ))}
                </div>

                {/* Sem nenhuma marcada, "membro" — que no enum quer dizer
                    ausência de função, e não um cargo. */}
                {funcoesSelecionadas.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Nenhuma função marcada: a pessoa fica como Membro.
                  </p>
                )}
              </div>

              {/* Uma data por ato, e só a das funções marcadas. Consagração
                  pastoral, ordenação diaconal e comissionamento missionário não
                  são sinônimos: um campo genérico "data da função" apagaria a
                  diferença justamente para quem ela importa. */}
              {funcoesSelecionadas
                .filter((f) => FUNCAO_MINISTERIAL[f].tipoData === "consagracao")
                // Duas funções podem apontar para a MESMA coluna (os quatro
                // pastores usam a consagração pastoral). Sem isto, marcar duas
                // desenharia dois campos que gravam no mesmo lugar.
                .filter((f, i, todas) =>
                  todas.findIndex((o) => FUNCAO_MINISTERIAL[o].coluna === FUNCAO_MINISTERIAL[f].coluna) === i)
                .map((f) => {
                  const cfg = FUNCAO_MINISTERIAL[f];
                  if (!cfg.coluna) return null;
                  return (
                    <div key={f} className="md:w-1/2">
                      <Label translate="no">{cfg.rotuloData}</Label>
                      <Input
                        type="date"
                        value={form[cfg.coluna] ?? ""}
                        onChange={(e) => set(cfg.coluna!, e.target.value)}
                      />
                    </div>
                  );
                })}

              {/* Vigência: um par de datas, e vale para a função PRINCIPAL.
                  Foi decisão consciente — quem acumular dois cargos de mandato
                  vai ter as duas datas descrevendo só o primeiro. Hoje ninguém
                  acumula; no dia em que acumular, isto vira tabela própria. */}
              {funcoesSelecionadas.some((f) => FUNCAO_MINISTERIAL[f].tipoData === "vigencia") && (
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label translate="no">Assumiu em</Label>
                    <Input type="date" value={form.funcao_inicio ?? ""}
                      onChange={(e) => set("funcao_inicio", e.target.value)} />
                  </div>
                  <div>
                    <Label translate="no">Até</Label>
                    <Input type="date" value={form.funcao_fim ?? ""}
                      onChange={(e) => set("funcao_fim", e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-1">
                      Registro histórico — não gera alerta de vencimento.
                      {funcoesSelecionadas.filter((f) => FUNCAO_MINISTERIAL[f].tipoData === "vigencia").length > 1
                        && " Vale para a função principal."}
                    </p>
                  </div>
                </div>
              )}
            </div>
                        </>)}

            {step === 3 && (<>
            {/* ── ÁREAS DE ATUAÇÃO (agrupadas por ministério) ── */}
            {(isCongregado || isMembro) && areasPorMinisterio.length > 0 && (
              <div className="pt-2 space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1.5" translate="no">
                  <Heart className="w-3.5 h-3.5" /> Áreas de atuação
                </h3>
                {abrirAreas && (
                  <p className="text-xs text-muted-foreground">
                    Em quais áreas esta pessoa serve? (Pode marcar mais de uma; agrupadas pelo ministério.)
                  </p>
                )}

                {/* O nome da área sozinho não basta: há "Recepção" em mais de
                    um ministério, e fechado não existe o cabeçalho do grupo
                    para desempatar. Por isso o ministério vem junto. */}
                {!abrirAreas && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {areasSelecionadas.size > 0 ? (
                      areasPorMinisterio.flatMap(g =>
                        g.areas
                          .filter(a => areasSelecionadas.has(a.id))
                          .map(a => (
                            <Badge key={a.id} variant="secondary" className="text-xs font-medium">
                              {a.nome}
                              <span className="opacity-60 font-normal"> · {g.ministerio.nome}</span>
                            </Badge>
                          )),
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">Não serve em nenhuma área</span>
                    )}
                    <Button
                      type="button" size="sm" variant="ghost"
                      onClick={() => setAbrirAreas(true)}
                      className="h-7 px-2 text-xs text-primary"
                    >
                      Alterar
                    </Button>
                  </div>
                )}

                <div className={`space-y-3 max-h-72 overflow-y-auto rounded-md border p-3 ${abrirAreas ? "" : "hidden"}`}>
                  {areasPorMinisterio.map(grupo => (
                    <div key={grupo.ministerio.id} className="space-y-1.5">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/80 font-semibold">
                        {grupo.ministerio.nome}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {grupo.areas.map(a => {
                          const checked = areasSelecionadas.has(a.id);
                          const ehLider = !!membro && (a.lider_id === membro.id || a.co_lider_id === membro.id);
                          return (
                            <div key={a.id} className="min-w-0">
                              <label className="flex items-center gap-2 cursor-pointer text-sm hover:bg-muted/40 px-2 py-1 rounded">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    setAreasSelecionadas(prev => {
                                      const next = new Set(prev);
                                      if (v) next.add(a.id); else next.delete(a.id);
                                      return next;
                                    });
                                  }}
                                />
                                <span className="flex items-center gap-1 min-w-0">
                                  <span className="truncate">{a.nome}</span>
                                  {ehLider && (
                                    <span className="text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-destructive-soft text-destructive-text border border-destructive-line shrink-0">
                                      Líder
                                    </span>
                                  )}
                                </span>
                              </label>

                              {/* O campo só aparece para área MARCADA, e só
                                  quando o vínculo ainda vai nascer: mudar a
                                  função de quem já serve é em Atuações, que
                                  confere a escrita e respeita o recorte de
                                  quem lidera. Aqui, um campo que não salvasse
                                  seria pior que campo nenhum. */}
                              {/* Havia aqui um campo livre "O que faz aqui?",
                                  de 02/09. Durou um dia: desde 03/09 o que a
                                  pessoa faz é um POSTO do catálogo da área, e
                                  um campo de texto ao lado de um catálogo é
                                  o convite a reescrever "Recepção" na função
                                  de quem serve na Recepção — que foi como os
                                  21 nomes de área entraram na coluna antiga.
                                  Este passo diz ONDE a pessoa serve. O posto
                                  é escolhido na equipe, onde o catálogo mora. */}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Quatro linhas de instrução sobre COMO marcar área. Fechado,
                    não há o que marcar, e elas custariam mais altura que a
                    própria lista que se quis recolher. */}
                {abrirAreas && (
                <p className="text-xs text-muted-foreground">
                  Aqui se marca <strong>onde</strong> a pessoa serve. O que ela <strong>faz</strong> em cada
                  área — o posto — escolhe-se em <strong>Ministérios → o ministério → Voluntários</strong>,
                  numa fileira de etiquetas ao lado do nome dela. Liderança não é posto: quem lidera a área
                  entra pelo cadastro da própria área. Líderes que também servem devem marcar-se aqui, senão
                  não aparecem nas escalas.
                </p>
                )}
              </div>
            )}

                        </>)}

            {step === 3 && (<>
            {/* ── FAMÍLIA (Fase A) ── */}
            {(isCongregado || isMembro) && (
              <FamiliaBloco
                pessoaId={membro?.id ?? null}
                nomeCompleto={form.nome_completo ?? ""}
                endereco={{
                  endereco: form.endereco ?? undefined,
                  numero: form.numero ?? undefined,
                  complemento: form.complemento ?? undefined,
                  bairro: form.bairro ?? undefined,
                  cidade: form.cidade ?? undefined,
                  cep: form.cep ?? undefined,
                }}
              />
            )}

                        </>)}

            {/* ── STEP 4 — ACESSO AO SISTEMA ── */}
            {step === 5 && (<>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Acesso ao sistema</p>
                {/* Dizer o que este passo NÃO é. Perfil de acesso é permissão de
                    login; liderar um ministério ou ensinar na EBD são vínculos, e
                    ficam no passo anterior. As duas coisas se chamam "perfil" na
                    conversa do dia a dia e vivem em tabelas diferentes — quem
                    procurar aqui para marcar alguém como líder do Louvor precisa
                    saber, na hora, que não é aqui. */}
                <p className="text-xs text-muted-foreground mt-0.5">
                  Permissão para entrar no sistema. Liderança de ministério e
                  professor de EBD são vínculos, e ficam no passo anterior.
                </p>
              </div>

              {(isCongregado || isMembro) && membro && (
                <AcessoCard
                  pessoaId={membro.id}
                  nomeCompleto={form.nome_completo || membro.nome_completo}
                  telefone={form.telefone_celular || membro.telefone_celular}
                />
              )}

              {/* Convite precisa de um id de pessoa para vincular. Em vez de um
                  passo em branco no cadastro novo, o passo explica a ordem: salvar
                  primeiro, convidar depois. */}
              {(isCongregado || isMembro) && !membro && (
                <p className="text-xs text-warning-text px-2 py-1.5 bg-warning-soft rounded border border-warning-line">
                  O convite de acesso é criado depois de salvar o cadastro. Termine
                  o cadastro e abra a pessoa de novo para conceder acesso.
                </p>
              )}

              {isVisitante && (
                <p className="text-xs text-muted-foreground px-2 py-1.5 bg-muted rounded border">
                  Acesso ao sistema é para membros e congregados. Visitante recebe
                  acesso quando passa a congregar.
                </p>
              )}
            </div>
                        </>)}

            {/* ── STEP 4 — QUANDO SERVE ──

                Antes de "Acesso", por pedido da Telma. E faz sentido: quem
                serve é assunto do voluntariado, que vem logo depois de
                Vínculos; dar acesso ao sistema é decisão administrativa, e
                fecha o cadastro junto com a revisão. */}
            {/* "Quando serve" só se aplica a quem serve em alguma área.

                A regra é da Telma e está certa: disponibilidade é informação
                de escala, e escala nasce de uma área. Perguntar a um
                visitante recém-cadastrado em que turnos ele pode servir é
                quatro cliques sobre nada — e das 282 pessoas, 74 servem.

                Mas o passo NÃO some da lista. Sumir mudaria a contagem de
                passos conforme o que se marca duas telas atrás, e o
                indicador passaria de 6 para 5 no meio do preenchimento. Foi
                exatamente uma numeração de passo fora de sincronia que
                travou este formulário ontem; não vou reintroduzir o problema
                em forma dinâmica.

                Então o passo continua lá, e explica por que está vazio — com
                o caminho de volta a um clique. Quem quiser registrar
                disponibilidade só precisa marcar a área primeiro. */}
            {step === 4 && (
              areasSelecionadas.size === 0 ? (
                <div className="rounded-md border border-border bg-muted/40 px-4 py-6 text-center space-y-3">
                  <p className="text-base font-medium">Esta pessoa ainda não serve em nenhuma área</p>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    A disponibilidade existe para montar escalas, e escala nasce de uma
                    área. Escolha ao menos uma no passo <strong>Vínculos</strong> e este
                    passo se abre.
                  </p>
                  <Button type="button" variant="outline" onClick={() => setStep(3)}>
                    ← Escolher uma área
                  </Button>
                </div>
              ) : (
                <PassoDisponibilidade
                  valor={perfil}
                  onChange={p => { setPerfil(p); setPerfilTocado(true); }}
                  novaPessoa={!membro}
                />
              )
            )}

            {/* ── STEP 6 — REVISÃO ── */}
            {step === 6 && (
              <section className="space-y-3">
                <div className="rounded-md border bg-gradient-verse p-4 text-center">
                  <h3 className="font-serif text-lg">Quase lá! Confira os dados</h3>
                  <p className="text-xs text-muted-foreground">
                    Revise antes de salvar. Clique em <strong>Anterior</strong> se precisar ajustar algo.
                  </p>
                </div>

                <RevisaoLinha label="Tipo">{tipoPessoaLabelMap[form.tipo_pessoa] ?? form.tipo_pessoa}</RevisaoLinha>
                <RevisaoLinha label="Nome">{form.nome_completo || "—"}</RevisaoLinha>
                <RevisaoLinha label="Telefone">{formatarTelefoneSemDDI(form.telefone_celular) || "—"}</RevisaoLinha>
                {(isCongregado || isMembro) && (
                  <>
                    <RevisaoLinha label="E-mail">{form.email || "—"}</RevisaoLinha>
                    <RevisaoLinha label="Sexo">{form.sexo || "—"}</RevisaoLinha>
                    {/* A revisão diz o estado, não só o campo: "só dia e mês"
                        é uma resposta, "—" não é. */}
                    <RevisaoLinha label="Data de nasc.">
                      {form.data_nascimento
                        || (form.nascimento_dia_mes
                            ? `${form.nascimento_dia_mes.slice(8, 10)}/${form.nascimento_dia_mes.slice(5, 7)} — falta o ano`
                            : "—")}
                    </RevisaoLinha>
                    <RevisaoLinha label="Estado civil">{form.estado_civil || "—"}</RevisaoLinha>
                    {isMembro && (
                      <RevisaoLinha label="Data de entrada">{form.data_entrada || "—"}</RevisaoLinha>
                    )}
                    {/* A revisão precisa revisar TODOS os campos: um que se
                        preenche e não se revê é um que ninguém confere. */}
                    {isMembro && (
                      <RevisaoLinha label="Tipo de entrada">
                        {TIPO_ENTRADA_LABEL[form.tipo_entrada as string] ?? "Não registrado"}
                      </RevisaoLinha>
                    )}
                    <RevisaoLinha label="Status">{form.status || "ativo"}</RevisaoLinha>
                    <RevisaoLinha label="Endereço">
                      {[form.endereco, form.numero, form.bairro, form.cidade]
                        .filter(Boolean).join(", ") || "—"}
                    </RevisaoLinha>
                    <RevisaoLinha label="Classe EBD">
                      {ebdClasseSelecionada
                        ? (ebdClasses.find(c => c.id === ebdClasseSelecionada)?.nome ?? "—")
                        : "—"}
                    </RevisaoLinha>
                    {/* O passo 3 tem TRÊS blocos e a revisão mostrava um.
                        Marcava-se Diácono e 1º Tesoureiro e salvava-se sem
                        nunca reler — justamente os campos com efeito no
                        estatuto da igreja. */}
                    {(isCongregado || isMembro) && (
                      <RevisaoLinha label="Funções ministeriais">
                        {funcoesSelecionadas.length > 0
                          ? funcoesSelecionadas.map(rotuloFuncao).join(", ")
                          : "Nenhuma"}
                      </RevisaoLinha>
                    )}
                    {/* "2 selecionada(s)" obriga a voltar para saber QUAIS.
                        Uma revisão que faz voltar não revisa nada. */}
                    <RevisaoLinha label="Áreas de atuação">
                      {areasSelecionadas.size === 0 ? "Nenhuma" : areasPorMinisterio
                        .flatMap(g => g.areas.filter(a => areasSelecionadas.has(a.id))
                          .map(a => `${a.nome} (${g.ministerio.nome})`))
                        .join(", ")}
                    </RevisaoLinha>
                    {/* A revisão precisa revisar TODOS os passos. Sem esta linha,
                        o passo 4 seria o único que a pessoa preenche e não vê
                        confirmado antes de salvar. */}
                    <RevisaoLinha label="Quando serve">
                      {areasSelecionadas.size === 0
                        ? "Não se aplica — não serve em nenhuma área"
                        : resumoLegivel(perfilTocado || membro ? perfil : null)}
                    </RevisaoLinha>
                  </>
                )}

                <p className="text-xs text-warning-text bg-warning-soft border border-warning-line rounded-md p-2 text-center">
                  Clique em <strong>Salvar</strong> para confirmar o cadastro.
                </p>
              </section>
            )}

            {/* ── FOOTER ── */}
            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              {isAdmin && membro && step === 1 && (
                <Button type="button" variant="destructive" className="sm:mr-auto gap-2"
                  onClick={() => { setConfirmDelete(true); levantarVinculos(membro.id); }} disabled={busy}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              )}
              {step > 1 ? (
                <Button type="button" variant="outline"
                  onClick={() => setStep(((step as number) - 1) as 1 | 2 | 3 | 4 | 5 | 6)}
                  disabled={busy}>
                  ← Anterior
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                  Cancelar
                </Button>
              )}

              {/* ── As duas `key` são o conserto de um bug de verdade ──────────
                  Sintoma: clicar em "Próximo" no penúltimo passo salvava o
                  cadastro e fechava o diálogo, sem nunca mostrar a Revisão.

                  Causa: os dois botões ocupam a mesma posição na árvore e são o
                  mesmo componente. Sem `key`, o React não troca o elemento — ele
                  só remenda o atributo `type` de "button" para "submit" no mesmo
                  nó do DOM. E o navegador decide a ação padrão do clique DEPOIS
                  de rodar os handlers: quando ele foi olhar, o botão que acabara
                  de ser clicado já dizia "submit", e o formulário foi enviado.

                  Medido com um ouvinte de eventos: click em "Próximo →
                  [type=button]" seguido de submit no FORM, sem ninguém pedir.

                  A guarda `if (step !== 6) return` no onSubmit não protege: o
                  setStep já rodou, então o submit chega com step = 6 e passa.

                  Com `key` diferente, o React desmonta um e monta o outro. O nó
                  clicado sai do documento antes da ação padrão, e não há submit.
                  ────────────────────────────────────────────────────────────── */}
              {/* `step < 6`, e não `< 5`. Ficou para trás quando o formulário
                  passou de cinco passos para seis: no penúltimo passo o botão
                  virava "Salvar", o onSubmit barrava com `step !== 6`, e o
                  clique não fazia NADA. A tela travava ali, sem erro nenhum. */}
              {/* ── Atalho de salvar ────────────────────────────────────
                  Pedido em 27/08/2026: preencher um campo do passo 1 custava
                  cinco cliques em "Próximo", por telas que não têm nada a ver
                  com o que se veio corrigir. Quem está arrumando o cadastro
                  repete isso dezenas de vezes seguidas.

                  **Só na EDIÇÃO.** Para gente nova o assistente existe por um
                  motivo: o efeito da EBD sugere uma classe a partir da data de
                  nascimento e a pré-seleciona, então salvar do passo 1
                  matricularia alguém numa classe que a secretaria não viu. Em
                  quem já existe não há sugestão automática — a matrícula lida
                  é a que já estava lá.

                  `type="button"` e chamada direta, e não `type="submit"`:
                  dois botões de submit no mesmo formulário fazem o Enter
                  disparar o primeiro, e o primeiro aqui seria o atalho. */}
              {membro && step < 6 && (
                <Button
                  key="salvar-atalho" type="button" variant="outline"
                  onClick={() => {
                    if (!form.nome_completo.trim()) {
                      toast.error("Informe o nome completo");
                      return;
                    }
                    onSubmit(undefined, true);
                  }}
                  disabled={busy}
                >
                  {busy ? "Salvando..." : "Salvar e fechar"}
                </Button>
              )}
              {step < 6 ? (
                <Button key="proximo" type="button"
                  onClick={() => {
                    // Valida campos obrigatórios do passo atual
                    if (step === 1 && !form.nome_completo.trim()) {
                      toast.error("Informe o nome completo");
                      return;
                    }
                    if (step === 1 && isVisitante && !form.telefone_celular.trim()) {
                      toast.error("Telefone é obrigatório para visitante");
                      return;
                    }
                    setStep(((step as number) + 1) as 1 | 2 | 3 | 4 | 5 | 6);
                  }}
                  disabled={busy}>
                  Próximo →
                </Button>
              ) : (
                <Button key="salvar" type="submit" disabled={busy}>
                  {busy ? "Salvando..." : membro ? "Salvar alterações" : `Cadastrar ${tipo}`}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmacao de exclusao */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Tem certeza que deseja excluir <strong>{membro?.nome_completo}</strong>?
                  Esta ação não pode ser desfeita.
                </p>
                {/* O que a cascata leva junto, contado no banco na hora de
                    abrir. Antes a pergunta era so "tem certeza?", e anos de
                    chamada de EBD podiam sumir sem que ninguem soubesse. */}
                {oQueSePerde === null ? (
                  <p className="text-xs text-muted-foreground">Verificando o que está vinculado…</p>
                ) : oQueSePerde.length > 0 ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                    <p className="text-xs font-medium text-destructive">
                      Isto também será apagado:
                    </p>
                    <ul className="mt-1 text-xs text-destructive/90 list-disc list-inside">
                      {oQueSePerde.map(t => <li key={t}>{t}</li>)}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Para preservar o histórico, marque a pessoa como inativa em vez de excluir.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nenhum histórico de EBD, Pequenos Grupos, família ou escala vinculado.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Helpers Revisão ──────────────────────────────────────────────────────
const tipoPessoaLabelMap: Record<string, string> = {
  visitante: "Visitante",
  congregado: "Congregado",
  membro: "Membro",
};

function RevisaoLinha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm border-b py-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-words min-w-0">{children}</span>
    </div>
  );
}
