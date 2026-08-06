# Contribuindo com o Easy Train

Obrigado por ajudar. Antes de começar, abra uma issue para mudanças grandes e mantenha cada pull request focado em um problema.

## Ambiente

1. Use Node.js 22 ou superior.
2. Copie `.env.example` para `.env` e use um projeto Supabase de desenvolvimento.
3. Rode `npm run dev`.
4. Antes de enviar alterações, rode `npm run qa`.

## SQL

Edite apenas os arquivos em `supabase/parts/` e depois execute `npm run sql:build`. O CI rejeita `INSTALL_ALL.sql` desatualizado. Migrações destrutivas devem ser claramente nomeadas e nunca misturadas a uma correção comum.

## Segurança e privacidade

Nunca envie `service_role`, senha do banco, segredo SMTP, arquivo `.env`, dados pessoais ou dumps reais. Vulnerabilidades não devem ser publicadas em issues; siga `SECURITY.md`.
