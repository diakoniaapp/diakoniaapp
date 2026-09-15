// ─── omieImportService.ts — trazer histórico do Omie pro Diakonia ────────
//
// Fase seguinte ao roadmap de Fornecedores (docs/ROADMAP_FINANCEIRO_ERP.md):
// pedido direto da Telma em 13/09/2026, fora do roadmap original. Ao
// contrário da conciliação de OFX (`ofxService.ts`), que só CASA extrato
// com lançamento já existente, aqui não existe lançamento nenhum no
// Diakonia ainda — é histórico puro, então o caminho é CRIAR.
//
// Decisões da Telma (13/09/2026):
//   1. Fornecedor sem CNPJ cadastrado ainda → cria automaticamente.
//   2. CPF de quem deu dízimo/oferta → tenta vincular a um membro já
//      cadastrado.
//   3. Cada importação carimba um "lote" na observação
//      (`[lote:omie-<timestamp>]`), pra dar pra desfazer o lote inteiro
//      se algo vier errado — sem precisar de tabela nova.
//
// Revisto em 15/09/2026 (pedido direto, dois pedidos seguidos):
//
//   a) CPF sem membro correspondente NÃO fica mais de fora. Antes (decisão
//      13/09/2026) ficava sem `pessoa_id`, "fora do escopo de uma
//      importação financeira" — a Telma pediu pra virar automático, do
//      mesmo jeito que fornecedor por CNPJ já é, mas com uma escolha que
//      fornecedor não precisa: `tipo_pessoa` (membro ou congregado), já
//      que doação não prova vínculo formal de membresia. Por isso não dá
//      pra criar direto feito fornecedor — a tela pede a escolha por
//      pessoa (default "congregado", o vínculo mais conservador) antes de
//      confirmar. `pessoasACriar` no resumo lista quem entraria; cada
//      rascunho carrega o `cpfNaoEncontrado` bruto pra `confirmarImportacaoOmie`
//      conseguir religar depois de criar.
//
//   b) Trava contra duplicação, depois de um incidente real: o histórico
//      de 2025 do Bradesco foi importado duas vezes (dois lotes idênticos,
//      24s de diferença — a tela não fechava/resetava sozinha depois de
//      importar, nada impedia escolher o mesmo arquivo nem confirmar de
//      novo). Três camadas, cada uma pega um jeito diferente de duplicar:
//        - `calcularHashArquivo` (SHA-256 dos bytes) + tabela
//          `fin_import_arquivos` (`unique(conta_id, arquivo_hash)`,
//          migration 20260915160000): o MESMO arquivo não entra duas vezes
//          na MESMA conta — é o banco que recusa, não só a tela.
//        - `verificarSobreposicaoPeriodo`: arquivos DIFERENTES cobrindo
//          período que já tem lançamento nessa conta — avisa, não bloqueia
//          (reimportar um pedaço de propósito é uso legítimo).
//        - Duplicata DENTRO do mesmo arquivo (achada nos dados de 2024 do
//          Envelope, sem explicação clara — pode ser o próprio Omie
//          exportando a linha em dobro): `prepararImportacaoOmie` marca
//          `duplicataDeOutraLinha` na segunda ocorrência em diante de
//          (data+tipo+valor+categoria+descrição+documento+cpf) idênticos;
//          por padrão essas linhas NÃO entram — a tela mostra quantas são
//          e deixa incluir mesmo assim, pra não esconder um caso real de
//          dois pagamentos iguais no mesmo dia (aconteceu com tarifa
//          bancária repetida, que é legítima).
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import {
  listarCategoriasTodas, listarCentrosCusto, atualizarConta,
  type FinCategoria, type FinCentroCusto, type FinMovimentoTipo,
} from "./finService";
import {
  parseOmieXlsx, separarCategoriaEPercentuais, ehTransferencia, calcularHashArquivo,
  type OmieLinhaBruta,
} from "@/lib/omieImport";

export interface RascunhoOmie {
  data: string;
  tipo: FinMovimentoTipo;
  valor: number;
  categoriaBruta: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  ehTransferencia: boolean;
  descricao: string;
  documentoNumero: string | null;
  observacoes: string | null;
  cpfCnpj: string | null;
  fornecedorId: string | null;
  fornecedorNomeParaCriar: string | null;
  pessoaId: string | null;
  pessoaNome: string | null;
  /** CPF de quem deu (entrada, CPF de 11 dígitos) quando NENHUM membro
   *  existente bate — fica aqui pra `confirmarImportacaoOmie` religar
   *  depois de criar a pessoa nova (ver comentário do topo do arquivo,
   *  15/09/2026). `null` quando já vinculou (`pessoaId` preenchido) ou
   *  quando a linha não é entrada com CPF de pessoa física. */
  cpfNaoEncontrado: string | null;
  departamentoBruto: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
  /** true a partir da 2ª ocorrência de uma combinação idêntica de
   *  (data+tipo+valor+categoria+descrição+documento+cpf) dentro do MESMO
   *  arquivo — ver comentário do topo. Por padrão estas linhas não entram
   *  em `confirmarImportacaoOmie` a menos que `incluirDuplicatasDoArquivo`
   *  seja passado. */
  duplicataDeOutraLinha: boolean;
}

export interface PessoaACriar {
  cpf: string;
  nome: string;
}

export interface ResumoImportacaoOmie {
  totalLinhas: number;
  totalEntradas: number;
  totalSaidas: number;
  categoriasNaoEncontradas: string[];
  fornecedoresACriar: number;
  pessoasVinculadas: number;
  saldoAnterior: number | null;
  centrosVinculados: number;
  departamentosNaoEncontrados: string[];
  /** CPFs de entrada sem membro correspondente — a tela pergunta, pessoa
   *  por pessoa, se é membro (não estava cadastrado) ou congregado antes
   *  de criar (15/09/2026, ver comentário do topo). */
  pessoasACriar: PessoaACriar[];
  /** Quantas linhas são duplicata exata de outra linha do MESMO arquivo —
   *  ver `RascunhoOmie.duplicataDeOutraLinha`. */
  duplicatasNoArquivo: number;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export async function lerArquivoOmie(file: File): Promise<{
  linhas: OmieLinhaBruta[]; saldoAnterior: number | null; hash: string; nomeArquivo: string;
}> {
  const buffer = await file.arrayBuffer();
  const [{ linhas, saldoAnterior }, hash] = await Promise.all([
    Promise.resolve(parseOmieXlsx(buffer)),
    calcularHashArquivo(buffer),
  ]);
  return { linhas, saldoAnterior, hash, nomeArquivo: file.name };
}

/** Já existe uma importação bem-sucedida deste MESMO arquivo (mesmo hash)
 *  nesta conta? A tabela `fin_import_arquivos` é quem garante isto de
 *  verdade (constraint `unique(conta_id, arquivo_hash)`) — esta função é
 *  só a checagem ANTECIPADA, pra avisar antes de tentar, não a trava em
 *  si (ver comentário do topo do arquivo). */
export async function verificarArquivoJaImportado(
  contaId: string, hash: string,
): Promise<{ lote_tag: string; qtd_linhas: number; importado_em: string; data_min: string | null; data_max: string | null } | null> {
  const { data, error } = await supabase
    .from("fin_import_arquivos")
    .select("lote_tag, qtd_linhas, importado_em, data_min, data_max")
    .eq("conta_id", contaId)
    .eq("arquivo_hash", hash)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Quantos lançamentos essa conta JÁ TEM no intervalo de datas do arquivo
 *  que está prestes a ser importado — não bloqueia (reimportar um pedaço
 *  de período de propósito é uso legítimo, ex.: corrigir um mês), só avisa
 *  antes de confirmar. Qualquer origem conta (manual, transferência,
 *  importação anterior) — o que importa é se JÁ TEM MOVIMENTO ali, não de
 *  onde veio. */
export async function verificarSobreposicaoPeriodo(
  contaId: string, dataInicio: string, dataFim: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("fin_lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("conta_id", contaId)
    .gte("data", dataInicio)
    .lte("data", dataFim);
  if (error) throw error;
  return count ?? 0;
}

export async function prepararImportacaoOmie(
  linhasBrutas: OmieLinhaBruta[],
  saldoAnterior: number | null,
): Promise<{ rascunhos: RascunhoOmie[]; resumo: ResumoImportacaoOmie }> {
  const [categorias, centros] = await Promise.all([
    listarCategoriasTodas(),
    listarCentrosCusto(),
  ]);
  const mapaCategoria = new Map<string, FinCategoria>();
  for (const c of categorias) {
    const chave = normalizar(c.nome);
    // Se houver categoria ativa E inativa com o mesmo nome, a ativa vence.
    if (!mapaCategoria.has(chave) || c.ativo) mapaCategoria.set(chave, c);
  }

  // Departamento (Omie) → centro de custo de ministério (Diakonia). Casa
  // por `vinculo_nome` — o nome CRU do ministério ("Administração"), não
  // `nome` ("Min. Administração") — porque é assim que
  // `fin_seed_centros_custo()` grava (ver migration
  // 20260915140000_seed_centros_custo_so_ministerio.sql).
  const mapaCentro = new Map<string, FinCentroCusto>();
  for (const c of centros) {
    if (c.vinculo_tipo === "ministerio" && c.vinculo_nome) {
      mapaCentro.set(normalizar(c.vinculo_nome), c);
    }
  }

  // Explode rateios (categoria com percentual) em itens separados, cada
  // um carregando a linha bruta original de onde veio.
  const itens: { bruta: OmieLinhaBruta; categoria: string; valor: number }[] = [];
  for (const l of linhasBrutas) {
    if (ehTransferencia(l.categoriaBruta)) {
      itens.push({ bruta: l, categoria: l.categoriaBruta, valor: l.valor });
      continue;
    }
    for (const parte of separarCategoriaEPercentuais(l.categoriaBruta, l.valor)) {
      itens.push({ bruta: l, categoria: parte.categoria, valor: parte.valor });
    }
  }

  // Busca em lote — fornecedor por CNPJ/CPF (saídas) e pessoa por CPF (entradas)
  const cnpjsSaida = Array.from(new Set(
    itens.filter(i => i.valor < 0 && i.bruta.cpfCnpj).map(i => i.bruta.cpfCnpj!)));
  const cpfsEntrada = Array.from(new Set(
    itens.filter(i => i.valor >= 0 && i.bruta.cpfCnpj?.length === 11).map(i => i.bruta.cpfCnpj!)));

  const [{ data: fornecedoresExistentes }, { data: pessoasExistentes }] = await Promise.all([
    cnpjsSaida.length
      ? supabase.from("fin_fornecedores").select("id, nome, cnpj_cpf").in("cnpj_cpf", cnpjsSaida)
      : Promise.resolve({ data: [] as any[] }),
    cpfsEntrada.length
      ? supabase.from("membros").select("id, nome_completo, cpf").in("cpf", cpfsEntrada)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const mapaFornecedor = new Map((fornecedoresExistentes ?? []).map((f: any) => [f.cnpj_cpf, f]));
  const mapaPessoa = new Map((pessoasExistentes ?? []).map((p: any) => [p.cpf, p]));

  const categoriasNaoEncontradas = new Set<string>();
  // Dedupe por CNPJ/CPF dentro do próprio lote — "BANCO BRADESCO S.A."
  // repete dezenas de vezes (uma tarifa por dia) com o mesmo CNPJ, e sem
  // isto o resumo contava "76 fornecedores novos" quando o commit (que já
  // dedupe corretamente) ia criar uma fração disso. Achado ao vivo pela
  // Telma comparando o card do resumo com o botão de confirmar.
  const cnpjsNovosNoLote = new Set<string>();
  const departamentosNaoEncontrados = new Set<string>();
  // CPF de entrada sem membro correspondente — dedupe por CPF dentro do
  // lote, mesma razão que `cnpjsNovosNoLote` (uma pessoa pode contribuir
  // várias vezes no mesmo arquivo). Mantém o PRIMEIRO nome visto pra cada
  // CPF, pra tela mostrar um nome estável.
  const pessoasNovasNoLote = new Map<string, string>();
  let pessoasVinculadas = 0;
  let centrosVinculados = 0;
  let totalEntradas = 0;
  let totalSaidas = 0;

  // Duplicata dentro do MESMO arquivo — ver comentário do topo. A
  // assinatura INCLUI `bruta.observacoes`, achado importante numa
  // auditoria real em 15/09/2026: duas ofertas anônimas no mesmo dia/valor
  // mas com observação diferente ("EM NOME DE X" vs "EM NOME DE Y") são
  // pessoas DIFERENTES — sem a observação, essa checagem geraria falso
  // positivo (quase apagou doação real numa rodada de limpeza manual).
  const assinaturasVistas = new Set<string>();
  let duplicatasNoArquivo = 0;

  const rascunhos: RascunhoOmie[] = itens.map(({ bruta, categoria, valor }) => {
    const tipo: FinMovimentoTipo = valor >= 0 ? "entrada" : "saida";
    if (tipo === "entrada") totalEntradas += valor; else totalSaidas += Math.abs(valor);

    const transferencia = ehTransferencia(categoria);
    let categoriaId: string | null = null;
    let categoriaNome: string | null = null;
    if (!transferencia) {
      const cat = mapaCategoria.get(normalizar(categoria));
      if (cat) { categoriaId = cat.id; categoriaNome = cat.nome; }
      else categoriasNaoEncontradas.add(categoria);
    }

    let fornecedorId: string | null = null;
    let fornecedorNomeParaCriar: string | null = null;
    let pessoaId: string | null = null;
    let pessoaNome: string | null = null;
    let cpfNaoEncontrado: string | null = null;

    if (!transferencia && tipo === "saida" && bruta.cpfCnpj) {
      const existente = mapaFornecedor.get(bruta.cpfCnpj);
      if (existente) fornecedorId = existente.id;
      else { fornecedorNomeParaCriar = bruta.clienteFornecedor; cnpjsNovosNoLote.add(bruta.cpfCnpj); }
    }
    if (!transferencia && tipo === "entrada" && bruta.cpfCnpj?.length === 11) {
      const existente = mapaPessoa.get(bruta.cpfCnpj);
      if (existente) { pessoaId = existente.id; pessoaNome = existente.nome_completo; pessoasVinculadas++; }
      else {
        cpfNaoEncontrado = bruta.cpfCnpj;
        if (!pessoasNovasNoLote.has(bruta.cpfCnpj)) pessoasNovasNoLote.set(bruta.cpfCnpj, bruta.clienteFornecedor);
      }
    }

    let centroCustoId: string | null = null;
    let centroCustoNome: string | null = null;
    if (bruta.departamento) {
      const centro = mapaCentro.get(normalizar(bruta.departamento));
      if (centro) { centroCustoId = centro.id; centroCustoNome = centro.nome; centrosVinculados++; }
      else departamentosNaoEncontrados.add(bruta.departamento);
    }

    const assinatura = [bruta.data, tipo, Math.abs(valor), categoria, bruta.clienteFornecedor,
      bruta.documento, bruta.cpfCnpj, bruta.observacoes].join("|");
    const duplicataDeOutraLinha = assinaturasVistas.has(assinatura);
    if (duplicataDeOutraLinha) duplicatasNoArquivo++;
    assinaturasVistas.add(assinatura);

    return {
      data: bruta.data, tipo, valor: Math.abs(valor),
      categoriaBruta: categoria, categoriaId, categoriaNome,
      ehTransferencia: transferencia,
      descricao: bruta.clienteFornecedor,
      documentoNumero: bruta.documento,
      observacoes: bruta.observacoes,
      cpfCnpj: bruta.cpfCnpj,
      fornecedorId, fornecedorNomeParaCriar,
      pessoaId, pessoaNome, cpfNaoEncontrado,
      departamentoBruto: bruta.departamento,
      centroCustoId, centroCustoNome,
      duplicataDeOutraLinha,
    };
  });

  return {
    rascunhos,
    resumo: {
      totalLinhas: linhasBrutas.length,
      totalEntradas, totalSaidas,
      categoriasNaoEncontradas: Array.from(categoriasNaoEncontradas),
      fornecedoresACriar: cnpjsNovosNoLote.size, pessoasVinculadas,
      saldoAnterior,
      centrosVinculados,
      departamentosNaoEncontrados: Array.from(departamentosNaoEncontrados),
      pessoasACriar: Array.from(pessoasNovasNoLote, ([cpf, nome]) => ({ cpf, nome })),
      duplicatasNoArquivo,
    },
  };
}

export interface ResultadoImportacaoOmie {
  criados: number;
  fornecedoresCriados: number;
  pessoasCriadas: number;
  loteTag: string;
}

export interface PessoaParaCriar extends PessoaACriar {
  tipoPessoa: "membro" | "congregado";
}

/** Já existe importação deste arquivo (mesmo hash) nesta conta? Lançada
 *  como erro comum (não um código especial) — `ImportacaoOmieDialog.tsx`
 *  já checa isto ANTES pela tela (`verificarArquivoJaImportado`), então
 *  chegar aqui só acontece numa corrida de verdade (dois cliques quase
 *  simultâneos) — o texto da mensagem é o mesmo tanto faz de onde vier. */
const MSG_ARQUIVO_DUPLICADO =
  "Este arquivo já foi importado nesta conta antes — para evitar duplicar lançamentos, a importação foi cancelada.";

/** Grava de verdade. `contaId` é a mesma para todas as linhas — a tela
 *  de importação é sempre aberta a partir de UMA conta (mesmo padrão do
 *  `ConciliacaoOFXDialog`).
 *
 *  `saldoInicial`, quando informado, é gravado ANTES de qualquer
 *  lançamento — de propósito, e AQUI dentro (não na tela chamadora), pra
 *  quem chamar isto não poder reproduzir o bug achado numa revisão em
 *  13/09/2026: o gatilho `fin_recalc_saldo_conta()` (em `fin_lancamentos`)
 *  recalcula `saldo_atual = saldo_inicial + movimento` a cada lançamento
 *  gravado, lendo o `saldo_inicial` que a conta tiver NAQUELE INSTANTE.
 *  Gravar os lançamentos antes do saldo inicial deixa `saldo_atual`
 *  travado em "0 + movimento" em vez de "saldo_inicial + movimento" — bug
 *  real, achado ao vivo pela Telma (Caixa de Envelopes mostrou -R$928 em
 *  vez de R$0) e corrigido direto no banco naquela conta.
 *
 *  `arquivoHash`/`arquivoNome`, quando informados (15/09/2026), gravam a
 *  trava de duplicidade em `fin_import_arquivos` — ver comentário do topo
 *  do arquivo. Essa gravação é a PRIMEIRA coisa que esta função faz, antes
 *  de fornecedor/pessoa/lançamento: se o hash já existir pra esta conta, a
 *  constraint `unique(conta_id, arquivo_hash)` do banco recusa o INSERT
 *  (`23505`) e a função para aqui, sem tocar em mais nada — é essa ordem
 *  que faz a trava valer mesmo numa corrida de clique duplo.
 *
 *  `incluirDuplicatasDoArquivo` (default `false`) decide se linhas
 *  marcadas `duplicataDeOutraLinha` entram ou ficam de fora.
 *
 *  `pessoasParaCriar`, quando informado, cria em `membros` cada CPF de
 *  entrada sem correspondente (a Telma escolhe membro/congregado por
 *  pessoa na tela) e religa o `pessoa_id` dos lançamentos daquele CPF —
 *  mesma ideia de `fornecedorNomeParaCriar`, só que pessoa pede uma
 *  escolha que fornecedor não pede. */
export async function confirmarImportacaoOmie(
  rascunhos: RascunhoOmie[],
  contaId: string,
  saldoInicial?: number | null,
  opcoes?: {
    arquivoHash?: string;
    arquivoNome?: string;
    incluirDuplicatasDoArquivo?: boolean;
    pessoasParaCriar?: PessoaParaCriar[];
  },
): Promise<ResultadoImportacaoOmie> {
  const linhasValidas = opcoes?.incluirDuplicatasDoArquivo
    ? rascunhos
    : rascunhos.filter(r => !r.duplicataDeOutraLinha);

  const loteTag = `omie-${new Date().toISOString()}`;
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const agora = new Date().toISOString();

  if (opcoes?.arquivoHash) {
    const datas = linhasValidas.map(r => r.data).sort();
    const { error } = await supabase.from("fin_import_arquivos").insert({
      conta_id: contaId,
      arquivo_hash: opcoes.arquivoHash,
      arquivo_nome: opcoes.arquivoNome ?? null,
      qtd_linhas: linhasValidas.length,
      data_min: datas[0] ?? null,
      data_max: datas[datas.length - 1] ?? null,
      lote_tag: loteTag,
      importado_por: userId,
    });
    if (error) {
      if (error.code === "23505") throw new Error(MSG_ARQUIVO_DUPLICADO);
      throw error;
    }
  }

  if (saldoInicial != null) {
    await atualizarConta(contaId, { saldo_inicial: saldoInicial });
  }

  // Cria toda pessoa nova NUMA TACADA SÓ (mesmo padrão do fornecedor
  // abaixo) — dedupe por CPF já veio pronto de `prepararImportacaoOmie`
  // (`pessoasACriar`), aqui só grava. `data_congregado`/`data_membro` vira
  // a data de HOJE (data real de entrada na igreja é desconhecida —
  // marcar como se fosse a data da doação seria inventar dado que a
  // planilha do Omie não tem).
  const cachePessoaCpf = new Map<string, string>();
  let pessoasCriadas = 0;
  if (opcoes?.pessoasParaCriar && opcoes.pessoasParaCriar.length > 0) {
    const payloadPessoas = opcoes.pessoasParaCriar.map(p => ({
      nome_completo: p.nome,
      cpf: p.cpf,
      tipo_pessoa: p.tipoPessoa,
      status: "ativo" as const,
      origem_cadastro: "importacao_omie",
      observacoes: `Cadastrado automaticamente pela importação do Omie (${loteTag}), a partir do CPF de uma doação sem correspondente em membros.`,
      data_congregado: p.tipoPessoa === "congregado" ? agora : null,
      data_membro: p.tipoPessoa === "membro" ? agora : null,
    }));
    const { data, error } = await supabase.from("membros").insert(payloadPessoas).select("id, cpf");
    if (error) throw error;
    for (const p of (data ?? []) as { id: string; cpf: string }[]) {
      cachePessoaCpf.set(p.cpf, p.id);
    }
    pessoasCriadas = data?.length ?? 0;
  }

  // Cria todo fornecedor novo NUMA TACADA SÓ (dedupe por CNPJ/CPF antes de
  // montar o array) — "BANCO BRADESCO S.A." se repete dezenas de vezes no
  // mesmo extrato. Até 13/09/2026 isto era um loop com `await
  // criarFornecedor` sequencial, um round-trip por fornecedor novo (achado
  // numa revisão: um extrato com 76 fornecedores novos levava 76
  // round-trips em série). `criarFornecedor` insere um de cada vez porque
  // devolve `.single()`; aqui insere-se direto (sem passar por ela) porque
  // o volume pede um único INSERT com vários valores.
  const cacheFornecedor = new Map<string, string>();
  const novosPorCnpj = new Map<string, string>(); // cnpjCpf → nome
  for (const r of linhasValidas) {
    if (r.fornecedorNomeParaCriar && r.cpfCnpj && !novosPorCnpj.has(r.cpfCnpj)) {
      novosPorCnpj.set(r.cpfCnpj, r.fornecedorNomeParaCriar);
    }
  }
  let fornecedoresCriados = 0;
  if (novosPorCnpj.size > 0) {
    const payload = Array.from(novosPorCnpj, ([cnpjCpf, nome]) => ({
      nome,
      cnpj_cpf: cnpjCpf,
      tipo: cnpjCpf.length === 14 ? "juridica" as const : "fisica" as const,
      observacao: `Criado automaticamente pela importação do Omie (${loteTag}).`,
    }));
    const { data, error } = await supabase.from("fin_fornecedores").insert(payload).select("id, cnpj_cpf");
    if (error) throw error;
    for (const f of (data ?? []) as { id: string; cnpj_cpf: string }[]) {
      cacheFornecedor.set(f.cnpj_cpf, f.id);
    }
    fornecedoresCriados = data?.length ?? 0;
  }

  const linhas = linhasValidas.map(r => {
    const fornecedorId = r.fornecedorId ?? (r.cpfCnpj ? cacheFornecedor.get(r.cpfCnpj) ?? null : null);
    const pessoaId = r.pessoaId ?? (r.cpfNaoEncontrado ? cachePessoaCpf.get(r.cpfNaoEncontrado) ?? null : null);
    const obsBase = r.observacoes ? ` ${r.observacoes}` : "";
    return {
      data: r.data,
      tipo: r.tipo,
      status: "conciliado" as const,
      conta_id: contaId,
      categoria_id: r.categoriaId,
      centro_custo_id: r.centroCustoId,
      fornecedor_id: fornecedorId,
      pessoa_id: pessoaId,
      valor: r.valor,
      descricao: r.descricao,
      documento_numero: r.documentoNumero,
      observacoes: `[lote:${loteTag}]${obsBase}`,
      origem: r.ehTransferencia ? "transferencia" : "importado_omie",
      audit_user_id: userId,
      audit_em: agora,
    };
  });

  // Insere em blocos de 200 — não é limite conhecido do PostgREST pra
  // este volume, é só prudência (evitar um payload gigante numa tacada
  // só quando o histórico trazido cobrir vários meses de uma vez).
  const TAMANHO_BLOCO = 200;
  let criados = 0;
  for (let i = 0; i < linhas.length; i += TAMANHO_BLOCO) {
    const bloco = linhas.slice(i, i + TAMANHO_BLOCO);
    const { data, error } = await supabase.from("fin_lancamentos").insert(bloco as any).select("id");
    if (error) throw error;
    criados += data?.length ?? 0;
  }

  return { criados, fornecedoresCriados, pessoasCriadas, loteTag };
}

/** Desfaz um lote inteiro pelo carimbo gravado em `observacoes`. Não
 *  apaga fornecedor/pessoa criado junto — podem já ter sido reaproveitados
 *  por um lançamento manual feito depois da importação.
 *
 *  Usa `conferir()` (achado numa revisão em 13/09/2026: antes só checava
 *  `error`, e um DELETE barrado pela RLS devolve sucesso com zero linhas
 *  — indistinguível de "não achou nada pra apagar". O botão "Desfazer"
 *  só existe na tela logo após uma importação bem-sucedida e some depois
 *  do primeiro uso, então zero linhas apagadas aqui só pode significar
 *  bloqueio, nunca "já tinha sido desfeito".
 *
 *  Também apaga a linha de `fin_import_arquivos` deste lote (15/09/2026)
 *  — sem isso, desfazer uma importação com erro deixava o hash do arquivo
 *  preso pra sempre, e a trava de duplicidade impediria reimportar o MESMO
 *  arquivo depois de corrigido o problema. Sem `conferir()` aqui: zero
 *  linhas é o caso normal pra lote sem `arquivoHash` (importação anterior
 *  a esta migration). */
export async function desfazerImportacaoOmie(loteTag: string): Promise<number> {
  const resultado = await supabase
    .from("fin_lancamentos")
    .delete()
    .ilike("observacoes", `[lote:${loteTag}]%`)
    .select("id");
  const r = conferir(resultado, "A importação");
  if (!r.ok) throw new Error(r.erro);

  await supabase.from("fin_import_arquivos").delete().eq("lote_tag", loteTag);

  return resultado.data?.length ?? 0;
}
