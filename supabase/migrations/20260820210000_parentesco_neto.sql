-- ─── "Neto(a)" entra no vocabulário de parentesco ──────────────────────────
--
-- O enum tinha `avo` — 5 vínculos em uso — e não tinha o outro lado. Dava para
-- registrar que alguém é o avô da família e não dava para registrar o neto,
-- que é o caso muito mais frequente numa igreja: criança que vem com a avó.
--
-- Quem precisava disso caía em "Outro vínculo", e ali a informação morre: o
-- sistema deixa de saber que há uma criança sob a responsabilidade de alguém.
--
-- ── POSIÇÃO ────────────────────────────────────────────────────────────────
--
-- `AFTER 'avo'`, e não no fim. A ordem do enum é a ordem em que os parentescos
-- aparecem no seletor do formulário, e `avo`/`neto` são as duas pontas da
-- mesma relação — separá-las obrigaria quem lê a percorrer a lista inteira.
--
-- `ALTER TYPE ... ADD VALUE` não roda dentro de transação junto com o uso do
-- valor novo, por isso esta migration não abre BEGIN.

ALTER TYPE public.parentesco_tipo ADD VALUE IF NOT EXISTS 'neto' AFTER 'avo';
