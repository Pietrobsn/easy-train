# Configuração do repositório no GitHub

## Informações recomendadas

**Nome:** `easy-train`

**Descrição:**

```text
Plataforma mobile-first de treinos com evolução, collabs e competições, construída com JavaScript, Supabase e Netlify.
```

**Topics:**

```text
fitness workout gym pwa javascript supabase netlify postgres mobile-first open-source
```

## Primeiro envio

Crie um repositório vazio, sem README ou `.gitignore`, e execute:

```bash
git init
git add .
git commit -m "feat: launch Easy Train platform"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

## Acabamento visual

1. Em **Settings → General → Social preview**, envie `docs/assets/easy-train-social-preview.png`.
2. Adicione a descrição e os topics acima.
3. Cadastre o domínio publicado em **Website**.
4. Fixe issues de roadmap ou contribuição quando existirem.

## Proteção e automação

1. Confirme que as actions **QA** e **CodeQL** ficaram verdes.
2. Ative **Private vulnerability reporting** em **Security**.
3. Proteja a branch `main` exigindo a verificação `qa` antes de merge.
4. Ative Dependabot para GitHub Actions.
5. Conecte o repositório ao Netlify.
6. Cadastre `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` somente no Netlify.
7. Nunca envie `.env`, dumps reais ou chaves administrativas.

## Sequência de commits sugerida

```text
feat: launch Easy Train platform
docs: improve repository presentation
fix: ...
feat: ...
refactor: ...
test: ...
chore: ...
```
