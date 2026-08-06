# Changelog

## [2.8.1] - 2026-08-06

### Fixed
- Inclui `.env.example` corretamente no pacote público.
- Aumenta a tolerância do teste de inicialização do servidor no Windows.
- Oculta a janela do processo filho durante o teste local no Windows.


## 2.8.0 — Ordem livre e desempenho

- Exercícios podem ser executados em qualquer ordem durante a sessão.
- Início do treino abre a lista para escolher a máquina disponível.
- Troca rápida entre exercícios sem perder séries ou cronômetros.
- Salvamentos rotineiros agora são otimistas e agrupados em segundo plano.
- Transições, busca e navegação ficaram mais rápidas.
- Correção no fluxo de recuperação de senha.

## 2.7.0 — 2026-08-05

- Tema padrão alterado para **Sistema**, incluindo migração única das preferências antigas.
- Seletor de aparência mais visível na tela de acesso e no Perfil.
- Atalho de tema na tela inicial.
- Revisão completa de contraste, formulários, cards, listas, editor e overlays no tema claro.
- Ajustes de acessibilidade visual e transição sem flash de tema.

## 2.6.0 — 2026-08-05

- presets de treino por grupo muscular com foco, cor e ícone prontos;
- biblioteca de emojis para personalizar rapidamente cada treino;
- opção de ficha sem validade, sem obrigar uma data final;
- meta semanal configurável entre 1 e 7 treinos;
- rotina flexível sem prender os treinos a segunda, terça ou sexta;
- textos da interface ajustados para diferenciar treinos da ficha e dias da semana;
- novo foco de cardio para organização e mensagens do coach;
- estado sincronizado atualizado sem exigir novo SQL no projeto já instalado.

## 2.5.0 — 2026-08-05

- opção “Lembrar meu login” com sessão persistente ou temporária por dispositivo;
- e-mail lembrado somente quando o usuário autoriza;
- temas claro, escuro e automático pelo sistema;
- seletor de aparência no perfil e alternância também na tela de login;
- botão nativo de instalação no Android quando o navegador oferece o prompt;
- tutorial de iPhone refeito com indicação visual do botão Compartilhar no centro da barra do Safari;
- validação de senha alinhada ao mínimo de 6 caracteres configurado no Supabase;
- testes e documentação atualizados para os novos fluxos.

## 2.4.0 — 2026-08-05

- README redesenhado com identidade visual e navegação clara;
- capa, screenshots mobile, editor desktop e recursos sociais adicionados;
- metadados Open Graph e Twitter Card incluídos;
- screenshots adicionadas ao manifesto PWA;
- documentação de deploy, roadmap e identidade visual criada;
- configuração recomendada do GitHub e Dependabot organizada;
- QA ampliado para validar materiais públicos do repositório.

## 2.3.0 — 2026-08-05

- preparação do repositório público;
- remoção da configuração real do Supabase do código versionado;
- validação e neutralização adicional de conteúdo compartilhado;
- correção de datas locais em ofensivas e competições;
- volume de treino recalculado pelo banco;
- proteção contra concorrência ao entrar em competições;
- tratamento de conflito entre dispositivos;
- suíte de QA, CI e verificação de consistência dos SQLs.
