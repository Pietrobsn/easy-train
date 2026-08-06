# Política de segurança

## Relatando uma vulnerabilidade

Não abra uma issue pública com detalhes exploráveis. Use **Security → Report a vulnerability** no GitHub para enviar um aviso privado aos mantenedores. Inclua impacto, passos de reprodução e uma correção sugerida quando possível.

Não envie senhas, tokens de sessão, dados pessoais ou dumps do banco.

## Escopo

A versão suportada é a publicada na branch `main`. O frontend usa apenas a chave publishable do Supabase; `service_role`, senha do banco e segredos SMTP nunca devem aparecer no navegador ou no repositório.

## Controles atuais

- tabelas internas no schema `easy_train_private`;
- RLS em todas as tabelas;
- acesso do cliente por RPCs autorizadas;
- validação e limites de payload no banco;
- estatísticas recalculadas a partir de eventos de treino;
- cabeçalhos de segurança no Netlify;
- CI que procura credenciais e inconsistências básicas.

## Limitações

Pesos, repetições e PRs são informados pelos próprios usuários. Competições são sociais e não servem como comprovação antifraude para premiações.
