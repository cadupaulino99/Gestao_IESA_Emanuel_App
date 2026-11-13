# Disciplina de release — Gestão IESA Emanuel

## Princípio

- A branch **`main`** é a única fonte de verdade.
- O **APK** e o **Hosting** devem sair do **mesmo commit** de `main` (ou de um tag alinhado a esse commit).
- Não se usam workflows `patch-*` / `restore-*` / `bump-*` pontuais: alterações entram por commit normal em `main`.

## Workflows oficiais (manter)

| Workflow | Função |
|----------|--------|
| `ci.yml` | Verificação (lint/testes) |
| `build-android.yml` | APK + AAB + release GitHub |
| `deploy-hosting.yml` | Firebase Hosting (web) |
| `deploy-firebase.yml` | Regras Firestore/Storage / config Firebase |
| `deploy-ai-worker.yml` | Cloudflare Worker |
| `worker-health.yml` | Health check do Worker |

Qualquer outro workflow em `.github/workflows/` é legado e deve ser removido.

## Como publicar uma versão

1. Garantir que `main` está estável (CI verde se aplicável).
2. Actualizar a versão em **`package.json`** (`version`), ex.: `1.21.29`.
3. Commit na `main`, mensagem clara (`chore: release 1.21.29` ou feature/fix).
4. Disparar **Build Android** (`workflow_dispatch` ou push em `main` conforme o YAML).
5. Se a web também mudou: **Deploy Hosting**.
6. Se regras/Worker mudaram: **Deploy Firebase** / **Deploy AI Worker**.
7. Confirmar a release em GitHub → **Releases** (tag `vX.Y.Z` + `app-release.apk`).
8. Instalar no telemóvel e confirmar o número de versão no ecrã de login / cabeçalho.

## Checklist pré-release

- [ ] `package.json` → versão correcta
- [ ] Sem alterações só em máquina local por publicar
- [ ] Teste rápido: login admin, login membro, um ecrã crítico (finanças ou eventos)
- [ ] Após APK: versão no aparelho = versão do `package.json`
- [ ] Após Hosting: Ctrl+F5 e mesma versão na web

## Alinhar APK com `main`

Se o telemóvel tiver comportamento antigo:

1. Ver versão na app.
2. Comparar com `package.json` em `main` e com a última **Release** no GitHub.
3. Se for inferior → instalar o APK da release mais recente gerada a partir de `main`.

## O que não fazer

- Não criar workflows `patch-foo.yml` para um único fix.
- Não editar produção só no Hosting sem o mesmo código estar em `main`.
- Não distribuir APKs gerados a partir de branches esquecidas.
