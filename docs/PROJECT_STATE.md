# Estado do projeto — 27/08/2026

> Atualize a data ao mexer aqui. Estado velho é pior que estado ausente.

## O que é

**DiakoniaApp** — gestão da Quarta Igreja Batista do Rio de Janeiro.
SPA React 18 + Vite + TypeScript, falando direto com o Supabase.
Sem backend próprio. Publicado na Vercel a partir de `main`.

- Local: `C:\Users\telma\Downloads\Diakonia_SIS\diakonia-main\diakonia-main`
- Remoto: `github.com/diakoniaapp/diakoniaapp`
- Supabase: projeto `prjoftmlkusbjoeptabp` — **é produção; não há homologação**
- 1.358 arquivos · 19,2 MB · 73 páginas · 143 tabelas

## ⚠️ Trabalho em andamento, NÃO commitado

A funcionalidade de **transmissão ao vivo** está pela metade:

| Peça | Situação |
|---|---|
| Migration `20260828240000` (colunas `transmissao_online`/`transmissao_url`) | **APLICADA em produção** |
| `src/lib/agenda/convite.ts` + testes (20) | criado, passando |
| Campo no formulário de evento | **falta** |
| `ConvidarParaEvento` usar a nova mensagem | **falta** |
| Passar os campos por `AgendaDoDia` | **falta** |
| Registrar as colunas em `types.ts` | **falta** |

Também não commitado: correções da agenda (fuso `hojeLocal`, padrão do fim de
série, aviso de filtro escondendo eventos, categoria faltante na impressão) e
17 testes novos de recorrência.

**Retomar por:** `docs/NEXT_TASK.md`.

## Verificação obrigatória antes de entregar

```bash
npx tsc --noEmit -p tsconfig.app.json   # NUNCA sem o -p
npx vite build
npx vitest run
```

131 testes hoje (eram 1 há três dias). Não há CI: se você não rodar, ninguém roda.

## Decisão em aberto com a Telma

- **EBD fora da agenda:** série semanal com regra de 04/01 a 04/01. Até quando vale?
- **Joice Fernanda** com aniversário 14/06 — é o real?
- **Andrea dos Santos** sem classe de EBD desde 27/08 — reativar?
- **`tipo = 'live'`** — aposentar ou só parar de oferecer?
