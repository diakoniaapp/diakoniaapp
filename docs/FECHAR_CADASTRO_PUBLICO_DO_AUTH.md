# Fechar o cadastro público do Auth — passo a passo (20/10/2026)

**O risco.** O Auth de produção aceita cadastro de qualquer pessoa (`disable_signup = false`) e confirma a conta na hora (`mailer_autoconfirm = true`). A URL do projeto e a chave anônima vão no pacote do navegador; com elas, qualquer estranho cria uma conta e entra, com papel `membro`. Medido hoje: **nenhum estranho se cadastrou** (27 perfis, todos `@app.diakonia`, todos ligados a uma ficha) — mas nada impede.

**Por que não bastava desligar.** O botão "Novo acesso" (Usuários) criava a conta pelo mesmo endpoint público (`auth.signUp`). Desligado o cadastro, ele quebraria. Agora ele chama a função `admin_criar_acesso` (só administrador, no banco).

## A ordem importa

1. **Aplicar a migration** `supabase/migrations/20261020200000_admin_criar_acesso.sql` (SQL Editor). Cria a função; não muda nenhum dado. Ensaiada em Postgres real (17 conferências, ver abaixo).
   - Conferir depois: `SELECT proname FROM pg_proc WHERE proname = 'admin_criar_acesso';` → 1 linha.
2. **Publicar o código** (`publique`): "Novo acesso" passa a usar a função. Teste: Usuários › Novo acesso para uma pessoa de teste que tenha telefone; a senha temporária sai para o WhatsApp como antes; o primeiro login pede troca de senha e aceite da LGPD.
3. **Só então desligar o cadastro público** — painel do Supabase › *Authentication* › *Sign In / Providers* (ou *Configuration › Sign In / Providers*) › desligar **"Allow new users to sign up"** › Save.
   - Eu não faço esta etapa: é configuração de segurança da conta Supabase, e o token de gerenciamento que eu usava está inválido (foi revogado — correto).

## Conferir que fechou (sem criar conta nenhuma)

Esta chamada é pública e só lê. Pode rodar no navegador (Console) com a chave anônima do projeto, ou me pedir que eu rode:

```js
fetch("https://prjoftmlkusbjoeptabp.supabase.co/auth/v1/settings", { headers: { apikey: "<chave anônima>" } }).then(r => r.json()).then(s => s.disable_signup)
// esperado depois do passo 3: true   (hoje: false)
```

Depois: *Novo acesso* continua funcionando (passo 2) e os convites (`/convite/...`) também — os dois criam a conta no banco, não pelo endpoint público.

## Desfazer

- Religar "Allow new users to sign up" no painel (volta ao estado anterior; o app não precisa disso mais).
- `docs/ADMIN_CRIAR_ACESSO_ROLLBACK.sql` apaga a função. **Religue o cadastro antes**, ou "Novo acesso" deixa de funcionar.

## O que foi ensaiado

`teste_admin_criar_acesso.mjs` (Postgres 18 real com pgcrypto): não-administrador não cria nada · administrador cria com telefone normalizado, todas as colunas de token em `''` (o Auth responderia 500 com NULL), senha só em hash, papel único (o gatilho `handle_new_user` pôs `membro` e a função troca), perfil com `primeiro_acesso = true` e ficha, `perfil_acesso` da ficha acompanha · mesmo telefone, senha curta, perfil inventado, pessoa sem telefone e pessoa inexistente são recusados · anônimo não executa, autenticado executa.

## Prova de que esse tipo de conta entra

A conta de 17/10 (criada pelo convite, que usa o mesmo INSERT e foi reparada na migration 20261017100000) **entrou no mesmo dia** (último acesso 17/10, `primeiro_acesso = false`).
