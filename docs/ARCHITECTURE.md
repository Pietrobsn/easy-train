# Arquitetura

## Cliente

O aplicativo usa módulos JavaScript nativos. `src/app.js` renderiza a interface e controla o fluxo; `src/repository.js` normaliza o estado, faz debounce e resolve revisões; `src/supabase.js` gerencia Auth e chamadas HTTP; `src/workouts.js` contém o estado inicial vazio.

## Persistência

Cada usuário possui um documento JSON versionado em `easy_train_private.user_states`. Eventos concluídos também são materializados em `workout_events` para estatísticas e rankings. O banco recalcula volume e duração antes de aceitar um evento novo.

## Concorrência

`user_states.revision` implementa controle otimista. Um dispositivo só salva sobre a revisão que carregou; em conflito, o app pede recarregamento em vez de sobrescrever silenciosamente.

## Segurança

As tabelas internas não possuem grants para o cliente. RPCs `security definer` validam `auth.uid()`, estado da conta, formato, tamanho e limites de ações. As funções fixam `search_path` e usam nomes totalmente qualificados.

## Deploy

O Netlify executa `npm run build`. O build gera a configuração pública a partir das variáveis de ambiente e restringe os destinos Supabase na política CSP do artefato publicado.
