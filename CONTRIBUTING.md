# Contribuir — Gestão IESA Emanuel

Obrigado por querer melhorar o sistema da igreja. Este documento existe para que
uma alteração feita à pressa num telemóvel em Xangongo e uma feita com calma num
portátil cheguem ao mesmo sítio: **ao repositório, testadas e reversíveis**.

## Antes de codar

1. Leia o `README.md` (configuração local) e, conforme o tema,
   `docs/FIX-LEITURA-BI.md` (IA/Worker), `docs/GUIA-FIREBASE.md` (dados) e
   `docs/MUDANCAS.md` (histórico de decisões — **muitas coisas já foram tentadas;
   o histórico diz porquê não resultaram**).
2. Problemas reais da igreja primeiro: uma melhoria de UX que poupe 10 cliques a
   um tesoureiro vale mais do que um refactor elegante.

## Fluxo de trabalho

```bash
git checkout -b feat/minha-coisa main     # ou fix/…, docs/…, ci/…
npm install
npm run dev                               # desenvolver
npm run lint && npm test                  # obrigatório antes do commit
git commit -m "tipo(escopo): resumo imperativo"   # ver convenção abaixo
git push -u origin feat/minha-coisa       # abre PR automaticamente no link do GitHub
```

- **Um PR = uma mudança.** Misturar correção de bug com refactor de estilo torna
  o *rollback* impossível às 22h de um domingo.
- O CI (`ci.yml`) corre `tsc --noEmit`, `vitest run` e `node --check` no Worker
  em cada push e PR. **PR vermelho não se merge.**
- Mudanças que toquem em `worker/**` exigem atenção extra: o Worker é um servidor
  publicado à parte do APK. Depois do merge, publique-o
  (`npm run deploy:worker` ou Via A do `docs/INICIO-RAPIDO.md`) e confirme
  `npm run worker:health`.

## Convenção de commits

`tipo(escopo): descrição` — tipos: `feat`, `fix`, `docs`, `ci`, `test`, `refactor`,
`perf`, `chore`. O corpo explica **porquê**, não o quê; medições reais
(tempos, tokens, HTTP codes) valem ouro — ver os commits da v1.7.2/v1.8.x.

## Regras de ouro (aprendidas à custa de incidentes)

1. **Nunca** usar `wrangler deploy` directamente — apaga os segredos do Worker
   que não estiverem no `wrangler.toml`. Usar `npm run deploy:worker`.
2. **Nunca** commits com chaves: service accounts, chaves Gemini, tokens.
   A config pública do Firebase (`AIza…`) pode ir no repo; segredos não.
3. Modelos Gemini: **medir antes de trocar**. O incidente da v1.7.2 foi um
   modelo «melhor» que demorava 170-390 s num servidor que corta aos ~100 s.
   `npm run test:bi` existe para isso.
4. Regras do Firestore: qualquer coleção nova precisa de `match` próprio
   (o default é `allow read, write: if false`) **e** de publicação pelo
   workflow *Deploy Firebase*. Sem isso, a funcionalidade «funciona» em local
   e morre no telemóvel.
5. PDF/ downloads no APK: `jsPDF.save()` e `<a download>` **não fazem nada** na
   WebView do Android. Usar `savePdf()` de `src/lib/pdfUtils.ts`
   (folha de partilha → fallback Documents/).
6. Datas e sexos vindos de OCR: passar sempre pelos normalizadores de
   `src/lib/ai.ts` antes de tocar num formulário (`07/03/1990` ≠ `1990-03-07`
   para um `<input type="date">`; `M` ≠ `Masculino` para um `<Select>`).

## Testes

- Lógica pura (normalizadores, agregações, retries) → `src/lib/__tests__/` (Vitest).
- Fluxos com Firebase/Worker → script de bancada (`scripts/test-gemini-bi.mjs`,
  `scripts/worker-health.mjs`) e verificação manual guiada por
  `docs/SUA-VEZ.md`.
- Novo helper de cálculo? Nasce com teste ao lado. Sem excepções.

## Rever um PR

- Confirme `npm run lint && npm test` localmente.
- Mudanças em `firestore.rules`: pergunte «que coleção fica mais exposta?» e
  «os membros no portal continuam a conseguir ler o que é deles?».
- Mudanças no Worker: peça a saída de `npm run worker:health` depois de publicado.

## Comunicação

Dúvidas: canal interno da liderança ou Issues do GitHub. Descreva o
**comportamento observado + esperado + versão da app** (Definições ou banner de
atualização). Capturas ajudam sempre.
