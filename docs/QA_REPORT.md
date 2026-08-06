# Relatório de QA — 05/08/2026

## Resultado

**Aprovado para publicação no GitHub**, com identidade visual, documentação e limitações registradas abaixo. O comando `npm run qa` passou integralmente após as correções.

## Problemas encontrados e corrigidos

### Bloqueadores

- configuração real do projeto Supabase removida do repositório;
- servidor local corrigido para servir `/`, rotas SPA e retornar 404 para assets ausentes;
- `INSTALL_ALL.sql` passou a ser gerado e verificado contra os arquivos-fonte;
- migração antiga corrigida para preencher `local_date` e usar a versão atual do estado;
- treino vazio não inicia nem causa acesso a exercício inexistente;
- divisão por zero removida do progresso de fichas vazias.

### Segurança e integridade

- conteúdo de fichas compartilhadas é normalizado e escapado antes de renderização;
- volume de treino é recalculado pelo PostgreSQL a partir das séries concluídas;
- duração é validada a partir dos horários, sem confiar no resumo do cliente;
- rankings usam a data local do treino;
- ofensiva da competição é calculada dentro do período da disputa;
- entrada em competição usa bloqueio transacional para respeitar o limite de participantes;
- cadastros concorrentes do mesmo `@usuário` são serializados;
- conflito entre dispositivos não sobrescreve dados silenciosamente;
- configuração e autenticação usam `no-store`;
- CSP do deploy é restringida ao projeto Supabase informado no build.

### Repositório público

- CI no GitHub Actions;
- testes automatizados;
- modelos de issue e pull request;
- documentação de contribuição, segurança, arquitetura e publicação;
- `.env`, build, logs e arquivos de IDE ignorados;
- licença MIT adicionada;
- README visual com capa e screenshots;
- metadados Open Graph e Twitter Card;
- screenshots no manifesto PWA;
- documentação de deploy, roadmap e branding;
- Dependabot configurado para GitHub Actions;
- sessão persistente opcional validada com `localStorage` e `sessionStorage`;
- temas claro, escuro e sistema verificados na camada de interface;
- instalação Android e tutorial visual do Safari revisados.

## Verificações executadas

```text
npm run sql:check
npm run check
npm test
npm run build
```

Resultado: 7 testes automatizados passaram, os materiais visuais foram validados e o build público foi criado sem segredos embutidos.

## Limitações conhecidas

- não houve teste end-to-end contra um projeto Supabase real nesta máquina;
- confirmação de e-mail, SMTP, limites do Auth e recuperação de senha precisam ser testados no projeto final;
- CAPTCHA ainda não está integrado;
- valores de peso, repetição e PR são autodeclarados;
- a CSP ainda permite estilos inline porque a interface usa estilos dinâmicos em progresso e gráficos;
- não existe moderação avançada, bloqueio de usuários ou painel administrativo;
- alterações de schema futuras exigirão migrações incrementais, e não a reexecução cega do instalador em produção.

## Smoke test recomendado antes de divulgar

1. criar duas contas confirmadas;
2. montar e concluir um treino em cada conta;
3. validar carga, histórico, PR, volume e ofensiva em outro aparelho;
4. criar collab, compartilhar e importar uma ficha;
5. criar competição, entrar por convite e por código;
6. testar redefinição de senha;
7. conferir Security Advisor e logs do Supabase;
8. testar Android, iPhone e editor em desktop.

## Aparência v2.7

- Tema padrão do sistema validado para novas contas e dispositivos.
- Seletor visível na autenticação e no Perfil.
- Atalho rápido na tela inicial.
- Contraste do modo claro revisado em cards, formulários, editor, calendário e telas sociais.
