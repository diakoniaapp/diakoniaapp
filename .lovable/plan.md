## Evolução do Módulo de Eventos / Agenda — Estilo Google Calendar

Transformar a página `Eventos` em uma agenda institucional completa, com múltiplas visualizações, recorrência, exceções, cores por categoria, validação de conflitos e UX moderna (sem aparência de tabela).

---

### 1. Mudanças no banco de dados (migration única)

**Alterações em `eventos`:**
- `cor` (text, hex) — cor personalizada opcional
- `ministerio_principal_id` (uuid) — para derivar cor automaticamente
- `local_id` (uuid, FK lógica para `locais`) — substitui uso textual de `local` (mantém `local` para compatibilidade)
- `recorrencia_id` (uuid) — agrupa eventos de uma série
- `recorrencia_regra` (jsonb) — `{ freq, intervalo, dias_semana, fim: { tipo, data, ocorrencias } }`
- `is_excecao` (boolean) — true quando ocorrência foi modificada individualmente
- `ocorrencia_original_data` (date) — data original antes de mover/cancelar
- `serie_origem_id` (uuid) — referência ao evento "mestre" da série

**Novos índices:** `(data, local_id)`, `(recorrencia_id)`, `(ministerio_principal_id)`.

**Trigger de validação de conflito (DB-side):**
- Função `validate_evento_conflito()` que bloqueia INSERT/UPDATE quando existe outro evento `agendado`/`realizado` no mesmo `local_id`, `data`, com sobreposição de `hora_inicio`/`hora_fim`.
- Ignora a si mesmo (id) e eventos `cancelado`.

**Trigger de validação de agendamento:**
- Bloqueia se o `local_id` referenciado tiver `permite_agendamento = false` ou `status = 'inativo'`.

**Tipos:** novo enum `evento_recorrencia_freq` (`diario`, `semanal`, `mensal`, `anual`, `personalizado`).

---

### 2. Arquitetura de recorrência

- Série tem 1 evento "mestre" com `recorrencia_regra` e `recorrencia_id = id`.
- Ocorrências são **expandidas em runtime no cliente** dentro da janela visível (mês/semana/dia), evitando explosão de linhas no DB.
- Exceções são linhas reais com `is_excecao=true`, `serie_origem_id`, `ocorrencia_original_data`. Sobrescrevem a ocorrência calculada na mesma data.
- Cancelamentos individuais = exceção com `status='cancelado'`.
- "Este e os próximos" = encerra a série original em `data-1` e cria nova série a partir da data.
- "Toda a série" = update no evento mestre + remoção de exceções incompatíveis.

Biblioteca: `rrule` (npm) para gerar ocorrências a partir de regra.

---

### 3. Novas dependências

- `rrule` — geração de recorrências
- `date-fns` (já no projeto se possível) e `date-fns-tz`
- Reaproveitar `react-day-picker` / `Calendar` shadcn existente para mini-calendário

Não introduzir libs pesadas de calendário (FullCalendar). Construir views customizadas com Tailwind para visual app-like.

---

### 4. Estrutura de componentes (frontend)

```text
src/pages/Eventos.tsx                 (refeito como shell da agenda)
src/components/agenda/
  AgendaHeader.tsx                    (navegação datas, troca de view, busca)
  AgendaFilters.tsx                   (Ministério, Área, Tipo, Local, Status)
  MiniCalendar.tsx                    (sidebar)
  views/
    MonthView.tsx
    WeekView.tsx
    DayView.tsx
    ListView.tsx
  EventCard.tsx                       (chip de evento com cor)
  EventDialog.tsx                     (criação/edição completa)
  QuickCreatePopover.tsx              (clique rápido no slot horário)
  RecurrenceEditor.tsx                (regra de recorrência estilo Google)
  EditScopeDialog.tsx                 ("Apenas este / E os próximos / Toda a série")
  ConflictBanner.tsx
src/lib/agenda/
  recurrence.ts                       (rrule wrappers, expansão por janela)
  colors.ts                           (paleta por ministério/tipo, contraste)
  conflicts.ts                        (checagem client-side preventiva)
  types.ts
```

---

### 5. Visualizações

- **Mês:** grid 7xN, eventos compactos com cor; clicar dia abre Day view.
- **Semana:** colunas por dia, eixo horário 06h–23h, slots de 30 min, suporta drag/resize.
- **Dia:** uma coluna grande; mostra eventos com cor + ministério.
- **Lista (Agenda):** agrupado por data, scroll infinito 60 dias.
- **Mobile (<768px):** sempre força Lista vertical + FAB "+".

Destaque do hoje: fundo `bg-primary/10` + borda.

Transições: `animate-fade-in` ao trocar de view; `framer-motion` opcional adiado.

---

### 6. Drag & resize

- HTML5 drag-and-drop nativo na Week/Day view:
  - Drop em outro slot → update `data`, `hora_inicio`, `hora_fim` (mantém duração).
  - Resize via handle inferior (mousedown + mousemove) ajusta `hora_fim`.
- Para eventos recorrentes, ao soltar abrir `EditScopeDialog`.

---

### 7. Criação rápida

- Clique em slot vazio → `QuickCreatePopover` posicionado no slot com:
  - Título, Local (select), horário pré-preenchido.
  - Botão "Mais opções" → abre `EventDialog` completo.

---

### 8. Cores

- `colors.ts` mapeia ministério → cor (gerada por hash determinístico) e tipo → cor fixa institucional (Culto azul, Reunião verde, Especial roxo, Ensaio âmbar, etc.).
- Modo escolhido em filtro: **"Colorir por: Ministério | Tipo"**.
- Campo `cor` no evento sobrescreve quando definido.

---

### 9. Filtros

- Multi-select por Ministério, Área, Tipo, Local, Status.
- Persistir filtros em `localStorage`.
- Aplicado client-side sobre dataset carregado pela janela visível.

---

### 10. Validação de conflito

- Cliente: pré-verificação (mostra `ConflictBanner` antes de submeter).
- Servidor: trigger garante integridade mesmo em race conditions.
- Mensagem: **"Este local já está reservado neste horário."** mostrando evento concorrente.

---

### 11. Status

- `agendado` (cor cheia), `realizado` (cor cheia + check), `cancelado` (cor com tachado + opacidade 50% + badge "Cancelado"). Cancelados permanecem visíveis.

---

### 12. Preparação para Escalas (sem implementar)

- Manter `evento_areas` e `evento_ministerios` (já existem).
- `EventDialog` já permite vincular múltiplas áreas (sem restrição de ministério) e 1–2 ministérios responsáveis.
- Reservar comentário/seção "Escala (em breve)" no dialog.

---

### 13. Compatibilidade

- Não remover campo `local` (texto) — popular `local_id` quando possível; novo cadastro exige `local_id`.
- Eventos existentes continuam visíveis; sem migração de dados destrutiva.

---

### Entregáveis

1. Migration: novos campos, enum, triggers, índices.
2. Instalação de `rrule`.
3. Novos componentes em `src/components/agenda/`.
4. Reescrita de `src/pages/Eventos.tsx` como shell.
5. Atualização do menu/rota mantendo URL `/eventos`.

Itens **fora deste escopo** (avisar no fim): notificações por e-mail, sincronização com Google Calendar externo, módulo de Escalas em si.
