# Deploy — Supabase + Netlify

## Supabase

1. Crie um projeto novo.
2. Rode `supabase/INSTALL_ALL.sql` no SQL Editor.
3. Rode `supabase/VERIFY.sql` e confirme que as verificações retornam `PASS`.
4. Em **Authentication → URL Configuration**, configure o domínio de produção e `http://localhost:5173`.
5. Mantenha confirmação de e-mail ativa em um cadastro público.
6. Configure SMTP próprio antes de depender de recuperação de senha em produção.

## Netlify

Conecte o repositório e use as configurações já presentes em `netlify.toml`.

Cadastre as variáveis:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

O build cria `dist/config.js` e restringe a CSP ao projeto Supabase informado.

## Checklist de publicação

- [ ] `npm run qa` aprovado;
- [ ] `supabase/VERIFY.sql` aprovado;
- [ ] Site URL e Redirect URLs configuradas;
- [ ] confirmação de e-mail testada;
- [ ] redefinição de senha testada;
- [ ] duas contas reais testadas;
- [ ] collab e compartilhamento testados;
- [ ] competição e ranking testados;
- [ ] mobile e desktop revisados;
- [ ] variáveis do Netlify sem `service_role`.

## Atualizações

Não use `RESET_DEV_ONLY.sql` em produção. Alterações futuras no banco devem ser entregues como migrações incrementais e revisadas antes da execução.
