# 🔧 MUDANÇAS face ao repositório original

## v1.12.3 — Rádio: o botão de apagar gravações volta a funcionar

**Sintoma**: no player da Rádio Maranata, tocar no caixote do lixo e confirmar
não apagava a gravação — «o botão não funciona».

**Causas** (três, empilhadas):
1. **A palavra de confirmação exigia correspondência EXACTA.** O dialog pedia
   para escrever «APAGAR» e comparava `inputText !== 'APAGAR'` — nos teclados
   dos telemóveis sai «Apagar» (capitalização automática) ou «apagar», pelo
   que o botão «Confirmar» **nunca era ativado** (fica desativado até a palavra
   bater certo). Comparação agora tolerante a caixa e espaços
   (`matchesRequired`, `lib/confirm.ts`, testado); o campo pede maiúsculas
   (`autoCapitalize="characters"`, sem autocorrecção) e o texto do dialog diz
   que tanto faz.
2. **`removeRecording` não tinha `try/catch`:** qualquer erro do `Filesystem`
   morria em silêncio — sem toast, sem actualizar a lista. Agora há erro com
   mensagem, spinner no botão enquanto apaga e protecção contra duplo toque.
3. **Duplo toque criava um confirm «zombie»:** o resolver da Promise vivia em
   state e era substituído pelo segundo dialog — o primeiro `removeRecording`
   ficava pendurado para sempre. Resolver passa a viver num `ref` e um confirm
   novo cancela o pendente (resolve `false`).
- Extra: `deleteRecording` é idempotente — se o ficheiro já não existe, o
  objetivo está cumprido (a lista é relida e a gravação desaparece).

## v1.12.2 — O PDF do cartão agora CHEGA ao telemóvel (partilha nativa a sério)

**Sintoma**: ao carregar em «Descarregar PDF»/«Gerar PDF», a app dizia que o
ficheiro foi guardado, mas nada aparecia — sem folha de partilha, sem descarga,
sem ficheiro encontrável.

**Causa real** (o fix da v1.8.3 não chegava a um aparelho real):
- `saveBlob` tentava partilhar com a **Web Share API** (`navigator.share` /
  `navigator.canShare`) — essa API **não existe na Android System WebView**
  (só em browsers como o Chrome). No APK, `canShare` vinha `undefined` e a
  folha de partilha NUNCA abria.
- O recurso escrevia o PDF com `Filesystem` em `Directory.Documents` — que no
  Android é a **pasta privada da app**
  (`Android/data/ao.co.iesa.emanuelxangongo.gestao/files/Documents/Download/`),
  inacessível a qualquer gestor de ficheiros desde o Android 11. O ficheiro
  era mesmo criado… onde o utilizador não lhe consegue chegar. Daí o
  «informa que baixou, mas o download nunca inicia».

**Correção**: plugin oficial **@capacitor/share 8.0.3** (Intent nativo
`ACTION_SEND` + FileProvider — o único que abre a folha de partilha do Android
a partir da WebView). Em native, `saveBlob` passa a:
1. gravar o ficheiro na **cache** (`Directory.Cache`);
2. abrir a **folha de partilha real do Android** (`Share.share({ files })`) —
   o utilizador escolhe *Guardar em Ficheiros*, *Drive*, *Imprimir*, WhatsApp…;
3. só se a partilha falhar: grava em `Documents/Download/` com mensagem
   honesta («cópia na pasta da app»).
- `shareRecording` (Rádio): mesmo padrão — partilha nativa da gravação AAC
  via cache; a Web Share API fica só para a web (onde existe mesmo).
- Web inalterada (`<a download>`). Beneficia TODAS as descargas: cartão CR80,
  cartão frente+verso, recibos, Excel, backups, relatórios.
- APK: o CI já corre `npm ci` + `npx cap sync android` — o plugin entra no
  build sem tocar manualmente na pasta `android/`.

## v1.12.1 — Cartão de membro: PDF com todos os dízimos e «Kz Kz» corrigido

Bugs corrigidos no cartão de membro (ecrã + PDF, liderança e Portal do Membro):
- **PDF perdia registos legados**: `generateMemberCardPdf` filtrava dízimos e
  donativos com comparações cruas (`t.referenceYear === ano && t.referenceMonth === '01'`).
  Dízimos anteriores à v1.9.3 (`month: 'Janeiro'` + `year`, sem campos
  `reference*`) ou com mês numérico (`10` em vez de `'10'`) desapareciam das
  tabelas do PDF — mesmo aparecendo no ecrã. O PDF passa a usar os MESMOS
  helpers canónicos do ecrã (`aggregateByMonth`/`sumYear` de `lib/finance`,
  que resolvem mês/ano via `referenceOf`): uma única fonte de verdade.
- **Colunas de ano com o mesmo defeito**: `yearsOf` (ecrã) e `yearsOfPdf`
  recolhiam os anos só de `referenceYear` cru; um membro apenas com dízimos
  legados ficava sem a coluna desse ano (e sem os valores). Substituídos por
  `cardYears()` (novo em `lib/finance`, testado): anos canónicos de comunhões,
  donativos (com recurso à data ISO), dízimos (`referenceOf`) e renovações.
- **«Kz Kz» na frente do cartão**: o bloco do orçamento único e das
  contribuições juntava « Kz» a seguir a `formatKz()`, que já inclui o sufixo
  («12.000,00 Kz Kz (2026)», «500,00 Kz/1.000,00 Kz Kz»).
- **Comunhão no cartão**: a comparação do mês passa por `toMonthIdx` (ecrã e
  PDF), tolerante a '1', 1, '01' e nomes.
- Remover donativo no modal do cartão falhava em silêncio (sem `catch`); agora
  mostra toast de erro como os restantes botões.
- Testes: 91 (5 novos de `cardYears` em `finance.test.ts`).

## v1.12.0 — Moeda única «Kz» e campos de valor inteligentes
- **Causa da mistura AOA/Kz**: 135 sítios em 22 ficheiros formatavam dinheiro
  cada um à sua maneira (49× Intl.NumberFormat AOA, 13× toLocaleString,
  24× «Kz» fixo, 2× toFixed + formatadores próprios no Worker/PDF).
- `src/lib/money.ts`: **função única `formatKz()`** + configuração do formato
  num só sítio (`MONEY_FORMAT`): 1.500,00 Kz, sem depender do idioma do
  aparelho. «AOA» nunca mais aparece ao utilizador (só interno, na IA de recibos).
- **Armazenamento em inteiros de cêntimos** (700,00 Kz = 70000): somas exactas
  (0,10 + 0,20 = 0,30). Regras Firestore exigem `int` nos valores (servidor
  repete a validação). Orçamento único e contribuições passam a aceitar 2 casas.
- Campos de valor (`MoneyText`/`MoneyInput`): texto com `inputMode="decimal"`,
  formatação ao sair do campo, edição sem símbolo, recusas com mensagem
  («Valor inválido. Exemplo: 1.500,00»), máx. 1.000.000.000,00 Kz, sem negativos.
  Aceita 700 / 700Kz / kz700 / KZ 700 / 700,5 / 1.500 / AOA 700; recusa 1.50 e 1,2,3.
- Excel: célula com **número** + formato `#,##0.00 "Kz"` (somas continuam a funcionar).
- Migração **Admin → «Migração v1.12.0 — dinheiro em cêntimos»**: analisa,
  lista duvidosos (não os toca), exige cópia de segurança, idempotente
  (marcador settings/system.moneyCents=2).
- Worker 2.6.0: lembretes com `fmtKz` (cêntimos).
- Testes: 86 (7 novos de moeda). Guia: `docs/VERIFICACAO-MOEDA.md`.

## v1.11.0 (2026-10-24) — Orçamento único, contribuições, notificações e mensagens em massa

- **Orçamento único** por membro/ano (`member_budgets`): inteiros positivos, histórico
  de alterações (antes/depois/autor/data), definição individual e **em massa**
  (selecionar todos, pesquisa, filtro «sem valor», confirmação com «actual → novo»
  e manter/substituir, gravação atómica tudo-ou-nada).
- **Contribuições** (`contributions` + `contribution_payments`): descrição, valor,
  prazo, estado calculado (em curso / em atraso por prazo / concluída por pagamentos),
  pagamentos parciais com data de entrega (contabilidade por entrega, separada dos
  dízimos), conclusão automática + manual com motivo, reabertura só admin com motivo,
  histórico. Linhas novas no cartão (membro e portal).
- **Notificações**: coleção `notifications` por email + **sino com contador**
  (Layout, desktop e móvel); cada utilizador vê só as suas (regra no servidor).
- **Fila de mensagens** (`message_outbox`): janela de **10 min** para cancelar ou
  substituir (correção dentro da janela não duplica); estados por canal
  (pendente/manual_hold/enviada/falhada/sem-número/não-aceita/cancelada);
  «Repetir falhadas»; **modo manual** por defeito (botões wa.me/sms: + marcar enviada).
- **Lembretes** por cron do Worker (1 min): config única em `settings/notifications`
  (3×/semana, seg-qua-sex, 9h Luanda, máx. 8 semanas, externos OFF por defeito com
  tecto semanal, modo de teste); máx. 1 mensagem/dia/membro somando canais/campanhas;
  param ao concluir e às 8 semanas (+aviso ao super).
- **IA em massa** (`/assistant/bulk-templates` no Worker): a IA recebe só objectivo +
  contagens por grupo; devolve modelos com {nome} {descricao} {valor} {prazo}
  {valor_em_falta}; substituição no cliente; pré-visualização obrigatória (contagens
  + 3 exemplos reais por grupo); envio bloqueado se faltar marcador; aviso de SMS
  longa; registo em `campaigns`. Gemini 3.6 flash pelo Worker existente.
- **Telefones**: normalização +2449XXXXXXXX na gravação, validação e aviso de
  número duplicado entre membros; campo «Aceita mensagens» (defeito sim).
- **Permissões no servidor**: escritas das coleções novas só `isAdmin()`; leitura
  dos valores só do próprio membro ou liderança; aba e página mostram «Acesso
  negado» a não-admins.
- Fornecedores propostos e textos de modelo WhatsApp: `docs/MENSAGENS-FORNECEDORES.md`.
- Guia de testes (9 cenários do utilizador): `docs/VERIFICACAO-V1.11.0.md`.
- **Fora desta versão:** pagamentos online, recibos automáticos de contribuições,
  outros canais (email/push), dashboards de facturação de fornecedor.


## v1.10.2 (2026-10-24) — «Sucesso… e depois erro ao sincronizar» ao lançar dízimo

Causa (cadeia de três defeitos no estado do formulário `tD`, `Finances.tsx`):
1. `openEditTithe` preenchia o formulário **sem** `deliveryMonth/deliveryYear` e com
   `selectedMonths` em **nome** legado («Janeiro»);
2. o diálogo «Registar» **não repunha** o estado ao abrir (DialogTrigger sem reset);
3. o reset pós-gravação repunha `selectedMonths` em **nome** e não repunha a entrega.
   Resultado: após abrir uma edição (ou após certos resets), o lançamento seguinte
   enviava `deliveryMonth: undefined` / meses em nome — e o Firestore **rejeita
   `undefined`** no setDoc de fundo: o toast de sucesso saía (UI optimista) e depois
   vinha «Erro ao sincronizar… revertido».

Correção:
- `resetTD()` canónico (meses `'01'..'12'`, entrega = mês operativo) chamado ao
  abrir o diálogo para novo e após gravar (criação e edição);
- `openEditTithe` preenche entrega/referência via `deliveryOf()/referenceOf()`;
- `handleAddTithe` **sanitiza tudo antes de gravar** (`pairs`, `delMonth/delYear/
  refYear`) — mesmo com estado stalado, nunca sai `undefined` nem nome;
- vista actual e verificações de duplicados antigas normalizadas (`referenceOf`,
  `toMonthIdx`); labels de meses passam a nomes legíveis (checkboxes e divisão
  manual mostravam «01», «02»).

Nada mudou nas regras nem no Worker; só o cliente. Testes: 68.


## v1.10.1 (2026-10-24) — Campo do B.I.: teclado certo, maiúsculas com cursor, migração segura

Queixa: no telemóvel o campo «Nº do B.I.» abria o teclado só numérico — não dava
para escrever as letras do formato angolano (9 dígitos + 2 letras + 3 dígitos).

- **Causa:** `inputMode="numeric"` no campo (`Members.tsx`). Agora:
  `type="text" inputMode="text" autoCapitalize="characters" autoComplete="off"
  autoCorrect="off" spellCheck="false" maxLength="14"`.
- **Maiúsculas no valor, não só no CSS:** `editBi()` em `lib/members.ts` converte
  em cada evento de escrita, limpa tudo o que não for letra/dígito, limita a 14 e
  **repõe o cursor** (conta os caracteres válidos antes dele) — corrigir uma letra
  a meio não salta para o fim. Cobre digitação, colagem e o preenchimento pela IA
  (`normalizeDocumentNumber` em `lib/ai.ts` deixou de comer as letras).
- **Servidor/app antes de gravar:** `validateBi()` normaliza (maiúsculas + só
  alfanuméricos) em create, edit e import; a unicidade compara o valor
  normalizado; mensagem de formato clara **sem apagar** o que foi escrito.
- **Pesquisa por B.I.:** a pesquisa de Membros passa a apanhar o B.I.
  normalizado (mín. 3 caracteres), além de nome e telefone.
- **Migração dos B.I. existentes:** Admin → Gestão de Dados → «Migração de B.I.»:
  1) *Analisar* lista o que mudaria e as **colisões** (B.I. que passariam a ficar
  iguais); 2) exige cópia de segurança confirmada; 3) *Aplicar* normaliza só os
  não-colidentes — colisões ficam listadas para decisão manual, **sem fusões
  automáticas**.
- Testes: 68 (cleanBi/editBi/cursor/colagem, validateBi, normalizeDocumentNumber).


## v1.10.0 (2026-10-24) — Gestão de administradores com palavras-passe de uso único

**Como as palavras-passe vivem (auditoria pedida pelo utilizador):** no **Firebase
Auth**, que guarda apenas o *hash* (scrypt gerido pela Google). Nem Firestore, nem
Worker, nem APK guardam palavras-passe em texto legível; a temporária existe só em
memória, viaja uma vez por HTTPS e mostra-se uma vez no ecrã de partilha.
**Não foi precisa migração para hash** — já era hash. O que faltava era o ciclo de
vida: troca obrigatória, expiração, desativação, super admin e auditoria.

- **Super admin** = documento `admins/<email>` com `isSuper: true` (migração cria-a
  no email fundador). Restrição **no servidor**: regras do Firestore (list/read de
  terceiros, create/update/delete só super; o próprio só toca `lastLoginAt` e
  `mustChangePassword`) e Worker v2.4.0 (rotas `/admin/*` exigem super).
- **Criação**: membro cadastrado → nome/telefone/email/papel → Worker cria a conta
  Auth com password temporária gerada no cliente (`genTempPassword`, 12 chars sem
  0/O/1/l) → documento admins com `mustChangePassword: true` + `tempPasswordIssuedAt`.
- **Ecrã de credenciais de USO ÚNICO** (`OneTimeCredentials`): copiar mensagem,
  WhatsApp (wa.me), SMS (sms:), email (mailto:) — links nativos via `openExternal`.
  Fechar descarta a password do estado; aviso de confirmação ao fechar.
- **Primeiro acesso**: `ForcePasswordChangeModal` bloqueia a app até trocar
  (`updatePassword` + update do próprio doc); temporária **expira aos 7 dias**
  (`isTempExpired`); Worker devolve 403 `PASSWORD_CHANGE_REQUIRED` enquanto não trocar.
- **Repor/desativar**: rotas novas do Worker `/admin/reset-temp-password` e
  `/admin/set-account-disabled` (Identity Toolkit: password nova / `disableUser`),
  com PATCH cirúrgico no documento admins; a conta super é intocável por aqui.
- **Auditoria**: `audit_logs` com `admin.created/password-reset/disabled/enabled/
  password-changed`, quem/quando/alvo — nunca palavras-passe.
- **Último acesso**: `lastLoginAt` escrito pelo próprio no login (regra limitada).
- **Migração de contas antigas**: Admin → Administradores → cartão de migração
  (backup obrigatório primeiro; idempotente).
- Menu móvel (v1.9.8, incluída): «Terminar Sessão» em rodapé fixo do sheet.
- Testes: 63 (alfabeto/aleatoriedade da temporária, mensagem e links de partilha,
  expiração 7 dias). Guia: `docs/VERIFICACAO-ADMIN.md`.


## v1.9.7 (2026-10-24) — Menu móvel: «Terminar Sessão» inacessível; scroll por toque endurecido

Queixa com captura: no menu inferior (bottom-sheet), o botão Terminar Sessão fica
cortado e o sheet não rola. Causa: o scroll estava no próprio content do Radix
Sheet com `max-h-[85dvh] overflow-y-auto` — em WebViews Android o scroll por toque
não ativa ali sem `-webkit-overflow-scrolling: touch`, e `dvh` falha em WebViews
antigas (sem max-h, o sheet cresce para além do ecrã).

- Sheet do menu: `max-h-[85vh]` + `flex flex-col overflow-hidden` e **região de
  scroll interna** `.scroll-native` (overflow-y auto + -webkit-overflow-scrolling
  + overscroll-contain) — o handle e o título acompanham, tudo o resto rola,
  incluindo Terminar Sessão.
- `index.css`: `-webkit-overflow-scrolling: touch` global (fix clássico do scroll
  morto em WebViews) + classe `.scroll-native` reutilizável.
- Diálogo de lançamento das Finanças: `max-h-screen` → `max-h-[92dvh]` (folga aos
  bordos; antes colava ao topo/fundo em ecrãs baixos).

Auditoria de sobreposições (todas as que podem exceder o ecrã):
| Sobreposição | Estado |
|---|---|
| Sheet menu móvel (Layout) | **corrigido agora** |
| Sheet perfil do membro (Members) | ok desde v1.9.6 (scroll nativo interno) |
| Dialog Editar/Novo membro | ok desde v1.9.6 |
| Dialogs Finanças / Admin / fusão / portal / cartão / leitor de docs / pastoral | ok (max-h 90-92dvh + overflow-y-auto) |
| Paleta de comandos (Ctrl+K) | ok (lista com max-h próprio, diálogo pequeno) |
Sem mais telas nesta condição.


## v1.9.6 (2026-10-24) — «Editar Membro» não rolava: ScrollArea Radix morto na WebView

Queixa com captura: no diálogo *Editar Membro* havia campos cortados por baixo e a
área não rolava. Causa: `ScrollArea` (Radix) dentro de coluna flex com `max-h` —
sem `min-h-0` a raiz não encolhe abaixo do conteúdo e o scroll por toque morre na
WebView do Android (funciona enganadoramente no desktop com roda do rato).

- `Members.tsx` (diálogo Editar/Novo e Sheet de perfil): `ScrollArea` →
  `<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain …">` (scroll
  nativo, sempre fiável em touch). Era o único uso de ScrollArea em páginas.
- Diálogos sem limite de altura ganham `max-h-[90dvh] overflow-y-auto`
  (PastoralMessageGenerator, Admin pedidos, fusão de membros) — em ecrãs baixos
  o conteúdo deixava de caber sem forma de chegar ao fim.
- Aspeto e lógica intocados; só comportamento de rolagem.


## v1.9.5 (2026-10-24) — O aviso de atualização falhava em silêncio; agora é redundante e diagnosticável

Queixa: «o aplicativo não me notificou para actualizar a 1.9.4». Causas prováveis
encontradas na auditoria do mecanismo (`lib/updateCheck.ts` + `UpdateBanner`):
1. **O banner só existia na área da liderança** (`Layout`); o Portal do Membro
   nunca mostrava aviso — membros ficavam sem notificação nenhuma.
2. **Throttle de 1 h com tag em cache**: dentro da hora, o aviso usava a tag
   guardada da última consulta; uma release publicada entretanto só aparecia
   na hora seguinte.
3. **Falhas de rede/timeout (6 s) eram engolidas** (`catch { return null }`) sem
   nova tentativa — numa ligação móvel instável, «silêncio» até ao próximo arranque.

Correções:
- Banner também no **Portal do Membro** (`MemberPortal`).
- Throttle 1 h → **15 min**; re-consulta ao voltar ao 1.º plano (`visibilitychange`).
- **Retry automático 60 s** após falha de rede/timeout (evento `iesa:update-retry`).
- **Verificação manual**: Definições → Diagnóstico → botão «Verificar atualizações»
   (força a consulta, ignora throttle; se não houver, toast «Sem atualizações:
   está na versão X»). O cartão mostra ainda a **versão instalada** e a última
   release vista — diagnóstico visível, não às cegas.
- `vite.config.ts`: `__APP_VERSION__` passa a vir do `package.json` por import
   direto (antes dependia de `npm_package_version`, que só existe em `npm run …`).
- Testes: `compareVersions` (3 casos novos; total 56).

Nota: aparelhos com ≤1.9.4 ainda têm o verificador antigo — esta versão instala-se
manualmente; daí em diante o aviso comporta-se como acima.


## v1.9.4 (2026-10-24) — Rolagem acessível em todas as abas (uma só barra vertical)

Causas encontradas (auditoria de layout, sem mudar lógica nem aspeto):
- `Support.tsx:186` raiz com altura fixa `h-[calc(100vh-110px)]` + cartões
  `overflow-hidden` com `CardContent overflow-y-auto` — o cálculo não batia com o
  chrome real (cabeçalho + nav inferior + paddings) e cortava topo/fundo no móvel.
- Listas em fluxo com tampa e scroller próprio (algumas com `scrollbar-hide`, que
  escondia a barra e fazia o conteúdo parecer inalcançável): `Radio.tsx:331`
  (340 px), `Dashboard.tsx:595` (220 px), `BuildingFund.tsx:284` (300 px),
  `Admin.tsx:1226/1275` (500 px).
- Tabelas largas **sem** wrapper horizontal: `Admin.tsx:798/841`, `Assets.tsx:189`,
  `Finances.tsx:1725/1913/2068`, `MemberPortal.tsx:526`, `Members.tsx:690/926` —
  cortadas ao lado em 360 px.

Solução única aplicada a todas as abas: **o scroller vertical é o da página**
(`Layout.tsx:261`, já era o desenhado para isso); removidas alturas fixas e
scrollers internos em fluxo; tampas de listas removidas; tabelas envolvidas em
`overflow-x-auto` + `min-w-[560px]`; cabeçalhos de tabela presos ao topo com uma
regra CSS única em `index.css` (`thead:not([class*="sticky"]) th { position:
sticky; top: 0; background: var(--card) }`), que respeita cabeçalhos já
estilizados (lixeira/auditoria). Diálogos e sheets mantêm scroll próprio
(sobreposições, não abas). Lógica de dados e aspeto: intocados.

Guia de verificação (computador + 360 px, aba a aba): `docs/VERIFICACAO-ROLLAGEM.md`.


## v1.9.3 (2026-10-24) — Dízimos com duas datas, duplicidades, identificação de membros

**1. Duas datas por lançamento** (`deliveryMonth/Year` = entrega, usada pela
contabilidade/relatórios; `referenceMonth/Year` = referência, usada pelo cartão e
portal). UI de registo com «Mês/Ano de Entrega» (por defeito = mês operativo) e
«Meses de Referência» multi-selecção (por defeito = entrega; acompanha a entrega
enquanto não for tocada). Vários meses numa entrega = um lançamento por mês de
referência, mesma entrega, recibo-base sufixado. Meses passam a canónico
`'01'..'12'` em todo o lado (`lib/months.ts`), o que também corrige o bug latente
em que o cartão comparava `'01'` com o legado `'Janeiro'` e mostrava zeros.
Contabilidade (Finanças vista do mês, Dashboard, YearlyStats, Obrigações,
Relatórios) agrega por **entrega** (`deliveryOf`); cartão/portal/tracker por
**referência** (`referenceOf`) — ambos em `lib/tithes.ts`, com fallback ao legado.

**2. Duplicidade** (`classifyTitheDuplicate`, pura e testada): `block` se
membro+referência+valor+entrega iguais; `warn` com os dados do lançamento
anterior (`describeTithe`) e confirmação explícita «CONFIRMAR» se só a referência
coincide (prestações). O gate corre antes do insert optimista, por cada mês do lote.

**3. Membros**: `internalCode` sequencial `M-0001` gerado uma vez por transacção
(`settings/counters`), mostrado como identificação provisória quando não há BI;
BI validado (`^\d{9}[A-Z]{2}\d{3}$`, normalizado) e **único** (bloqueia em
create/edit); nomes iguais/semelhantes (`isSimilarName`: Levenshtein ≤ 2 ou
Jaccard ≥ 0,8 após normalização) avisam com o registo parecido antes de criar;
`mergeMembers(origem, destino)` move dízimos/donativos/comunhões/renovações/
pedidos em lotes de 400, completa lacunas do destino e manda a origem para a
**lixeira** (decisões do utilizador: divisão igual, M-0001, fusão recuperável).

**Migração** em *Admin → Gestão de Dados*: exige descarregar a cópia e marcar
«Fiz a cópia» antes de executar; idempotente; dízimos antigos ficam com
entrega = caixa/ mês antigo e referência = referência/mês antigo, tudo numérico;
membros sem código recebem `M-00XX` a partir da maior sequência existente.
`migrateTitheDoc` é pura e testada.

**Regras**: `isValidTitheCreate` passa a exigir `deliveryMonth/Year` +
`referenceMonth/Year` (tecto de chaves 18).

**Testes**: 53 (antes 33) — dois datas, duplicidade, meses legado→número,
BI, semelhança, migração idempotente, códigos.

**Verificação manual guiada**: `docs/VERIFICACAO-V1.9.3.md` (os dois exemplos do
utilizador, multi-mês, bloqueio, prestação, BI, semelhantes, fusão, legado).


## v1.9.2 (2026-10-24) — Varrimento completo: menu a menu, botão a botão

Auditoria manual de todas as rotas, botões e funções, à procura de silently-broken
no Android. Achados e correções:

1. **Lixeira sem regras = eliminações falhavam em toda a app.** `moveToTrash`
   escreve em `trash/…`, mas não existia `match /trash` nas regras (default é
   `allow read, write: if false`). Adicionado: leitura/criação/eliminação só
   liderança, com validação de campos. Sem isto, «Eliminar membro» etc. morria
   com permission-denied.
2. **Descargas mudas no APK (12 sítios).** Mesma classe do bug do cartão:
   `jsPDF.save()`, `XLSX.writeFile()` e `<a download>` não fazem nada na WebView.
   Novo `src/lib/download.ts` (`saveBlob`, `saveXlsx`, `dataUrlToBlob`,
   `openExternal`): em native → folha de partilha, fallback Documents/Download
   com toast; na web → comportamento clássico. Aplicado em: Membros (Excel/PDF),
   Dízimos por membro (Excel), Finanças (Excel do mês, 3 recibos PDF,
   comprovativo de saída), Relatórios (4 exportações), Admin (backup JSON +
   Excel de utilizadores), Portal do Membro (extrato PDF).
3. **`window.open()` mudo no APK** nos botões de WhatsApp (mensagem pastoral e
   «Enviar Manual» do recibo) → `openExternal()` (Custom Tab via @capacitor/browser).
   (O updateCheck já fazia isto bem.)
4. Funções que passaram a `async` para poder aguardar as descargas (exportações
   e recibos); sem isso o `await` era erro de compilação.

Verificado e **sem problemas**: navegação/rotas/paleta de comandos coerentes;
Obrigações é só-leitura (calcula de tithes/offerings); o gravador da Rádio capta
o STREAM por fetch (não usa microfone → não precisa de RECORD_AUDIO); Settings
(paletas/modo/diagnóstico) e Support (IA/equipa/diagnóstico) ligados; coleções
usadas no código têm todas `match` nas regras (trash era a única excepção).


## 2026-10-24 — Follow-up da auditoria (revisão externa): os três próximos passos

1. **Bootstrap de email auto-extinguível** (em vez de «remover quando houver
   admin», que depende de memória humana): nas `firestore.rules`, o email do
   fundador **deixou de dar privilégios** (`isAdmin()` agora vem só do documento
   `admins/<email>`); resta apenas uma cláusula de **criação única** do próprio
   documento, que só corresponde enquanto esse documento **não existe** — no
   instante em que existe, morre para sempre. No Worker (v2.3.0) o
   `BOOTSTRAP_ADMINS` foi **removido por completo**: o papel vem só do Firestore.
2. **Testes alargados ao AuthContext e ao fluxo de membros:** a lógica de decisão
   do AuthContext foi extraída para `src/lib/access.ts` (pura) e testada
   (`access.test.ts`: sem documento → sem papel; legado sem role → admin;
   liderança = admin/pastor/tesoureiro). O fluxo de comunhão dos membros tem
   testes com o Firestore mockado (`communion.test.ts`: ciclo vazio→✓→✗→vazio,
   marcas legadas normalizadas, `memberEmail` gravado). Total: **30 testes**.
3. **Health check do Worker no pipeline:** passo informativo no `ci.yml`
   (compara a versão no ar com a do repo em cada push/PR, sem bloquear) +
   workflow `worker-health.yml` (cron diário 06:17 UTC + manual) que, em caso de
   drift, **abre automaticamente uma issue** com etiqueta `worker-drift` e o
   procedimento de correção — sem duplicar issues abertas.


## v1.9.0 (2026-10-24) — Auditoria: docs, segurança, testes, resiliência da IA, performance

Resposta point-by-point à auditoria externa:

**Documentação**
- `README.md` novo: descrição, stack, pré-requisitos, configuração local com o
  passo-a-passo das credenciais do Firebase, tabela de scripts, estrutura de
  pastas, resumo de segurança e testes.
- `CONTRIBUTING.md` novo: fluxo de PRs, convenção de commits e as seis
  «regras de ouro» nascidas de incidentes reais (wrangler apaga segredos;
  jsPDF.save() é mudo no Android; medir modelos antes de trocar; etc.).

**Segurança**
- `.env*` já estava no `.gitignore` (confirmado); não há segredos no repo — as
  chaves `AIza…` em `firebase-applet-config.json`/`google-services.json` são a
  config PÚBLICA do Firebase (por desenho); o sensível vive cifrado na Cloudflare.
- Auditoria das regras Firestore: finanças da igreja (offerings, expenses,
  buildingFunds, assets, budgets, financialMonths/Years, expense_receipts)
  passam a **leitura só da liderança**; documentos por membro (tithes,
  communions, donations) passam a ler-se **pelo próprio** (`memberEmail` == email
  do token) ou liderança; documentos antigos sem `memberEmail` (ou com null)
  mantêm leitura autenticada para não partir o portal de ninguém — migração
  natural, cada novo registo já leva `memberEmail` (gravado em Finances,
  MemberCardModal e lib/communion).
- Firebase Storage: **não é utilizado** (getStorage inicializado mas sem usos);
  documentado no README com a recomendação de regras restritas se vier a ativar-se.

**Testes + CI**
- Vitest: `src/lib/__tests__/` com normalizadores do OCR (datas PT→ISO, sexo,
  telefones +244, nº BI), agregações financeiras (`lib/finance.ts` nova, usada
  pelo cartão) e retries/backoff. `npm test` / `npm run test:watch`.
- `lib/finance.ts` novo: aggregateByMonth/sumYear/yearsPresent — fonte única dos
  totais do cartão (MemberCardView já usa).
- `.github/workflows/ci.yml`: em cada PR e push → `tsc --noEmit` + `vitest run` +
  `node --check worker/ai-worker.js`. Sem segredos, corre em forks.

**Resiliência da IA**
- Cliente (`lib/ai.ts → callWorker`): timeout por operação (120 s visão, 60 s
  resto) + `withBackoff` (3 tentativas, backoff exponencial c/ jitter) em erros
  transitórios (408/429/5xx/rede); 400/401/403/404 não repetem.
- `lib/retry.ts` novo (`withBackoff`, `isRetryableError`), testado.
- Worker: em 429/503 repete o MESMO modelo 1× com backoff ~1,2 s antes de mudar
  de modelo (pico de procura transitório não salta logo para o fallback).

**Performance**
- Rotas com code splitting: `React.lazy` + `Suspense` para as 12 páginas
  (Members, Finances, Reports, Admin, Radio, MemberPortal, …); login e fallback
  de carregamento ficam eager. O bundle inicial deixa de incluir páginas que o
  utilizador pode nunca abrir naquela sessão.


## v1.8.2 (2026-10-23) — Comunhão ✓/✗ por clique, credenciais por membro, membro edita os seus dados

- **Comunhão como a liderança decidiu:** as casas do papel levavam a *assinatura do
  pastor*; no digital, **✓ participou / ✗ não participou / vazio = ainda não
  registado**, com grelha de 12 meses (1 clique = ✓, 2 = ✗, 3 = limpa) e
  `recordedBy` como «assinatura» digital. No PDF, ✓/✗ desenhados a vetor.
  Grelha partilhada (`CommunionGrid`) entre o cartão e a **nova aba «Comunhão» em
  Membros** (`CommunionTracker`: pesquisar membro → marcar meses) — sugestão nº 2.
- **Credenciais a partir de membro cadastrado** (sugestão nº 3): em *Admin → Novo
  Utilizador* pesquisa-se o membro pelo nome; se não tiver email, escreve-se um e o
  sistema grava-o no registo do membro. Já não há «email solto» sem membro por trás.
- **Membro edita os próprios dados** (sugestão nº 1): *Portal → Meus Dados → Editar*
  (telefone, morada, estado civil, cônjuge, formação, profissão). Regra nova
  `isSelfEdit()`: só esses campos, só com sessão do próprio email.
- **Worker v2.2.0 — corrige o «não me deixa atribuir credenciais»:** (a) `getRole`
  volta a ter o admin de arranque (`cadupaulino99@gmail.com`), espelhando as
  `firestore.rules` — sem documento em `admins` o Worker dava 403 ao criar contas;
  (b) o token OAuth da service account passa a pedir também o scope
  `identitytoolkit` — só com `datastore`, o `signupNewUser` falhava e a conta de
  email nunca era criada.
- **Versão do APK lê-se do `package.json`** — acaba o ritual de subir a variable
  `ANDROID_VERSION_NAME` a cada release.
- ⚠️ Publicar: **Worker v2.2.0** (colar `worker/ai-worker.js` no editor da
  Cloudflare — Via A do `docs/INICIO-RAPIDO.md`) e **regras do Firestore**
  (workflow *Deploy Firebase*).


## v1.8.0 (2026-10-23) — Cartão de membro digital, fiel ao cartão de papel

O cartão de papel da IESA (fotografado pela liderança) passou a existir dentro da
app, com as duas faces e as quatro tabelas:

- **Frente:** selo IESA, cabeçalho institucional (Sínodo / Igreja Local / Província),
  «Cartão de Membro Nº», dados pessoais completos (filiação, naturalidade, BI +
  emissão, estado civil, batismo, receção como membro) e as tabelas
  **Participou da Comunhão** e **Entrega de Donativos Voluntários** (meses × anos).
- **Verso:** aviso de renovação, tabela **Renovações** com rubrica do pastor,
  fotografia do titular, linha de assinatura, tabela **Entrega de Dízimos**
  (totais mensais + nº de entregas) e o versículo Mal. 3:10.

Onde vive:
- **Liderança:** *Membros → perfil → «Cartão de Membro»* (`MemberCardModal`) —
  vê o cartão, regista **comunhão** (marca livre por mês/ano, com sugestão «FM»),
  **donativos voluntários**, **renovações**, remove registos errados e gera o
  **PDF frente+verso** (`generateMemberCardPdf`, A4 paisagem, 2 páginas).
- **Membro:** *Portal do Membro → separador «O meu cartão»* (`MemberCardView`
  compacto, só leitura) + botão **Descarregar PDF**.

Dados novos:
- `Member`: `memberNumber`, `fatherName`, `motherName`, `placeOfBirth`,
  `photoBase64` (foto comprimida a 400 px no formulário de membro).
- Coleções novas: `communions` {memberId, year, month, mark}, `donations`
  {memberId, amount, date, referenceMonth/Year, recordedBy}, `renewals`
  {memberId, date, pastorSign} — com regras no `firestore.rules`
  (leitura autenticada, escrita só liderança).
- **Comunhão (decisão da liderança, 2026-10-23):** no papel as casas levavam a
  *assinatura do pastor*; no digital usa-se **✓ participou / ✗ não participou /
  vazio = ainda não registado**, com registo por clique numa grelha de 12 meses
  (ciclo vazio → ✓ → ✗ → vazio). Cada marca guarda `recordedBy` — a «assinatura»
  digital. No ecrã, ícones; no PDF, ✓/✗ desenhados a vetor (a fonte do PDF não
  tem esses glifos). Marcas antigas em texto livre continuam a ser mostradas.
- Dízimos no cartão: **totais mensais** a partir da coleção `tithes` já existente
  (decisão da liderança: sem colunas de semana 1ª-4ª; quando há várias entregas no
  mês o cartão mostra «(n×)»).
- Donativos: coleção própria — `offerings` continua a ser as ofertas da igreja
  (sem memberId), para não misturar.

⚠️ Depois de publicar este release é preciso **publicar também as regras**:
`npx firebase deploy --only firestore:rules` (ou o workflow deploy-firebase).
Sem isso, as coleções novas ficam bloqueadas e o cartão aparece vazio.


## v1.7.2 (2026-10-22) — **Correção: a leitura do BI por fotografia não funcionava**

> **CAUSA REAL, medida em 2026-10-22:** o Worker chamava `gemini-3.8-flash`, que
> demorou **170 s** e **390 s** no mesmo pedido em que `gemini-3.6-flash` demorou
> **3,0 s** (6/6 campos em ambos). Um subrequest de um Worker da Cloudflare é
> cortado aos **~100 s**, portanto a chamada nunca chegava ao fim e a app recebia
> 5xx. `gemini-2.5-flash` devolve `404 no longer available to new users`.
> **Worker v2.1.0:** modelos rápidos (`3.6-flash → 3.5-flash-lite → 3.1-flash-lite`),
> timeout de 45 s por tentativa, fallback alargado a `408/429/5xx`,
> `thinkingLevel: low`. Depois da correção: **4,8–10,3 s, 6/6 campos**.
>
> Nota de honestidade: a primeira versão de `docs/FIX-LEITURA-BI.md` apontava como
> causa principal o Worker estar desatualizado. **Estava errado** — a inspeção pela
> API mostrou que o código publicado já era a v1.7.1, com as rotas de visão. O
> documento foi corrigido com as medições.

> Guia completo em [`docs/FIX-LEITURA-BI.md`](./FIX-LEITURA-BI.md).

**Três causas, todas corrigidas:**

1. **O Worker na Cloudflare estava desatualizado** (causa principal, confirmada:
   `GET /__health` devolve 401). As rotas `/assistant/extract-member` e
   `/assistant/extract-receipt` só existem a partir da v1.7.0, mas o Worker era
   publicado **à mão** (colar no editor da Cloudflare) — o APK novo não o atualiza.
   Sem as rotas, a app recebia `404 "Rota nao encontrada"`.
   → **Novo:** `worker/wrangler.toml` + `.github/workflows/deploy-ai-worker.yml`
   (deploy automático em cada push que mude `worker/**`), `npm run deploy:worker`,
   `npm run worker:health`, rotas `/__health` e `/assistant/selftest` de diagnóstico,
   e `WORKER_VERSION` no código. O 404 passa a explicar o que fazer.
2. **O pedido ao Gemini não tinha resolução para OCR.** Sem `mediaResolution`, o
   Gemini 3 dedica poucos tokens à imagem e não lê o texto pequeno do BI (nº,
   emissão, morada). Além disso o texto ia **antes** da imagem (a Google recomenda o
   inverso), `temperature: 0.1` pode provocar `400` nos modelos 3.x, e não havia
   `responseSchema`.
   → **Corrigido:** `MEDIA_RESOLUTION_HIGH` (global e por parte), imagem antes do
   prompt, `responseSchema` por tipo de documento, remoção do `temperature`,
   **fallback de modelos** (`3.8-flash → 3.6-flash → 2.5-flash`) e 4 configurações
   tentadas por ordem. Aceita data URL, valida o MIME e o limite de 20 MB.
3. **A app lia mas deitava os dados fora.** `Members.tsx → onApply` ignorava
   `documentNumber`, `gender` e `issueDate`; `birthDate` vinha `07/03/1990` mas o
   `<input type="date">` exige `1990-03-07`; `gender` vinha `M` mas o `<Select>`
   exige `Masculino` — ambos rejeitados **em silêncio**. E o tipo `Member` nem tinha
   campo para o nº do BI.
   → **Corrigido:** `Member.documentNumber`/`issueDate` + campo "Nº do Bilhete de
   Identidade" no formulário e no perfil; normalizadores `normalizeDate`,
   `normalizeGender`, `normalizePhone`, `normalizeDocumentNumber`,
   `normalizeMemberFields`; toast a dizer exatamente o que a IA preencheu.

**Armadilha do Wrangler (documentada e contornada):** `wrangler deploy` apaga os
segredos do Worker que não estiverem no `wrangler.toml` — destruiria
`GEMINI_API_KEY` e `FIREBASE_SA_JSON`. Acrescentado `scripts/deploy-worker-api.mjs`,
que publica pela API da Cloudflare **reenviando os bindings existentes** (preserva os
segredos), pára se faltar algum, e confirma o `/__health` no fim. O
`wrangler.toml`, o `deploy-ai-worker.yml` e os guias ficaram com o aviso; o
workflow fotografa os segredos antes/depois e falha se algum desaparecer.
Guia curto para não-técnicos: `docs/INICIO-RAPIDO.md`.

**Ferramentas novas:** `npm run test:bi` corre a mesma foto em 3 modos (v1.7.x vs.
corrigido vs. corrigido+schema) usando `scripts/testdata/exemplo-bi-angola.jpg`
(BI fictício) — isola em segundos se o problema é o Gemini, o Worker ou a app.
O `DocumentReaderModal` ganha botão **"Testar ligação"**, painel de **Diagnóstico**
(versão do Worker, segredos presentes, papel do utilizador, Gemini alcançável),
**"Tentar novamente"** e mostra a dimensão/peso da imagem optimizada.
`compressImageFile` passa a ter fundo branco (PNG transparente não fica preto) e
*fallback* para os bytes originais quando o `<canvas>` não descodifica (HEIC/HEIF).

**Novo separador «Diagnóstico IA» em *Suporte***: corre automaticamente ao abrir e
mostra, em linguagem simples, a versão do Worker, se a leitura de documentos está
publicada, se os segredos `GEMINI_API_KEY`/`FIREBASE_SA_JSON`/`PROJECT_ID` existem,
o papel do utilizador e se o Gemini responde — com a indicação do que fazer em cada
falha. A lógica é partilhada com o modal de documentos através de
`runAiDiagnostics()` em `src/lib/ai.ts` (um só sítio para manter).

Validação: `npx tsc --noEmit` ✅ · `node --check worker/ai-worker.js` ✅

---

## v1.7.0 (2026-10-22) — Visão com IA: ler documentos por fotografia

- **Novo no Worker** (colar no painel Cloudflare!): `/assistant/extract-member` (BI e cartão de
  membro batizado, impresso ou **manuscrito**) e `/assistant/extract-receipt` (comprovativos
  bancários angolanos). Gemini com `inlineData` + `responseMimeType: application/json`
  → campos estruturados, `temperature 0.1`, nunca inventa (null se ilegível).
- **Novo na app**: `DocumentReaderModal` (fotografar/escolher → compressão no dispositivo
  máx. 1280 px JPEG → leitura → tabela de campos → **Aplicar**).
  - Membros: botões «🪪 Bilhete de Identidade» e «✝️ Cartão de Membro» no formulário —
    preenchem nome, telefone, nascimento, batismo, morada e célula automaticamente.
  - Finanças: «🧾 Ler comprovativo com IA» no registo de entrada — preenche o valor e
    acrescenta data/banco/pagador/referência aos detalhes.
- Segurança: as rotas exigem sessão Firebase + papel de liderança, com rate limit.

---
## v1.6.0 (2026-10-22) — Sistema de design: duas paletas à escolha nas Definições

- **Modo e Paleta separados**: o modo (claro/escuro/sistema) controla os cinzas; a paleta
  controla a cor de ação/destaques. Definições → Aparência tem agora dois seletores.
- **Paleta «IESA Clássico»** (predefinida): vermelho da cruz `#B4232A` para ações +
  dourado do selo `#C99A2E` para rádio/destaques; versões dark ajustadas para contraste AA.
- **Paleta «Executivo»**: grafite `#101828` para ações + dourado como único acento
  (no escuro: botões claros com tinta escura).
- Tokens expostos ao Tailwind (`bg-brand`, `text-brand`, `bg-brand/10`, `--gold`) e
  utilitários `.acc-*` para as barras de acento dos cartões de estatística.
- Barra de navegação inferior e botões primários passam a seguir a paleta escolhida.
- Separadores com pill ativa de contraste garantido nos dois modos.
- Os 4 temas completos legados (cósmico/floresta/oceano/pôr-do-sol) mantêm-se como paletas
  «tema completo» e continuam a funcionar como dantes.

---
## v1.5.5 (2026-10-22) — Administração 100% na base de dados + Worker endurecido

- **Removido o admin hardcoded** (`cadupaulino99@gmail.com`) dos 3 sítios
  (AuthContext, Worker, Cloud Functions). Todo o poder de admin vem agora do documento
  `admins/{email}` no Firestore (criado manualmente no console antes deste release).
  Dar/tirar admins passa a ser só editar a coleção `admins` — sem tocar no código.
- **Worker endurecido** (colar também no painel Cloudflare!): cache de papéis 5 min,
  rate limit 60 pedidos de IA / 10 min por utilizador (HTTP 429 amigável),
  token OAuth com `expires_in` real.

---
## v1.5.4 (2026-10-22) — Aviso de atualização dentro da app

- Ao abrir, a app consulta `releases/latest` no GitHub (1x/hora, falha em silêncio)
  e compara com a versão embutida no build (`__APP_VERSION__` via vite `define`).
- Banner no topo: «Nova versão disponível» + **Instalar** (abre o APK assinado numa
  Custom Tab do Chrome via `@capacitor/browser`; na web abre separador) + «Agora não»
  (guarda a decisão por versão).
- Inclui também as correções visuais da v1.5.3 (stats 2 colunas, tabs legíveis,
  IA empilhada, timeout da rádio, zona 640-767 px).

---
## v1.5.3 (2026-10-22) — Afinação fina com capturas reais do telemóvel

- Correções móveis passam a cobrir **toda a zona < 768 px** (antes só ≤640 px,
  e o telemóvel de teste vive na zona intermédia).
- Dashboard: cartões de estatística em **2 colunas** no telemóvel, valores compactos
  (`text-lg`), título «Painel de Controlo» contido.
- **Separador ativo legível no tema escuro** (texto escuro sobre a pill branca).
- Cartão «Parecer Executivo & IA»: empilha no telemóvel (título → descrição → botão a largura inteira).
- Gráficos (Recharts) com `min-w-0`/`max-width:100%` — nunca mais empurram cards para fora do ecrã.
- Rádio: **timeout de 12 s** ao ligar — se a emissão não responder, mostra mensagem e libera o botão.

---
## v1.5.2 (2026-10-21) — Correções de visualização móvel

- **Nada fica debaixo do rodapé**: a barra de navegação inferior passa a estar **em fluxo**
  (faz parte da coluna flex do ecrã), em vez de `fixed` sobre o conteúdo.
- **Altura real do ecrã**: `h-dvh`/`min-h-dvh` (viewport dinâmico) em vez de `100vh`,
  que em WebViews Android cortava conteúdo atrás das barras do sistema.
- **Menu «Mais» como bottom-sheet nativo** (grelha 2 colunas + alça + fechar),
  em vez de gaveta lateral que "partia" o ecrã ao meio.
- **Fim da inflação de texto da WebView**: `-webkit-text-size-adjust: 100%`
  (era a causa dos textos gigantes e desajustados).
- Escala tipográfica contida em ≤640 px (h1/h2/h3, células de tabela),
  inputs a 16 px (sem zoom ao focar), diálogos/paleta limitados à largura do ecrã,
  toasts a largura inteira, `viewport-fit=cover` para safe-areas.
- **Gravações da rádio** com scroll próprio (máx. 340 px) — a lista nunca empurra
  conteúdo para debaixo do rodapé, mesmo com muitas gravações.
- Mini-player assenta exatamente acima da barra de navegação (CSS com safe-area).

---
## v1.5.0 (2026-10-21) — Visual de app nativa + Rádio Maranata

### Casca com sensação nativa (Android)
- **Barra de navegação inferior** com 5 separadores (Início, Membros, Finanças, Rádio, Mais) —
  padrão Material/Android; a sidebar passa a ser só para desktop/tablet.
- **Mini-player da rádio** flutuante: a emissão continua a tocar ao navegar e volta a aparecer
  numa barra por cima dos separadores (pausar / abrir).
- **Barra de estado nativa** acompanha o tema (`@capacitor/status-bar`: ícones + cor de fundo).
- **Safe-areas** (notch e gestos), sem *tap highlight*, sem *overscroll* de browser,
  scroll sem scrollbar visível (utility `scrollbar-hide` que faltava), alvos de toque ≥ 44 dp.
- **Textos revistos (pt-PT)**: Início, Finanças, Obrigações, Fundo de Construção, Património,
  Orçamento, Relatórios, Rádio Maranata, Administração, Suporte & IA.

### Rádio Maranata 91.9 FM (Lubango) — nova aba
- Stream oficial: `https://azura4.cmaudioevideo.com:8450/radio.aac` (Icecast/AzuraCast, AAC 48 kbps).
- Player ao vivo com estado (A ligar / Em direto / erro), equalizador animado e volume.
- «A tocar agora» + nº de ouvintes via API pública do AzuraCast (falha em silêncio se offline).
- **Gravação da transmissão em tempo real**: `fetch` + ReadableStream (o servidor reflete CORS),
  bytes AAC guardados em `Documentos/Radio/Maranata_AAAA-MM-DD_HHhMM.aac` (`@capacitor/filesystem`).
- **Biblioteca de gravações no telemóvel**: reproduzir, partilhar/exportar e apagar.
- Na web (desktop), a gravação é transferida como ficheiro `.aac`.

### Técnico
- Dependências novas: `@capacitor/filesystem`, `@capacitor/status-bar` → `cap sync` → 5 plugins.
- `src/lib/radio.ts` (player singleton + gravador + biblioteca), `src/pages/Radio.tsx`,
  rota `/radio`, entrada na paleta de comandos.
- **Antes do build**: subir as variables do Actions para `VERSION_NAME=1.5.0` e `VERSION_CODE=5`
  (senão o passo da Release substitui os ficheiros da tag v1.4.0).

---

Original: `github.com/cadupaulino99/Gest-o_Emanuel_Xangongo` (cópia intacta em `01_prototipo/`).
Projeto corrigido: esta pasta (`03_android/`). Validação: `tsc --noEmit` ✅ (web e functions).

## Bloqueios críticos resolvidos
| # | Problema original | Solução | Ficheiros |
|---|---|---|---|
| C1 | Login Google por popup (bloqueado na WebView) | Google **nativo** via `@capacitor-firebase/authentication` + **email/password** + recuperação de palavra-passe | `src/context/AuthContext.tsx`, `src/App.tsx` |
| C2 | Firebase temporário do AI Studio | Guia completo para projeto próprio; config isolada | `docs/GUIA-FIREBASE.md`, `firebase-applet-config.json` (a substituir) |
| C3 | `/api/assistant/*` só no Express do AI Studio | 3 **Cloud Functions callable** (auth obrigatória, só liderança) | `functions/src/index.ts`, `src/lib/ai.ts`, 3 componentes |
| C4 | Modelo `gemini-3.5-flash` não existe | `gemini-3.8-flash` (estável, verificado na doc. oficial) | `functions/src/index.ts`, `server.ts` |
| C5 | Plugins Capacitor não sincronizados | `cap sync` no workflow + guia; config de plugins | `capacitor.config.ts`, `.github/workflows/build-android.yml` |

## Problemas importantes resolvidos
| # | Problema | Solução |
|---|---|---|
| I1 | Logótipo em URL morta do AI Studio | Logótipo novo **embutido** (`public/logo-iesa.png`) + todos os ícones/splashes **regenerados** (os PNG do repo estavam **corrompidos**: byte `0x89`→`EF BF BD`) |
| I2 | Fontes Google via rede | Fontes de sistema (robusto offline); sem `@import` remoto |
| I3 | Faltavam permissões Android | `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK` |
| I5 | `localStorage` volátil na WebView | `src/lib/prefs.ts`: espelho em `@capacitor/preferences` + hidratação no arranque (9 ficheiros ligados) |
| I6 | Sem assinatura de release | `signingConfigs` + `keystore.properties` opcional (fallback debug) |
| I7 | Functions em Node 18 | Node **22** + `tsconfig.json` das funções (não existia!) |
| I8 | Service worker PWA dentro do APK | `vite-plugin-pwa` removido; `base: './'` |

## Identidade e loja
- Nome: **"Gestão IESA Emanuel"**; package id **`ao.co.iesa.emanuelxangongo.gestao`**
  (Android: namespace, applicationId, pasta Java, strings).
- Ícone adaptativo, splash portrait/landscape em 5 densidades, favicon, `logo192/512`.
- `index.html` em `pt` + `theme-color`.
- `versionCode/versionName` por variáveis de ambiente (CI).

## Funcionalidades novas
- **Criação de contas por admin**: ao adicionar um utilizador em *Admin*, a Cloud Function
  `createAuthAccount` cria a conta Auth com palavra-passe temporária (mostrada uma vez).
- **Ecrã de login** com separadores Google / Email + erros em português + recuperação.
- **CI/CD**: `build-android.yml` (APK debug+release e AAB como artifacts) e
  `deploy-firebase.yml` (regras+índices+funções, manual).

## Sem alterações (deliberado)
- `firestore.rules` — validação excelente; mantém-se.
- `firestore.indexes.json` — análise: as queries compostas usadas já estão cobertas;
  queries de campo único não precisam de índice composto.
- Triggers `sync*` de resumos financeiros — lógica correta, mantida.
- Páginas/componentes de gestão (membros, finanças, relatórios…) — só toques pontuais
  (IA, prefs, logótipo).

## Para fazer POR TI (não posso fazer daqui)
1. Criar projeto Firebase + `google-services.json` → `docs/GUIA-FIREBASE.md`.
2. Chave Gemini → `firebase functions:secrets:set GEMINI_API_KEY`.
3. Compilar o APK → `docs/GUIA-BUILD-APK.md` (GitHub Actions ou Android Studio).
4. Revogar o token de GitHub que partilhaste no chat.
