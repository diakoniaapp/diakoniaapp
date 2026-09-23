// ─── ImportacaoOmieDialog.tsx ────────────────────────────────────────────
//
// Pedido da Telma (13/09/2026): trazer histórico anterior ao Diakonia, que
// hoje só existe no Omie. Diferente de `ConciliacaoOFXDialog.tsx` — aqui
// não existe lançamento nenhum no Diakonia ainda pra casar, então o
// caminho é CRIAR (via `omieImportService.ts`), não conciliar.
//
// Revisto em 15/09/2026 depois de um incidente real (2025 do Bradesco
// importado duas vezes — ver o cabeçalho de `omieImportService.ts` pro
// relato completo) e de um segundo pedido direto no mesmo dia. Três
// mudanças de fundo:
//
//   1. A tela agora se FECHA SOZINHA ao confirmar — antes ficava aberta
//      esperando um clique manual no X, com o formulário de arquivo pronto
//      pra receber (e reimportar) o mesmo arquivo. "Desfazer" continua
//      disponível, só que como botão dentro do toast de sucesso, não mais
//      preso a esta tela.
//   2. Três avisos ANTES de confirmar: arquivo já importado nesta conta
//      (bloqueia — a trava de verdade é o banco, `fin_import_arquivos`),
//      período que já tem lançamento nesta conta (avisa, não bloqueia) e
//      linhas duplicadas dentro do PRÓPRIO arquivo (avisa, deixa incluir).
//   3. CPF de doação sem membro correspondente agora pode virar cadastro
//      automático — mesma ideia do fornecedor por CNPJ, com uma escolha a
//      mais (membro ou congregado) porque doação sozinha não prova
//      vínculo formal.
import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileUp, Upload, TrendingUp, TrendingDown, AlertTriangle, Building2, Users, Layers, Copy, ShieldAlert,
  ArrowRightLeft,
} from "lucide-react";
import { listarContas, brl, type FinMovimentoTipo, type FinConta } from "@/services/finService";
import {
  lerArquivoOmie, prepararImportacaoOmie, confirmarImportacaoOmie,
  verificarArquivoJaImportado, verificarSobreposicaoPeriodo, contaTemHistorico, desfazerImportacaoOmie,
  type RascunhoOmie, type ResumoImportacaoOmie, type ResolucaoPessoa,
} from "@/services/omieImportService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contaId: string;
  contaNome: string;
  onSaved: () => void;
}

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// "vincular" só aparece quando `sugestaoExistente` achou candidato —
// pedido da Telma (15/09/2026): não duplicar quem já está cadastrado com
// o nome grafado diferente do extrato, ou sem CPF salvo.
type EscolhaPessoa = "vincular" | "congregado" | "membro" | "nao";

export function ImportacaoOmieDialog({ open, onOpenChange, contaId, contaNome, onSaved }: Props) {
  const [processando, setProcessando] = useState(false);
  const [rascunhos, setRascunhos] = useState<RascunhoOmie[] | null>(null);
  const [resumo, setResumo] = useState<ResumoImportacaoOmie | null>(null);
  const [arquivoHash, setArquivoHash] = useState<string | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [usarSaldoInicial, setUsarSaldoInicial] = useState(true);
  // A conta já tinha ALGUM lançamento antes deste arquivo? `null` = ainda
  // ---
  // CORRIGIDO (23/09/2026, "BUG CRÍTICO NA IMPORTAÇÃO DO OMIE"): o padrão
  // era EXCLUIR sozinho toda linha com a mesma assinatura de outra do
  // arquivo — e em oferta/dízimo em espécie (sem nome, documento nem
  // observação preenchidos no Omie), vários pagamentos REAIS e DIFERENTES
  // no mesmo dia e valor colapsam pra assinatura igual. Sem ID externo do
  // Omie nesse formato de exportação (a planilha não tem coluna de
  // id/chave única — conferido nas colunas lidas por `omieImport.ts`),
  // não existe jeito confiável de distinguir "duas ofertas de R$100
  // reais" de "a mesma linha exportada em dobro" só pelos dados. Excluir
  // por padrão arriscava sumir com dízimo de verdade sem ninguém notar —
  // agora TODAS entram por padrão; a marca "duplicata" continua visível
  // só como aviso pra revisão manual, nunca mais decide sozinha.
  // não checou. Achado ao vivo pela Telma (15/09/2026): reimportar a
  // Caixinha com um arquivo incremental (13/09-01/12/2026, a conta já
  // tinha 2024-2026 inteiro) sobrescreveu o saldo_inicial CERTO
  // (R$2.317,46, confirmado por ela mais cedo) pelo "saldo anterior"
  // DESSE arquivo (R$173,59 — só o saldo em 12/09, véspera do recorte,
  // não o saldo de abertura da conta). "Saldo anterior do arquivo" só é
  // seguro pra virar saldo_inicial na PRIMEIRA importação da conta.
  const [contaJaTinhaHistorico, setContaJaTinhaHistorico] = useState<boolean | null>(null);
  const [incluirDuplicatas, setIncluirDuplicatas] = useState(true);
  const [confirmando, setConfirmando] = useState(false);

  // Trava de arquivo já importado NESTA conta — checada assim que o
  // arquivo é lido, antes de mostrar qualquer prévia. `null` = ainda não
  // checou ou não achou (pode importar); preenchido = acha, bloqueia.
  const [arquivoJaImportado, setArquivoJaImportado] = useState<{
    lote_tag: string; qtd_linhas: number; importado_em: string;
  } | null>(null);

  // Quantos lançamentos a conta já tem no intervalo de datas do arquivo —
  // só aviso, não impede confirmar (ver comentário do topo).
  const [sobreposicao, setSobreposicao] = useState<number | null>(null);

  // CPF → escolha da Telma (congregado é o padrão, o vínculo mais
  // conservador pra quem só doou e não tinha cadastro nenhum).
  const [escolhasPessoa, setEscolhasPessoa] = useState<Record<string, EscolhaPessoa>>({});

  // Pedido da Telma (22/09/2026): "dê opções de editar os lançamentos na
  // hora, pois assim as transferências podem ser inseridas nas duas
  // pernas" — pra cada linha marcada como transferência (`ehTransferencia`),
  // deixa escolher JÁ NA PRÉVIA qual é a conta do outro lado. Índice em
  // `rascunhos` → conta escolhida; vai direto pra `contaOutraPernaPorIndice`
  // de `confirmarImportacaoOmie`. Sem escolha, cai no pareamento por
  // adivinhação de sempre (`parearTransferenciasImportadas`).
  const [contasOutraPerna, setContasOutraPerna] = useState<FinConta[]>([]);
  const [escolhasTransferencia, setEscolhasTransferencia] = useState<Record<number, string>>({});

  // Guarda síncrona contra clique duplo/corrida — o `disabled={confirmando}`
  // do botão já ajuda, mas só depois do React re-renderizar; esta ref é
  // checada ANTES de qualquer `await`, no mesmo tick do clique. Achado
  // relevante porque foi exatamente uma corrida de clique que gerou o
  // incidente de 2025 duplicado do Bradesco (ver cabeçalho do serviço).
  const emVooRef = useRef(false);

  function reiniciar() {
    setRascunhos(null);
    setResumo(null);
    setArquivoHash(null);
    setArquivoNome(null);
    setArquivoJaImportado(null);
    setSobreposicao(null);
    setContaJaTinhaHistorico(null);
    setUsarSaldoInicial(true);
    setIncluirDuplicatas(true);
    setEscolhasPessoa({});
    setEscolhasTransferencia({});
  }

  async function processarArquivo(file: File) {
    setProcessando(true);
    try {
      const { linhas, saldoAnterior, hash, nomeArquivo } = await lerArquivoOmie(file);
      if (linhas.length === 0) {
        toast.error("Nenhum lançamento encontrado nesse arquivo.");
        return;
      }
      setArquivoHash(hash);
      setArquivoNome(nomeArquivo);

      const jaImportado = await verificarArquivoJaImportado(contaId, hash);
      if (jaImportado) {
        setArquivoJaImportado(jaImportado);
        return;
      }

      const { rascunhos: r, resumo: res } = await prepararImportacaoOmie(linhas, saldoAnterior);
      setRascunhos(r);
      setResumo(res);

      // Só busca a lista de contas se o arquivo trouxer alguma
      // transferência — a maioria dos arquivos não traz, e a tela de
      // escolha só aparece nesse caso (ver render da linha, abaixo).
      if (r.some(x => x.ehTransferencia)) {
        listarContas().then(cs => setContasOutraPerna(cs.filter(c => c.id !== contaId)));
      }

      // Só marca "usar saldo anterior" por padrão quando é a PRIMEIRA
      // importação da conta — ver comentário do estado acima.
      const jaTinhaHistorico = await contaTemHistorico(contaId);
      setContaJaTinhaHistorico(jaTinhaHistorico);
      setUsarSaldoInicial(!jaTinhaHistorico);

      // Padrão: "vincular" quando achou um candidato seguro por nome — é
      // o caminho mais conservador (reaproveita quem já existe em vez de
      // duplicar); sem sugestão, cai pro padrão anterior ("congregado").
      const escolhasIniciais: Record<string, EscolhaPessoa> = {};
      for (const p of res.pessoasACriar) escolhasIniciais[p.cpf] = p.sugestaoExistente ? "vincular" : "congregado";
      setEscolhasPessoa(escolhasIniciais);

      const datas = r.map(x => x.data).sort();
      if (datas.length > 0) {
        const qtd = await verificarSobreposicaoPeriodo(contaId, datas[0], datas[datas.length - 1]);
        setSobreposicao(qtd);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao ler o arquivo");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmar() {
    if (!rascunhos || emVooRef.current) return;
    emVooRef.current = true;
    setConfirmando(true);
    try {
      // A ordem (saldo inicial antes dos lançamentos) é garantida dentro
      // de `confirmarImportacaoOmie` — ver o comentário lá.
      const saldoInicial = usarSaldoInicial ? resumo?.saldoAnterior ?? null : null;
      const resolucoesPessoa: ResolucaoPessoa[] = (resumo?.pessoasACriar ?? [])
        .flatMap((p): ResolucaoPessoa[] => {
          const escolha = escolhasPessoa[p.cpf] ?? "congregado";
          if (escolha === "nao") return [];
          if (escolha === "vincular" && p.sugestaoExistente) {
            return [{ ...p, acao: "vincular", membroExistenteId: p.sugestaoExistente.id }];
          }
          return [{ ...p, acao: "criar", tipoPessoa: escolha === "membro" ? "membro" : "congregado" }];
        });

      // Só manda escolha de linha que REALMENTE tem conta escolhida —
      // `escolhasTransferencia` pode ter entradas vazias ("") deixadas
      // pelo Select antes de decidir.
      const contaOutraPernaPorIndice = Object.fromEntries(
        Object.entries(escolhasTransferencia).filter(([, v]) => v));

      const r = await confirmarImportacaoOmie(rascunhos, contaId, saldoInicial, {
        arquivoHash: arquivoHash ?? undefined,
        arquivoNome: arquivoNome ?? undefined,
        incluirDuplicatasDoArquivo: incluirDuplicatas,
        resolucoesPessoa,
        contaOutraPernaPorIndice,
      });

      const partes = [`${r.criados} lançamento${r.criados !== 1 ? "s" : ""} importado${r.criados !== 1 ? "s" : ""}`];
      if (r.fornecedoresCriados > 0) partes.push(`${r.fornecedoresCriados} fornecedor(es) novo(s)`);
      if (r.pessoasCriadas > 0) partes.push(`${r.pessoasCriadas} pessoa(s) nova(s)`);
      // Transferência resolvida na hora (22/09/2026, escolha manual) e
      // pareamento automático depois (por adivinhação, ver
      // `parearTransferenciasImportadas`) — mecanismos diferentes,
      // contados separado.
      if (r.transferenciasResolvidasNaHora > 0) {
        partes.push(`${r.transferenciasResolvidasNaHora} transferência(s) ligada(s) na hora`);
      }
      if (r.transferenciasPareadas > 0) {
        partes.push(`${r.transferenciasPareadas / 2} transferência(s) ligada(s) à outra conta`);
      }

      // Fecha a tela sozinha — o "Desfazer" viaja pro toast (ação
      // embutida do sonner), pra não precisar manter a tela aberta só por
      // causa dele. Ver comentário do topo do arquivo.
      onOpenChange(false);
      reiniciar();
      toast.success(partes.join(" · "), {
        duration: 15000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              const n = await desfazerImportacaoOmie(r.loteTag);
              toast.success(`${n} lançamento(s) removido(s) — importação desfeita`);
              onSaved();
            } catch (e: any) {
              toast.error(e?.message ?? "Erro ao desfazer");
            }
          },
        },
      });
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao importar");
    } finally {
      setConfirmando(false);
      emVooRef.current = false;
    }
  }

  const amostra = rascunhos?.slice(0, 50) ?? [];
  const qtdValidas = rascunhos
    ? (incluirDuplicatas ? rascunhos.length : rascunhos.filter(r => !r.duplicataDeOutraLinha).length)
    : 0;
  const travado = confirmando || processando;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (travado) return; onOpenChange(v); if (!v) reiniciar(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Upload className="w-5 h-5 text-gold" /> Importar histórico do Omie
          </DialogTitle>
          <DialogDescription>
            Traz lançamentos que nunca existiram no Diakonia, lidos do extrato de
            <strong> {contaNome}</strong> exportado do Omie (Excel). Diferente do OFX, aqui não
            concilia — cria os lançamentos direto.
          </DialogDescription>
        </DialogHeader>

        {arquivoJaImportado && (
          <div className="rounded-md border border-destructive-line bg-destructive-soft/30 p-3 space-y-1.5">
            <p className="text-sm font-medium text-destructive-text flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Este arquivo já foi importado em {contaNome}
            </p>
            <p className="text-xs text-muted-foreground">
              Em {new Date(arquivoJaImportado.importado_em).toLocaleString("pt-BR")}, trazendo{" "}
              {arquivoJaImportado.qtd_linhas} lançamento(s). Importar de novo duplicaria tudo — se o
              arquivo mudou desde então, exporte de novo do Omie; se o problema foi na importação
              anterior, desfaça-a primeiro (toast de "Desfazer" logo depois de importar, ou apague o
              lote <code className="text-[11px]">{arquivoJaImportado.lote_tag}</code> manualmente).
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={reiniciar}>Escolher outro arquivo</Button>
          </div>
        )}

        {!rascunhos && !arquivoJaImportado && (
          processando ? (
            <p className="text-sm text-center text-muted-foreground py-6">Lendo a planilha...</p>
          ) : (
            <label className="cursor-pointer block">
              <input type="file" accept=".xlsx" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivo(f); e.target.value = ""; }} />
              <div className="flex flex-col items-center gap-2 border-2 border-dashed rounded-md p-8 hover:border-gold/40">
                <FileUp className="w-6 h-6 text-muted-foreground" />
                <span className="text-sm">Selecionar planilha (.xlsx) do Omie</span>
                <span className="text-xs text-muted-foreground text-center">
                  Finanças → Passo 5 - Conciliar Contas Correntes → botão direito → Exportar →
                  Excel. Precisa da coluna Categoria visível na grade — e, se quiser trazer o
                  centro de custo (ministério) também, deixe "Departamento" visível também.
                </span>
              </div>
            </label>
          )
        )}

        {rascunhos && resumo && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Linhas do Omie</p>
                <p className="text-lg font-semibold tabular-nums">{resumo.totalLinhas}</p>
                {rascunhos.length !== resumo.totalLinhas && (
                  <p className="text-xs text-muted-foreground">
                    → {rascunhos.length} lançamentos (uma linha tinha rateio entre categorias)
                  </p>
                )}
              </div>
              <div className="rounded-md border border-success-line bg-success-soft/20 p-2">
                <p className="text-xs text-success-text flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Entradas</p>
                <p className="text-lg font-semibold tabular-nums text-success-text">{brl(resumo.totalEntradas)}</p>
              </div>
              <div className="rounded-md border border-destructive-line bg-destructive-soft/20 p-2">
                <p className="text-xs text-destructive-text flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Saídas</p>
                <p className="text-lg font-semibold tabular-nums text-destructive-text">− {brl(resumo.totalSaidas)}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Resultado</p>
                <p className="text-lg font-semibold tabular-nums">{brl(resumo.totalEntradas - resumo.totalSaidas)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="gap-1"><Building2 className="w-3 h-3" /> {resumo.fornecedoresACriar} fornecedor(es) novo(s) a criar</Badge>
              <Badge variant="outline" className="gap-1"><Users className="w-3 h-3" /> {resumo.pessoasVinculadas} vinculado(s) a membro por CPF</Badge>
              {resumo.centrosVinculados > 0 && (
                <Badge variant="outline" className="gap-1"><Layers className="w-3 h-3" /> {resumo.centrosVinculados} vinculado(s) a centro de custo por Departamento</Badge>
              )}
            </div>

            {sobreposicao != null && sobreposicao > 0 && (
              <div className="rounded-md border border-warning-line bg-warning-soft/30 p-3">
                <p className="text-sm font-medium text-warning-text flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> {contaNome} já tem {sobreposicao} lançamento(s) no período deste arquivo
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Confira se este arquivo não é uma reimportação de um período já trazido antes —
                  se for de propósito (corrigindo um pedaço), pode seguir.
                </p>
              </div>
            )}

            {resumo.duplicatasNoArquivo > 0 && (
              <div className="rounded-md border border-info-line bg-info-soft/20 p-3 space-y-2">
                <p className="text-sm font-medium text-info-text flex items-center gap-1.5">
                  <Copy className="w-4 h-4" /> {resumo.duplicatasNoArquivo} linha(s) com os mesmos dados de outra linha deste MESMO arquivo
                </p>
                <p className="text-xs text-muted-foreground">
                  Mesma data, valor, categoria, descrição e documento de outra linha já contada —
                  em igreja é comum (vários dízimos ou ofertas iguais no mesmo dia são pagamentos
                  DIFERENTES, não duplicidade). Por isso todas as {resumo.duplicatasNoArquivo} entram
                  por padrão — desmarque abaixo só se tiver certeza de que é o Omie exportando a
                  MESMA linha em dobro.
                </p>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={incluirDuplicatas} onCheckedChange={(v) => setIncluirDuplicatas(v === true)} />
                  Incluir estas {resumo.duplicatasNoArquivo} linha(s) (recomendado)
                </label>
              </div>
            )}

            {resumo.categoriasNaoEncontradas.length > 0 && (
              <div className="rounded-md border border-warning-line bg-warning-soft/30 p-3">
                <p className="text-sm font-medium text-warning-text flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> {resumo.categoriasNaoEncontradas.length} categoria(s) do Omie sem correspondente aqui
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esses lançamentos entram sem categoria (dá pra classificar um por um depois):
                  {" "}{resumo.categoriasNaoEncontradas.join(", ")}
                </p>
              </div>
            )}

            {resumo.departamentosNaoEncontrados.length > 0 && (
              <div className="rounded-md border border-warning-line bg-warning-soft/30 p-3">
                <p className="text-sm font-medium text-warning-text flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> {resumo.departamentosNaoEncontrados.length} departamento(s) do Omie sem centro de custo correspondente
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esses lançamentos entram sem centro de custo (dá pra vincular um por um depois):
                  {" "}{resumo.departamentosNaoEncontrados.join(", ")}
                </p>
              </div>
            )}

            {resumo.pessoasACriar.length > 0 && (
              <div className="rounded-md border border-info-line bg-info-soft/20 p-3 space-y-2">
                <p className="text-sm font-medium text-info-text flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> {resumo.pessoasACriar.length} pessoa(s) deram entrada sem cadastro no Diakonia
                </p>
                <p className="text-xs text-muted-foreground">
                  CPF sem membro correspondente. Escolha o vínculo de cada uma (ou "Não cadastrar"
                  pra deixar a doação sem pessoa vinculada, como era antes):
                </p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {resumo.pessoasACriar.map(p => (
                    <div key={p.cpf} className="flex items-center justify-between gap-2 text-xs border-b border-border/30 py-1 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{p.nome}</p>
                        {p.sugestaoExistente && (
                          <p className="text-muted-foreground truncate">
                            Pode ser <strong className="text-info-text">{p.sugestaoExistente.nome}</strong>, já cadastrado(a) sem CPF
                          </p>
                        )}
                      </div>
                      <Select value={escolhasPessoa[p.cpf] ?? (p.sugestaoExistente ? "vincular" : "congregado")}
                        onValueChange={(v) => setEscolhasPessoa(prev => ({ ...prev, [p.cpf]: v as EscolhaPessoa }))}>
                        <SelectTrigger className="h-7 w-44 text-xs shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {p.sugestaoExistente && (
                            <SelectItem value="vincular">Vincular a {p.sugestaoExistente.nome}</SelectItem>
                          )}
                          <SelectItem value="congregado">Cadastrar · Congregado</SelectItem>
                          <SelectItem value="membro">Cadastrar · Membro</SelectItem>
                          <SelectItem value="nao">Não cadastrar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resumo.saldoAnterior != null && contaJaTinhaHistorico === false && (
              <label className="flex items-center gap-2 text-xs cursor-pointer border rounded-md p-2 bg-muted/20">
                <input type="checkbox" checked={usarSaldoInicial} onChange={(e) => setUsarSaldoInicial(e.target.checked)} />
                Usar {brl(resumo.saldoAnterior)} (saldo anterior no Omie) como saldo inicial de {contaNome}
              </label>
            )}

            {/* Conta já tem histórico — "saldo anterior" DESTE arquivo é só
                a véspera do recorte que ele cobre, não o saldo de abertura
                de verdade da conta. Sem checkbox marcado por padrão aqui:
                usar por engano sobrescreveria um saldo_inicial já certo
                (foi exatamente o que aconteceu com a Telma, 15/09/2026). */}
            {resumo.saldoAnterior != null && contaJaTinhaHistorico === true && (
              <div className="rounded-md border border-warning-line bg-warning-soft/30 p-3 space-y-1.5">
                <p className="text-sm font-medium text-warning-text flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> {contaNome} já tem lançamento de antes deste arquivo
                </p>
                <p className="text-xs text-muted-foreground">
                  Este arquivo diz {brl(resumo.saldoAnterior)} de "saldo anterior" — mas isso é só o saldo na
                  véspera do período que ELE cobre, não o saldo de abertura da conta. Deixe desmarcado (o normal
                  pra importação incremental); só marque se tiver certeza de que quer sobrescrever o saldo inicial
                  já registrado.
                </p>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={usarSaldoInicial} onCheckedChange={(v) => setUsarSaldoInicial(v === true)} />
                  Sobrescrever mesmo assim, usando {brl(resumo.saldoAnterior)} como novo saldo inicial
                </label>
              </div>
            )}

            {amostra.some(r => r.ehTransferencia) && (
              <div className="rounded-md border border-info-line bg-info-soft/20 p-3 space-y-1">
                <p className="text-sm font-medium text-info-text flex items-center gap-1.5">
                  <ArrowRightLeft className="w-4 h-4" /> Linhas de transferência — escolha a outra conta
                </p>
                <p className="text-xs text-muted-foreground">
                  Sem escolher, o sistema tenta ligar sozinho depois (só quando for inequívoco — mesma
                  data e valor batendo em só uma outra conta). Escolhendo aqui, liga ou cria a perna
                  espelho na hora, sem depender de adivinhação.
                </p>
              </div>
            )}

            {/* Sem opacidade reduzida na linha "mesmos dados" — desde a
                correção do bug crítico (23/09/2026) essas linhas ENTRAM por
                padrão, e esmaecer dava a impressão errada de "excluída". Só
                a Badge abaixo sinaliza, pra revisão, sem parecer descartada. */}
            <div className="space-y-1 max-h-64 overflow-y-auto border rounded-md p-2">
              {amostra.map((r, i) => (
                <div key={i} className="flex flex-col gap-1 text-xs border-b border-border/30 py-1 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">{dataBr(r.data)}</span>
                    <span className="flex-1 min-w-0 truncate">{r.descricao}</span>
                    <span className="text-muted-foreground shrink-0">{r.categoriaNome ?? r.categoriaBruta}</span>
                    {r.centroCustoNome && (
                      <span className="text-muted-foreground shrink-0 hidden sm:inline">· {r.centroCustoNome}</span>
                    )}
                    {r.duplicataDeOutraLinha && (
                      <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0 border-info-line text-info-text">mesmos dados</Badge>
                    )}
                    <span className={`tabular-nums shrink-0 ${r.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                      {r.tipo === "entrada" ? "+" : "−"} {brl(r.valor)}
                    </span>
                  </div>
                  {r.ehTransferencia && !r.duplicataDeOutraLinha && (
                    <Select value={escolhasTransferencia[i] ?? ""}
                      onValueChange={(v) => setEscolhasTransferencia(prev => ({ ...prev, [i]: v }))}>
                      <SelectTrigger className="h-6 text-[11px] w-56 ml-auto">
                        <SelectValue placeholder="Outra conta (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {contasOutraPerna.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
              {rascunhos.length > amostra.length && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {rascunhos.length - amostra.length} lançamento(s)...
                </p>
              )}
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={reiniciar} disabled={travado}>Trocar arquivo</Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={travado}>
            Fechar
          </Button>
          {rascunhos && (
            <Button type="button" onClick={confirmar} disabled={confirmando}
              className="bg-gold hover:bg-gold/90 text-white gap-1.5">
              <Upload className="w-3.5 h-3.5" /> {confirmando ? "Importando..." : `Importar ${qtdValidas} lançamento(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
