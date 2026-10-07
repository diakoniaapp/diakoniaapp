import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, User } from "lucide-react";
import {
  listarCategorias, listarCentrosCusto, criarFornecedor, atualizarFornecedor,
  type FinCategoria, type FinCentroCusto, type FinFornecedor,
} from "@/services/finService";
import { TIPOS_CHAVE_PIX, type TipoChavePix } from "@/lib/pix";
import { FavorecidoEscolha } from "@/components/financas/FavorecidoEscolha";
import { pessoaDoFavorecido } from "@/services/favorecidoService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fornecedor?: FinFornecedor | null;
  onSaved: (f: FinFornecedor) => void;
}

const VAZIO = {
  nome: "", tipo: "juridica" as string, cnpjCpf: "", email: "", telefone: "",
  chavePix: "", tipoChavePix: "" as TipoChavePix | "", bancoNome: "", agencia: "", conta: "",
  endereco: "", bairro: "", cidade: "", uf: "", cep: "",
  categoriaPadraoId: "", centroCustoPadraoId: "", observacao: "",
};

export function FornecedorForm({ open, onOpenChange, fornecedor: fornecedorDaProp, onSaved }: Props) {
  // Favorecido Financeiro (07/10/2026): criar começa por "quem é?" — pessoa do Cadastro de Pessoas (vincula, sem duplicar)
  // ou Favorecido Empresarial. Depois de vincular a pessoa, o diálogo segue como EDIÇÃO dela, só com os dados financeiros.
  const [vinculado, setVinculado] = useState<FinFornecedor | null>(null);
  const [etapa, setEtapa] = useState<"escolha" | "formulario">("formulario");
  const [pessoaNome, setPessoaNome] = useState<string | null>(null);
  const fornecedor = fornecedorDaProp ?? vinculado;
  const isEdit = !!fornecedor;
  const ehPessoa = !!fornecedor?.pessoa_id;
  useEffect(() => {
    if (!open) return;
    setVinculado(null);
    setEtapa(fornecedorDaProp ? "formulario" : "escolha");
  }, [open, fornecedorDaProp]);
  useEffect(() => {
    setPessoaNome(null);
    if (!fornecedor?.pessoa_id) return;
    pessoaDoFavorecido(fornecedor.pessoa_id).then(p => setPessoaNome(p ? p.nome : null)).catch(() => { /* melhoria */ });
  }, [fornecedor?.pessoa_id]);
  const [campos, setCampos] = useState(VAZIO);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [busy, setBusy] = useState(false);

  // Bug real dela em produção (23/09/2026, print da tela): editar um
  // fornecedor que JÁ tinha categoria/centro padrão salvos abria o
  // diálogo com os dois campos em branco — e salvar assim APAGARIA o que
  // já estava certo no banco (confirmado com uma consulta direta: o
  // banco tinha os valores certos o tempo todo, só o diálogo é que
  // mostrava vazio).
  //
  // Causa raiz, achada instrumentando `onValueChange` com stack trace ao
  // vivo: o Radix `<Select>` mantém por baixo um `<select>` NATIVO
  // (escondido, só pra acessibilidade/autofill do navegador) espelhando
  // o `value`. Quando `campos.categoriaPadraoId` chega com um UUID no
  // MESMO instante em que `categorias.map(...)` ainda está inserindo as
  // `<option>` desse select nativo, o navegador não acha a opção
  // correspondente — e o próprio `<select>` nativo dispara um `change`
  // vazio, que o Radix repassa pro meu `onValueChange("")`, apagando o
  // valor certo que tinha acabado de chegar. Isso acontecia mesmo já
  // esperando as duas listas carregarem antes de preencher `campos`
  // (uma correção que tentei primeiro e não bastou): o problema não é a
  // ORDEM dos dados, é o navegador reconciliando o DOM do select nativo
  // um instante depois do React já ter passado o `value`.
  //
  // Correção que funciona: `key` no `<Select>` amarrada a
  // `listasProntas` — força o Radix (e o select nativo por baixo) a
  // desmontar e remontar do zero assim que as opções chegam, nascendo
  // JÁ com as `<option>` no lugar antes de receber um `value` não-vazio.
  // Sem isso, criar um fornecedor NOVO (sem categoria/centro ainda)
  // continua funcionando normalmente — o bug só aparece quando o
  // `value` inicial já é um UUID de verdade.
  const [listasProntas, setListasProntas] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setListasProntas(false);
    // Categoria padrão é sempre de despesa — fornecedor é de quem a igreja
    // COMPRA, nunca de quem ela recebe.
    Promise.all([listarCategorias("saida"), listarCentrosCusto()]).then(([cats, cents]) => {
      if (cancelado) return;
      setCategorias(cats);
      setCentros(cents);
      setListasProntas(true);
      if (fornecedor) {
        setCampos({
          nome: fornecedor.nome,
          tipo: fornecedor.tipo ?? "juridica",
          cnpjCpf: fornecedor.cnpj_cpf ?? "",
          email: fornecedor.email ?? "",
          telefone: fornecedor.telefone ?? "",
          chavePix: fornecedor.chave_pix ?? "",
          tipoChavePix: fornecedor.tipo_chave_pix ?? "",
          bancoNome: fornecedor.banco_nome ?? "",
          agencia: fornecedor.agencia ?? "",
          conta: fornecedor.conta ?? "",
          endereco: fornecedor.endereco ?? "",
          bairro: fornecedor.bairro ?? "",
          cidade: fornecedor.cidade ?? "",
          uf: fornecedor.uf ?? "",
          cep: fornecedor.cep ?? "",
          categoriaPadraoId: fornecedor.categoria_padrao_id ?? "",
          centroCustoPadraoId: fornecedor.centro_custo_padrao_id ?? "",
          observacao: fornecedor.observacao ?? "",
        });
      } else {
        setCampos(VAZIO);
      }
    });
    return () => { cancelado = true; };
  }, [open, fornecedor]);

  function set<K extends keyof typeof VAZIO>(campo: K, valor: typeof VAZIO[K]) {
    setCampos(c => ({ ...c, [campo]: valor }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ehPessoa && !campos.nome.trim()) { toast.error("Informe o nome"); return; }

    setBusy(true);
    try {
      // Favorecido-PESSOA: nome, CPF, telefone, e-mail e endereço são da ficha da pessoa — aqui só o que é financeiro.
      const dadosDaPessoa: Partial<FinFornecedor> = ehPessoa ? {} : {
        nome: campos.nome.trim(),
        tipo: campos.tipo,
        cnpj_cpf: campos.cnpjCpf.replace(/\D/g, "") || null,
        email: campos.email.trim() || null,
        telefone: campos.telefone.trim() || null,
        endereco: campos.endereco.trim() || null,
        bairro: campos.bairro.trim() || null,
        cidade: campos.cidade.trim() || null,
        uf: campos.uf.trim().toUpperCase() || null,
        cep: campos.cep.replace(/\D/g, "") || null,
      };
      const payload: Partial<FinFornecedor> = {
        ...dadosDaPessoa,
        chave_pix: campos.chavePix.trim() || null,
        tipo_chave_pix: campos.tipoChavePix || null,
        banco_nome: campos.bancoNome.trim() || null,
        agencia: campos.agencia.trim() || null,
        conta: campos.conta.trim() || null,
        categoria_padrao_id: campos.categoriaPadraoId || null,
        centro_custo_padrao_id: campos.centroCustoPadraoId || null,
        observacao: campos.observacao.trim() || null,
      };

      let salvo: FinFornecedor;
      if (isEdit && fornecedor) {
        await atualizarFornecedor(fornecedor.id, payload);
        salvo = { ...fornecedor, ...payload } as FinFornecedor;
        toast.success("Favorecido atualizado");
      } else {
        salvo = await criarFornecedor(payload);
        toast.success("Favorecido cadastrado");
      }

      onOpenChange(false);
      onSaved(salvo);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar favorecido");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gold" />
            {isEdit ? "Editar favorecido" : "Novo favorecido"}
          </DialogTitle>
          <DialogDescription>
            {!isEdit && etapa === "escolha"
              ? "Quem recebe um pagamento da igreja: uma pessoa do Cadastro de Pessoas ou uma empresa."
              : ehPessoa
                ? "Pessoa do Cadastro de Pessoas. Aqui ficam só os dados financeiros dela."
                : "Quem a igreja paga — empresa, prestador de serviço ou pessoa física de fora da igreja."}
          </DialogDescription>
        </DialogHeader>

        {!isEdit && etapa === "escolha" ? (
          <FavorecidoEscolha onEmpresa={() => setEtapa("formulario")}
            onFavorecido={(f) => { setVinculado(f); setEtapa("formulario"); onSaved(f); }} />
        ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          {ehPessoa && (
            <div className="rounded-md border bg-muted/20 p-3 flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{pessoaNome ?? fornecedor?.nome}</p>
                <p className="text-xs text-muted-foreground">Nome, CPF, telefone e endereço vêm da ficha da pessoa.</p>
              </div>
            </div>
          )}
          {!ehPessoa && (<>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm"
              variant={campos.tipo === "juridica" ? "gold" : "outline"}
              onClick={() => set("tipo", "juridica")}
              className="gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Pessoa jurídica
            </Button>
            <Button type="button" size="sm"
              variant={campos.tipo === "fisica" ? "gold" : "outline"}
              onClick={() => set("tipo", "fisica")}
              className="gap-1.5">
              <User className="w-3.5 h-3.5" /> Pessoa física
            </Button>
          </div>

          <div>
            <Label>Nome *</Label>
            <Input value={campos.nome} onChange={(e) => set("nome", e.target.value)} required
              placeholder={campos.tipo === "juridica" ? "Razão social" : "Nome completo"} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{campos.tipo === "juridica" ? "CNPJ" : "CPF"}</Label>
              <Input value={campos.cnpjCpf} onChange={(e) => set("cnpjCpf", e.target.value)}
                placeholder="Só números" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={campos.telefone} onChange={(e) => set("telefone", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>E-mail</Label>
            <Input type="email" value={campos.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          </>)}

          <div className="border rounded-md p-2 bg-muted/20 space-y-2">
            <p className="text-xs font-medium">Dados para pagamento</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Chave Pix</Label>
                <Input value={campos.chavePix} onChange={(e) => set("chavePix", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Tipo da chave</Label>
                <Select value={campos.tipoChavePix} onValueChange={(v) => set("tipoChavePix", v as TipoChavePix)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="(opcional)" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_CHAVE_PIX.map(t => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <Label className="text-xs">Banco</Label>
                <Input value={campos.bancoNome} onChange={(e) => set("bancoNome", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Agência</Label>
                <Input value={campos.agencia} onChange={(e) => set("agencia", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Conta</Label>
                <Input value={campos.conta} onChange={(e) => set("conta", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria padrão de despesa</Label>
              <Select key={listasProntas ? "cat-pronta" : "cat-carregando"}
                value={campos.categoriaPadraoId} onValueChange={(v) => set("categoriaPadraoId", v)}>
                <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Centro de custo padrão</Label>
              <Select key={listasProntas ? "centro-pronto" : "centro-carregando"}
                value={campos.centroCustoPadraoId} onValueChange={(v) => set("centroCustoPadraoId", v)}>
                <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-1.5">
            Os dois vêm preenchidos sozinhos (aguardando confirmação) ao lançar uma despesa com este favorecido.
          </p>

          {!ehPessoa && (<>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Endereço</Label>
              <Input value={campos.endereco} onChange={(e) => set("endereco", e.target.value)} />
            </div>
            <div>
              <Label>CEP</Label>
              <Input value={campos.cep} onChange={(e) => set("cep", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <Label>Bairro</Label>
              <Input value={campos.bairro} onChange={(e) => set("bairro", e.target.value)} />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={campos.cidade} onChange={(e) => set("cidade", e.target.value)} />
            </div>
            <div>
              <Label>UF</Label>
              <Input value={campos.uf} onChange={(e) => set("uf", e.target.value)} maxLength={2} />
            </div>
          </div>
          </>)}

          <div>
            <Label>Observação</Label>
            <Textarea rows={2} value={campos.observacao} onChange={(e) => set("observacao", e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : isEdit ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
