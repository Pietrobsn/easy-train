# Checklist de release

## Código

- [ ] `npm run qa` aprovado;
- [ ] changelog atualizado;
- [ ] versão do `package.json` revisada;
- [ ] nenhum `.env`, token ou dump incluído;
- [ ] screenshots e README representam a versão atual.

## Supabase

- [ ] migrações revisadas e testadas em desenvolvimento;
- [ ] `VERIFY.sql` aprovado;
- [ ] Auth, SMTP e Redirect URLs testados;
- [ ] Security Advisor revisado;
- [ ] backup realizado antes de alterações destrutivas.

## Netlify

- [ ] variáveis de ambiente configuradas;
- [ ] deploy preview revisado;
- [ ] headers e redirects presentes no artefato;
- [ ] login, cadastro e redefinição de senha testados;
- [ ] PWA instalada em Android e iOS.

## Produto

- [ ] treino completo executado no celular;
- [ ] editor revisado no computador;
- [ ] collab entre duas contas testada;
- [ ] compartilhamento e importação testados;
- [ ] competição e ranking testados;
- [ ] conflito entre dois dispositivos testado.
