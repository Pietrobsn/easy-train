# Easy Train — SQL organizado

## Projeto novo — recomendado

No **Supabase → SQL Editor**, rode somente:

1. `INSTALL_ALL.sql`
2. `VERIFY.sql`

O instalador já junta, nesta ordem:

- `parts/01_SCHEMA.sql`
- `parts/02_FUNCTIONS.sql`
- `parts/03_SECURITY.sql`

O arquivo `parts/04_POST_INSTALL_CHECKLIST.sql` contém consultas administrativas opcionais e não faz parte da instalação.

## Projeto antigo preservando dados da versão 2

1. Faça backup do projeto.
2. Rode `INSTALL_ALL.sql`.
3. Rode `MIGRATE_FROM_V2.sql`.
4. Rode `VERIFY.sql`.
5. Confirme os dados antes de remover qualquer tabela antiga.

A migração copia perfis, estado do aplicativo, collabs, fichas compartilhadas, competições e eventos para o schema privado. Ela não apaga automaticamente as tabelas antigas.

## Recomeçar no mesmo projeto

O caminho mais seguro é criar outro projeto Supabase. Para apagar somente os dados do Easy Train no projeto atual:

1. Faça backup.
2. Rode `RESET_DEV_ONLY.sql`.
3. Rode `INSTALL_ALL.sql`.
4. Rode `VERIFY.sql`.

`RESET_DEV_ONLY.sql` preserva `auth.users`, mas apaga fichas, históricos, collabs e competições. Não use isso em produção sem backup.

## Resultado esperado do VERIFY

- `private_schema = true`;
- todas as tabelas com `rls_enabled = true`;
- `anon_has_direct_access = false`;
- usuários autenticados sem escrita direta nas tabelas;
- somente `easy_train_username_available` liberada para `anon`;
- demais RPCs liberadas apenas para `authenticated`.

## Painel do Supabase

Em **Authentication**:

- Site URL: domínio oficial do Netlify;
- Redirect URLs: domínio oficial e endereço local de desenvolvimento;
- confirmação de e-mail ligada para cadastro público;
- senha mínima definida no projeto (o frontend atual aceita 6 caracteres);
- limites de autenticação revisados;
- SMTP próprio antes de depender de e-mails em produção.

CAPTCHA/Turnstile pode ser adicionado depois, mas exige enviar o token pelo frontend. Não ative no painel antes dessa integração.

No navegador use apenas URL e chave **publishable/anon**. Nunca exponha `service_role`.
