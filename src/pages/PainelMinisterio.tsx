// ─── PainelMinisterio.tsx — a bancada de quem lidera ──────────────────────
//
// O terceiro painel da casa, com a mesma forma dos dois primeiros: cabeçalho
// fixo com título, frase de atenção e a faixa que é o índice da tela.
//
// ── POR QUE ELE EXISTE ─────────────────────────────────────────────────────
//
// Havia três telas SOBRE ministérios — a lista em `/ministerios`, as áreas em
// `/areas`, os voluntários em `/ministerios/:id/voluntarios` — e nenhuma DE um
// ministério. Quem lidera precisava de três endereços para responder "como
// está o meu?", e o checklist de tarefas não tinha endereço nenhum.
//
// ── QUEM ABRE ──────────────────────────────────────────────────────────────
//
// Quem LIDERA este ministério, mais o dono do sistema. Nada de "pastoral abre
// tudo": a regra da igreja é "ADMINISTRADOR dono do sistema vê tudo e todos;
// Pastor Titular vê o painel pastoral apenas".
//
// A liderança é lida das colunas `lider_id` das tabelas, e NÃO de
// `fn_meu_ministerio_id()` — essa função lê da tabela `liderancas`, que está
// vazia, e devolve NULL para todo mundo. Ver a nota longa em
// `painelMinisterioService.ts`.
//
// Isso quer dizer que o painel segue o CADASTRO: hoje o Ministério de
// Administração é do Caio Marcelo; amanhã, de quem a secretaria registrar no
// lugar dele. Nenhum nome está escrito no código.
//
// Quem não lidera nada encontra uma explicação, não uma tela vazia. É o caso
// real do Bruno: tem papel de liderança e não lidera área nenhuma hoje.
//
// ── O CHECKLIST ────────────────────────────────────────────────────────────
//
// Tarefas fixas da ÁREA, conferidas a cada ESCALA — que é como o banco já
// modelou (`checklist_area` + `checklist_execucao`) e como o Bazar já funciona
// há 204 execuções. A área define "abrir o som" uma vez; cada escala gera a
// conferência daquele dia, com quem marcou e quando.
//
// Esta tela é a primeira a escrever nessas duas tabelas.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Boxes, Users, CalendarClock, ListChecks, ChevronRight, RefreshCw,
  Plus, Trash2, Check, AlertTriangle, Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { NomePessoa } from "@/components/membros/ficha";
import {
  Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao, formatarAtualizadoHa,
} from "@/components/painel/blocos";
import { useAuth } from "@/hooks/useAuth";
import { formatarTelefone } from "@/lib/telefone";
import {
  carregarPainelMinisterio, meusMinisterios, escalasFuturas,
  estaServindo, estaSobrecarregado,
  criarTarefa, aposentarTarefa, execucoesDaEscala, marcarTarefa,
  type PainelMinisterio as Painel, type MinisterioQueLidero,
  type EscalaDoMinisterio, type TarefaDaArea,
} from "@/services/painelMinisterioService";
import { carregarBancadaEbd, type BancadaEbd } from "@/services/bancadaEbdService";
import { SecaoEbd } from "@/components/painel/SecaoEbd";
import { carregarBancadaArrecadacao, type BancadaArrecadacao } from "@/services/bancadaArrecadacaoService";
import { SecaoArrecadacao } from "@/components/painel/SecaoArrecadacao";
import { carregarBancadaPgm, type BancadaPgm } from "@/services/bancadaPgmService";
import { SecaoPgm } from "@/components/painel/SecaoPgm";
import { ComposicaoPorFuncao, composicao } from "@/components/painel/ComposicaoPorFuncao";
import { GraduationCap, ShoppingBag, Home as Casa } from "lucide-react";

export default function PainelMinisterio() {
  const { ministerioId } = useParams<{ ministerioId: string }>();
  const { pessoaId, hasRole } = useAuth();
  const [painel, setPainel] = useState<Painel | null>(null);
  const [meus, setMeus] = useState<MinisterioQueLidero[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  // A bancada específica do ministério, quando ele opera um módulo. Fica
  // separada de `painel` porque é outra ida ao banco e nem todo painel a tem.
  const [ebd, setEbd] = useState<BancadaEbd | null>(null);
  const [arr, setArr] = useState<BancadaArrecadacao | null>(null);
  const [pgm, setPgm] = useState<BancadaPgm | null>(null);

  // ── SÓ O DONO DO SISTEMA ABRE MINISTÉRIO ALHEIO ──────────────────────
  //
  // Era `[admin, secretaria, diakonia, pastor]`. A regra da igreja, dita em
  // 01/09/2026, é mais estreita: "ADMINISTRADOR dono do sistema vê tudo e
  // todos. Pastor Titular vê o painel pastoral apenas. É o filtro para cada
  // ministério."
  //
  // Então o pastor titular abre o Painel Pastoral e mais nada; a secretária, o
  // dela. Quem lidera um ministério abre o dele — e isso vem de `lidero`,
  // logo abaixo, que lê o cadastro e não uma lista de papéis.
  //
  // `hasRole` respeita o "Ver como": a administradora simulando liderança vê o
  // que a liderança veria, que é o ponto daquele modo.
  const ehDonoDoSistema = hasRole("admin");

  const carregar = useCallback(async () => {
    if (!ministerioId) return;
    setCarregando(true);
    setErro(null);
    try {
      const [p, m] = await Promise.all([
        carregarPainelMinisterio(ministerioId),
        pessoaId ? meusMinisterios(pessoaId) : Promise.resolve([]),
      ]);
      setPainel(p);
      setMeus(m);

      // A bancada específica é uma SEGUNDA ida ao banco, e só para quem tem
      // módulo. Pedi-la junto das outras duas custaria seis consultas de EBD
      // em dez dos onze painéis, para jogar fora.
      setEbd(p?.modulo === "ebd" ? await carregarBancadaEbd() : null);
      setArr(p?.modulo === "arrecadacao" ? await carregarBancadaArrecadacao() : null);
      setPgm(p?.modulo === "pgm" ? await carregarBancadaPgm() : null);

      setAtualizadoEm(new Date());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, [ministerioId, pessoaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const lidero = (meus ?? []).find(m => m.id === ministerioId);
  const podeVer = ehDonoDoSistema || !!lidero;
  const podeEditarTarefas = hasRole(["admin", "lideranca"]);

  if (carregando && !painel) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (erro) {
    return <p className="p-6 text-sm text-destructive-text">{erro}</p>;
  }
  if (!painel) {
    return <p className="p-6 text-sm text-muted-foreground">Ministério não encontrado.</p>;
  }
  if (!podeVer) return <SemAcesso meus={meus ?? []} />;

  return (
    <div className="p-6 space-y-4 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
      {/* O cabeçalho acompanha a rolagem, como nos painéis Pastoral e da
          Secretaria. `-mx-6 px-6` porque o container tem `p-6`: sem estender,
          o conteúdo rolaria visível pelas laterais do bloco fixo. */}
      <div className="sticky top-0 z-20 bg-background -mx-6 px-6 -mt-6 pt-6 pb-3 space-y-3 border-b">
        <div className="flex items-start justify-between gap-3">
          {/* ── "Administração" quer dizer DUAS coisas nesta igreja ────────

              O papel `admin`, que é o dono do sistema, e o Ministério de
              Administração, que é uma equipe com líder e áreas. A tela
              mostrava só "Administração", e o nome sozinho não escolhe entre
              as duas.

              A palavra MINISTÉRIO entra como sobrescrito, e não colada ao
              nome: "Ministério de Administração" funcionaria, mas o mesmo
              molde produziria "Ministério de Pastoral" e "Ministério de
              Celebrando a Transformação". Os nomes vêm do cadastro e não
              seguem um padrão único — juntar as duas palavras à força
              quebraria em três dos onze. */}
          <div className="min-w-0">
            <span className="block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Ministério
            </span>
            <h1 className="font-serif text-2xl flex items-center gap-2 min-w-0">
              <Boxes className="w-6 h-6 text-gold shrink-0" />
              <span className="truncate">{painel.nome}</span>
            </h1>
            {/* Quem lidera vem do CADASTRO, e é assim que se lê aqui: hoje o
                Caio Marcelo, amanhã quem a secretaria registrar em
                `ministerios.lider_id`. A tela não conhece nome nenhum de cor.

                Antes esta linha era "Líder de área · Caio Marcelo", com o meu
                papel e o líder colados por um ponto — e lia-se como se o Caio
                fosse o líder de área. São duas informações diferentes, e agora
                a segunda desce para a sua própria linha. */}
            <p className="text-sm text-muted-foreground truncate">
              {painel.lider ? `Líder: ${painel.lider}` : "Sem líder cadastrado"}
            </p>
            {lidero && (
              <p className="text-xs text-muted-foreground truncate">
                Você aqui é {lidero.comoLidero.toLowerCase()}
                {lidero.areasQueLidero.length > 0 && ` de ${lidero.areasQueLidero.join(", ")}`}
              </p>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={carregar}
            disabled={carregando} className="gap-1.5 text-xs shrink-0">
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <p className="text-sm text-muted-foreground flex items-start gap-1.5">
          <Boxes className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
          <span className="min-w-0">
            {resumoNatural(painel, ebd, arr, pgm)}
            {atualizadoEm && (
              <span className="text-[10px] text-muted-foreground ml-1.5 whitespace-nowrap">
                · {formatarAtualizadoHa(atualizadoEm)}
              </span>
            )}
          </span>
        </p>

        {/* Índice, não painel de números — a mesma decisão dos outros dois. */}
        {/* Ganha uma quinta coluna quando o ministério opera um módulo, e o
            chip dele vem PRIMEIRO — na mesma ordem em que as seções aparecem
            abaixo. Uma tira que mente sobre a ordem já custou um defeito
            nesta casa, e por isso a da Home está travada por teste. */}
        <FaixaDeIndicadores colunas={ebd || arr || pgm ? 5 : 4}>
          {ebd && (
            <Indicador rotulo="Escola" tom="violeta" icone={GraduationCap}
              onClick={() => irParaSecao("ebd")} descricao="Ir para a Escola Bíblica" />
          )}
          {arr && (
            <Indicador rotulo="Bazar" tom="gold" icone={ShoppingBag}
              onClick={() => irParaSecao("arrecadacao")} descricao="Ir para Bazar e Cantina" />
          )}
          {pgm && (
            <Indicador rotulo="Grupos" tom="success" icone={Casa}
              onClick={() => irParaSecao("pgm")} descricao="Ir para Pequenos Grupos" />
          )}
          <Indicador rotulo="Áreas" tom="info" icone={Boxes}
            onClick={() => irParaSecao("areas")} descricao="Ir para Áreas" />
          <Indicador rotulo="Equipe" tom="success" icone={Users}
            onClick={() => irParaSecao("equipe")} descricao="Ir para Quem serve" />
          <Indicador rotulo="Escalas" tom="gold" icone={CalendarClock}
            onClick={() => irParaSecao("escalas")} descricao="Ir para Escalas" />
          <Indicador rotulo="Checklist" tom="violeta" icone={ListChecks}
            onClick={() => irParaSecao("checklist")} descricao="Ir para Checklist de tarefas" />
        </FaixaDeIndicadores>
      </div>

      {/* A bancada do módulo vem PRIMEIRO: para a Educação Cristã, o
          trabalho é a Escola, e as três áreas dela são consequência disso.
          As quatro seções comuns continuam abaixo, iguais para os onze. */}
      {ebd && <SecaoEbd ebd={ebd} />}
      {arr && <SecaoArrecadacao arr={arr} />}
      {pgm && <SecaoPgm pgm={pgm} />}

      <SecaoAreas painel={painel} />
      <SecaoEquipe painel={painel} />
      <SecaoEscalas painel={painel} pessoaId={pessoaId} />
      <SecaoChecklist painel={painel} podeEditar={podeEditarTarefas} aoMudar={carregar} />
    </div>
  );
}

// ─── A frase de atenção ───────────────────────────────────────────────────

/**
 * O que este ministério precisa, em português.
 *
 * A ordem é de urgência, e o critério de cada item é medido, não estimado:
 *
 *   escala sem ninguém    tem data marcada e zero escalados. É o único item
 *                         com prazo — passa a data e vira falta.
 *   área abaixo do mínimo `min_voluntarios` está preenchido nas 20 áreas, e
 *                         é a própria igreja que declarou o piso.
 *   sobrecarga            a view já calcula `nivel_sobrecarga`; a tela só lê.
 *   área sem checklist    não é urgência, é o convite a começar — e some
 *                         sozinho quando a área ganha a primeira tarefa.
 */
function resumoNatural(
  p: Painel,
  ebd: BancadaEbd | null,
  arr: BancadaArrecadacao | null,
  pgm: BancadaPgm | null,
): string {
  const futuras = escalasFuturas(p.escalas);
  const partes: string[] = [];

  // ── A BANCADA DO MÓDULO ENTRA AQUI, E ENTRA PRIMEIRO ─────────────────
  //
  // Sem isto o painel se contradizia dentro da mesma tela: o resumo dizia
  // "Nada urgente. 3 áreas ainda não têm checklist" enquanto, dois
  // centímetros abaixo, a Escola avisava 5 classes sem chamada e uma classe
  // com nove crianças e nenhum professor. O resumo só sabia de áreas,
  // escalas e voluntários — e para a Educação Cristã é o que menos importa.
  //
  // Primeiro porque é o mais grave: uma classe sem professor é uma criança
  // sem quem a receba no domingo; um checklist faltando, não.
  // Caixa aberto ganha de tudo o mais que este painel sabe: é dinheiro sem
  // dono, e conciliação que não acontece. Vem antes até do que a Escola
  // avisa, e muito antes de checklist de área.
  if (arr) {
    if (arr.caixasAbertos.length > 0) {
      const mais = arr.caixasAbertos[0].diasAberto;
      partes.push(`${arr.caixasAbertos.length} ${arr.caixasAbertos.length === 1
        ? "caixa sem fechamento" : "caixas sem fechamento"}` +
        (mais > 0 ? ` (o mais antigo há ${mais} dias)` : ""));
    }
    if (arr.vencidas > 0) {
      partes.push(`${arr.vencidas} ${arr.vencidas === 1
        ? "reserva por encerrar" : "reservas por encerrar"}`);
    }
    if (arr.manutencao.length > 0) {
      partes.push(`${arr.manutencao.length} ${arr.manutencao.length === 1
        ? "pendência de manutenção" : "pendências de manutenção"}`);
    }
  }

  // Pequenos Grupos: o que este ministério considera urgente não é só o que
  // está parado, é também o que falta existir. Um grupo sem reunião e um
  // bairro sem grupo pesam diferente, e os dois entram.
  if (pgm) {
    if (pgm.semMembros.length > 0) {
      partes.push(`${pgm.semMembros.length} ${pgm.semMembros.length === 1
        ? "grupo sem nenhum membro" : "grupos sem nenhum membro"}`);
    }
    if (pgm.semReuniao.length > 0) {
      partes.push(`${pgm.semReuniao.length} ${pgm.semReuniao.length === 1
        ? "grupo sem reunião registrada" : "grupos sem reunião registrada"}`);
    }
  }

  if (ebd) {
    if (ebd.semProfessor.length > 0) {
      partes.push(`${ebd.semProfessor.length} ${ebd.semProfessor.length === 1
        ? "classe com aluno e sem professor" : "classes com aluno e sem professor"}`);
    }
    if (ebd.semChamada.length > 0) {
      partes.push(`${ebd.semChamada.length} ${ebd.semChamada.length === 1
        ? "classe sem chamada" : "classes sem chamada"}`);
    }
    if (ebd.foraDaFaixa.length > 0) {
      partes.push(`${ebd.foraDaFaixa.length} ${ebd.foraDaFaixa.length === 1
        ? "aluno fora da faixa da classe" : "alunos fora da faixa da classe"}`);
    }
  }

  const vazias = futuras.filter(e => e.escalados === 0).length;
  if (vazias > 0) {
    partes.push(`${vazias} ${vazias === 1 ? "escala sem ninguém escalado" : "escalas sem ninguém escalado"}`);
  }

  const abaixo = p.areas.filter(a => (a.min_voluntarios ?? 0) > 0 && a.voluntarios < (a.min_voluntarios ?? 0));
  if (abaixo.length > 0) {
    partes.push(`${abaixo.length} ${abaixo.length === 1 ? "área abaixo do mínimo" : "áreas abaixo do mínimo"} de voluntários`);
  }

  // ── QUEM FAZ O QUÊ, QUANDO A IGREJA NÃO SABE ─────────────────────────
  //
  // Medido em 02/09/2026: 80 dos 128 vínculos ativos da igreja não têm
  // função — 62%. A Comunhão tem 25 de 44.
  //
  // O aviso só sobe ao resumo quando passa da METADE da equipe. Abaixo
  // disso é um dado que a seção "Quem serve" já mostra, e repeti-lo aqui
  // encheria de ruído os painéis pequenos: um ministério de três pessoas com
  // uma sem função não tem problema nenhum.
  const equipe = p.voluntarios.filter(estaServindo);
  const { semFuncao, total: naEquipe } = composicao(equipe);
  if (naEquipe >= 4 && semFuncao * 2 > naEquipe) {
    partes.push(`${semFuncao} de ${naEquipe} sem função definida`);
  }

  const pesados = p.voluntarios.filter(estaSobrecarregado).length;
  if (pesados > 0) {
    partes.push(`${pesados} ${pesados === 1 ? "voluntário sobrecarregado" : "voluntários sobrecarregados"}`);
  }

  if (partes.length > 0) return `Atenção: ${partes.join(", ")}.`;

  const semLista = p.areas.filter(a => a.tarefas === 0).length;
  if (semLista > 0) {
    return `Nada urgente. ${semLista === 1
      ? "Uma área ainda não tem checklist de tarefas."
      : `${semLista} áreas ainda não têm checklist de tarefas.`}`;
  }
  const ativos = p.voluntarios.filter(estaServindo).length;
  return `Tudo em ordem — ${p.areas.length} ${p.areas.length === 1 ? "área" : "áreas"} e ${ativos} ${ativos === 1 ? "voluntário" : "voluntários"} servindo. 🙏`;
}

// ─── Áreas ────────────────────────────────────────────────────────────────

function SecaoAreas({ painel }: { painel: Painel }) {
  return (
    <section id="areas" className="scroll-mt-[240px]">
      <TituloDaSecao icone={Boxes} tom="info" contagem={painel.areas.length}>
        Áreas
      </TituloDaSecao>
      {painel.areas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
          Este ministério ainda não tem áreas cadastradas.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {painel.areas.map(a => {
            const piso = a.min_voluntarios ?? 0;
            const faltam = piso > 0 ? piso - a.voluntarios : 0;
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate min-w-0">{a.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.voluntarios} {a.voluntarios === 1 ? "voluntário" : "voluntários"}
                    {piso > 0 ? ` · mínimo ${piso}` : ""}
                    {a.tarefas > 0 ? ` · ${a.tarefas} ${a.tarefas === 1 ? "tarefa" : "tarefas"}` : " · sem checklist"}
                  </p>
                </div>
                {/* O aviso só aparece quando a própria igreja declarou um piso
                    e ele não está sendo cumprido. Sem `min_voluntarios`, não
                    há como saber se três pessoas são muitas ou poucas. */}
                {faltam > 0 && (
                  <Badge variant="outline" className="shrink-0 gap-1 text-xs text-warning-text border-warning-line">
                    <AlertTriangle className="w-3 h-3" />
                    faltam {faltam}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Quem serve ───────────────────────────────────────────────────────────

function SecaoEquipe({ painel }: { painel: Painel }) {
  const ativos = painel.voluntarios.filter(estaServindo);
  const afastados = painel.voluntarios.filter(v => !estaServindo(v));

  return (
    <section id="equipe" className="scroll-mt-[240px]">
      <TituloDaSecao icone={Users} tom="success" contagem={ativos.length}
        acao={<Link to={`/ministerios/${painel.id}/voluntarios`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
          Ver tudo <ChevronRight className="w-3 h-3" />
        </Link>}>
        Quem serve
      </TituloDaSecao>

      {/* A composição vem ANTES da lista de nomes: quem lidera pergunta
          primeiro "tenho baterista?" e só depois "quem é". Na Música isso é
          a pergunta inteira; nos outros dez é o resumo de uma lista que só
          mostra doze de cada vez. */}
      {ativos.length > 0 && <ComposicaoPorFuncao voluntarios={ativos} />}

      {ativos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
          Ninguém cadastrado como voluntário neste ministério.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {ativos.slice(0, 12).map(v => (
            <li key={`${v.pessoa_id}-${v.area_id}`} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
              <div className="min-w-0 flex-1">
                <NomePessoa id={v.pessoa_id} nome={v.nome_completo}
                  className="text-sm font-medium truncate block min-w-0" />
                <p className="text-xs text-muted-foreground truncate">
                  {[v.area_nome, v.funcao].filter(Boolean).join(" · ") || "sem área"}
                  {v.total_escalas ? ` · ${v.total_escalas} ${v.total_escalas === 1 ? "escala" : "escalas"}` : ""}
                </p>
              </div>
              {/* Sobrecarga vem calculada da view — a tela não recalcula nem
                  inventa faixa. Só os dois níveis que pedem conversa. */}
              {estaSobrecarregado(v) && (
                <Badge variant="outline" className="shrink-0 text-xs text-warning-text border-warning-line">
                  servindo demais
                </Badge>
              )}
              {v.telefone_celular && (
                <a href={`https://wa.me/${v.telefone_celular.replace(/\D/g, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  title={`Falar com ${v.nome_completo} — ${formatarTelefone(v.telefone_celular)}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground">
                  <Phone className="w-3.5 h-3.5" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Quem parou de servir continua visível, e em voz baixa: é informação
          pastoral, não uma falha a corrigir. */}
      {afastados.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1.5 px-1">
          {afastados.length} {afastados.length === 1 ? "pessoa afastada" : "pessoas afastadas"} ou em descanso.
        </p>
      )}
      {ativos.length > 12 && (
        <p className="text-xs text-muted-foreground mt-1.5 px-1">
          Mostrando 12 de {ativos.length}. A lista inteira está em “Ver tudo”.
        </p>
      )}
    </section>
  );
}

// ─── Escalas, com o checklist do dia ──────────────────────────────────────

function SecaoEscalas({ painel, pessoaId }: { painel: Painel; pessoaId: string | null }) {
  // A view `v_proximas_escalas` já filtra por data e ordena; não há o que
  // recortar aqui. `escalasFuturas` continua exportada para quem receber uma
  // lista que inclua o passado.
  const futuras = painel.escalas;
  const [aberta, setAberta] = useState<string | null>(null);

  return (
    <section id="escalas" className="scroll-mt-[240px]">
      <TituloDaSecao icone={CalendarClock} tom="gold" contagem={futuras.length}>
        Próximas escalas
      </TituloDaSecao>

      {futuras.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
          {painel.totalDeEscalas === 0
            ? "Nenhuma escala criada para este ministério."
            : "Nenhuma escala à frente — as anteriores já aconteceram."}
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {futuras.map(e => (
            <LinhaEscala
              key={e.id} escala={e} painel={painel} pessoaId={pessoaId}
              aberta={aberta === e.id}
              onAlternar={() => setAberta(aberta === e.id ? null : e.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaEscala({ escala, painel, pessoaId, aberta, onAlternar }: {
  escala: EscalaDoMinisterio; painel: Painel; pessoaId: string | null;
  aberta: boolean; onAlternar: () => void;
}) {
  const tarefas = painel.tarefas.filter(t => t.area_id === escala.area_id);
  const [feitas, setFeitas] = useState<Set<string>>(new Set());
  const [carregado, setCarregado] = useState(false);

  // Só busca a conferência quando a linha abre: são até 30 escalas na tela, e
  // uma consulta por linha na montagem seria trinta viagens para mostrar o
  // que quase ninguém vai abrir.
  useEffect(() => {
    if (!aberta || carregado) return;
    execucoesDaEscala(escala.id).then(ex => {
      setFeitas(new Set(ex.filter(x => x.status === "concluido").map(x => x.tarefa_id)));
      setCarregado(true);
    });
  }, [aberta, carregado, escala.id]);

  const alternar = async (t: TarefaDaArea) => {
    const marcando = !feitas.has(t.id);
    // Otimista, e desfeito quando o banco recusa: marcar caixa é gesto rápido
    // e esperar a viagem faria a caixa parecer travada.
    setFeitas(s => {
      const n = new Set(s);
      if (marcando) n.add(t.id); else n.delete(t.id);
      return n;
    });
    const r = await marcarTarefa(escala.id, t.id, marcando, pessoaId);
    if (!r.ok) {
      setFeitas(s => {
        const n = new Set(s);
        if (marcando) n.delete(t.id); else n.add(t.id);
        return n;
      });
      toast.error(r.erro);
    }
  };

  return (
    <li className="min-w-0">
      <button type="button" onClick={onAlternar}
        className="w-full flex items-center gap-3 px-3 py-2.5 min-w-0 text-left hover:bg-muted transition-colors">
        <div className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
          {escala.data_evento.slice(8, 10)}/{escala.data_evento.slice(5, 7)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate min-w-0">{escala.titulo ?? "Escala"}</p>
          <p className="text-xs text-muted-foreground truncate">
            {[escala.area_nome, escala.hora_inicio?.slice(0, 5), escala.local]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
        {/* "0 de 0" seria ruído; a escala sem ninguém é o alerta em si. */}
        {escala.escalados === 0 ? (
          <Badge variant="outline" className="shrink-0 text-xs text-warning-text border-warning-line">
            sem ninguém
          </Badge>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {escala.confirmados}/{escala.escalados}
          </span>
        )}
        <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${aberta ? "rotate-90" : ""}`} />
      </button>

      {aberta && (
        <div className="px-3 pb-3 pl-[4.25rem]">
          {tarefas.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              A área {escala.area_nome ? `“${escala.area_nome}” ` : ""}ainda não tem checklist.
              Crie as tarefas na seção abaixo e elas aparecem aqui em toda escala.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {tarefas.map(t => (
                <li key={t.id} className="flex items-start gap-2 min-w-0">
                  <Checkbox id={`${escala.id}-${t.id}`} checked={feitas.has(t.id)}
                    onCheckedChange={() => alternar(t)} className="mt-0.5 shrink-0" />
                  <label htmlFor={`${escala.id}-${t.id}`}
                    className={`text-sm min-w-0 cursor-pointer ${feitas.has(t.id) ? "text-muted-foreground line-through decoration-1" : ""}`}>
                    {t.nome_tarefa}
                    {t.obrigatoria && <span className="text-gold ml-1" title="Tarefa obrigatória">*</span>}
                    {t.descricao && (
                      <span className="block text-xs text-muted-foreground no-underline">{t.descricao}</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ─── O checklist da área ──────────────────────────────────────────────────

function SecaoChecklist({ painel, podeEditar, aoMudar }: {
  painel: Painel; podeEditar: boolean; aoMudar: () => void;
}) {
  return (
    <section id="checklist" className="scroll-mt-[240px]">
      <TituloDaSecao icone={ListChecks} tom="violeta" contagem={painel.tarefas.length}>
        Checklist de tarefas
      </TituloDaSecao>

      <p className="text-xs text-muted-foreground px-1 mb-2">
        As tarefas são da área e valem para toda escala dela. Quem serve confere
        no dia, abrindo a escala em “Próximas escalas”.
      </p>

      <div className="space-y-3">
        {painel.areas.map(a => (
          <ChecklistDaArea key={a.id} areaId={a.id} areaNome={a.nome}
            tarefas={painel.tarefas.filter(t => t.area_id === a.id)}
            podeEditar={podeEditar} aoMudar={aoMudar} />
        ))}
      </div>
    </section>
  );
}

function ChecklistDaArea({ areaId, areaNome, tarefas, podeEditar, aoMudar }: {
  areaId: string; areaNome: string; tarefas: TarefaDaArea[];
  podeEditar: boolean; aoMudar: () => void;
}) {
  const [nova, setNova] = useState("");
  const [salvando, setSalvando] = useState(false);

  const adicionar = async () => {
    const nome = nova.trim();
    if (!nome) return;
    setSalvando(true);
    try {
      const r = await criarTarefa(areaId, nome, { ordem: tarefas.length });
      if (!r.ok) { toast.error(r.erro); return; }
      setNova("");
      toast.success("Tarefa criada.");
      aoMudar();
    } finally { setSalvando(false); }
  };

  const remover = async (t: TarefaDaArea) => {
    const r = await aposentarTarefa(t.id);
    if (!r.ok) { toast.error(r.erro); return; }
    toast.success(`“${t.nome_tarefa}” saiu do checklist.`);
    aoMudar();
  };

  return (
    <div className="rounded-md border bg-card">
      <p className="px-3 py-2 text-sm font-medium border-b truncate min-w-0">{areaNome}</p>

      {tarefas.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          Sem tarefas ainda.
        </p>
      ) : (
        <ul className="divide-y">
          {tarefas.map(t => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2 min-w-0">
              <Check className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate min-w-0">
                  {t.nome_tarefa}
                  {t.obrigatoria && <span className="text-gold ml-1" title="Obrigatória">*</span>}
                </p>
                {t.descricao && (
                  <p className="text-xs text-muted-foreground truncate">{t.descricao}</p>
                )}
              </div>
              {podeEditar && (
                <Button size="sm" variant="ghost" className="px-2 shrink-0"
                  title={`Tirar “${t.nome_tarefa}” do checklist`}
                  onClick={() => remover(t)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeEditar && (
        <div className="flex gap-2 px-3 py-2 border-t">
          <Input value={nova} onChange={e => setNova(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
            placeholder="Nova tarefa — ex.: conferir microfones"
            className="h-8 text-sm" />
          <Button size="sm" onClick={adicionar} disabled={salvando || !nova.trim()}
            className="gap-1.5 shrink-0">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Quem não lidera nada ─────────────────────────────────────────────────

/**
 * A tela de quem chegou aqui sem liderar este ministério.
 *
 * Explica, e oferece o caminho quando há um. O caso real: o Bruno tem papel de
 * `lideranca` e não lidera área nenhuma hoje — para ele, um painel vazio diria
 * que algo quebrou.
 */
function SemAcesso({ meus }: { meus: MinisterioQueLidero[] }) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-3">
      <h1 className="font-serif text-2xl">Este painel é de quem lidera</h1>
      {meus.length === 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            Você não está cadastrado como líder de nenhum ministério ou área. Quem
            registra isso é a secretaria, no cadastro do ministério.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/ministerios">Ver os ministérios da igreja</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Você lidera {meus.length === 1 ? "este" : "estes"}:
          </p>
          <ul className="space-y-1.5">
            {meus.map(m => (
              <li key={m.id}>
                <Link to={`/ministerios/${m.id}/painel`}
                  className="text-sm text-gold-text hover:underline">
                  {m.nome} <span className="text-muted-foreground">· {m.comoLidero}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
