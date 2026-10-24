# ✅ VERIFICAÇÃO — Avisos, Agenda e Eventos (v1.13.0)

Guião de publicação e testes do módulo novo. Tempo estimado: 30–40 min.

---

## 0. Publicar (por esta ordem)

### 0.1 Cópia de segurança ANTES de tudo
1. Entrar como **admin** → *Administração → Gestão de Dados*.
2. Carregar em **«1. Descarregar cópia de segurança»** e guardar o ficheiro.
   Sem cópia confirmada, não avance.

### 0.2 Activar o Firebase Storage (uma vez, 2 min)
Os cartazes dos eventos vivem no Storage (nunca base64 na base de dados).
1. <https://console.firebase.google.com> → projecto **iesa-emanuel-xangongo**.
2. Menu **Storage → Começar** (plano Spark inclui; escolha a região sugerida).
   Sem este passo, o carregamento de cartazes falha (o resto do módulo funciona).

### 0.3 Código + regras
1. Aplicar/confirmar o merge da v1.13.0 no `main`.
2. Correr o workflow **«Deploy Firebase»** (Actions) — agora publica
   `firestore:rules`, `firestore:indexes` **e `storage`**.
   - Não há índices compostos novos (as consultas do módulo são de campo único).
   - "Script de criação das estruturas": Firestore é sem esquema — as
     colecções novas (`agenda_items`, `board_notify_log`) nascem na primeira
     gravação; o que se publica são as **regras** (este workflow) e o
     `storage.rules`.

### 0.4 Worker 2.7.0 (lembretes de eventos)
Publicar `worker/ai-worker.js` pela **Via A** (editor da Cloudflare, colar o
ficheiro todo). Confirmação: `GET /__health` → `version: "2.7.0"`.
Sem isto, tudo funciona EXCEPTO o lembrete «1 dia antes».

### 0.5 APK v1.13.0
O build do Android corre automaticamente no push ao `main` (Actions →
*build-android*). Instalar a v1.13.0 no telemóvel de teste (o aviso de
actualização dentro da app deve aparecer).

---

## 1. Criar na Administração e ver no Portal

Como **liderança** (admin, pastor ou tesoureiro) → *Administração →
«Avisos, Agenda e Eventos»*:
1. **Aviso**: título «Teste de aviso», texto com negrito e uma lista, nível
   Normal → **«Publicar e notificar»**.
2. **Agenda**: «Culto de doutrina», Quarta, 18:30–20:00, Templo →
   «Acrescentar à agenda».
3. **Evento**: «Conferência de teste», data futura, 18:00, local Templo,
   cartaz (imagem ≤10 MB) → «Publicar e notificar».

Entrar como **membro** (conta ligada a um registo de membro) → aba
**«Avisos, Agenda e Eventos»**:
- [ ] separador **Avisos**: o aviso aparece (texto formatado preservado);
- [ ] separador **Agenda**: navegue até à semana certa — quarta-feira mostra
      «18:30–20:00 · Culto de doutrina · Templo»;
- [ ] separador **Eventos**: o evento está em «Próximos» com «Faltam N dias»;
      ao abrir: detalhes todos + cartaz; «Ver cartaz em ecrã inteiro» funciona;
- [ ] **não existe nenhum botão** de criar/editar/apagar no Portal.

## 2. Rascunho invisível aos membros

1. Na Administração → Avisos: escrever «Rascunho secreto» → **«Gravar rascunho»**.
2. Como membro: o aviso **não aparece** (nem no Portal, nem nas notificações).
3. Na Administração: aparece na secção **«Rascunhos»**; «Editar» → «Publicar
   e notificar» → já aparece ao membro.

## 3. «Visível até» no passado → arquivo (sem apagar)

1. Editar o «Teste de aviso» → **Visível até** = uma data de **ontem** → guardar.
2. Como membro: o aviso **desapareceu** da lista.
3. Na Administração → secção **«Arquivo — expirados e ocultados»**: o aviso
   está lá com o selo «Expirado (visível até …)».
4. **«Republicar»** → volta imediatamente ao Portal (e notifica).
5. Confirmar que **nada foi apagado** automaticamente (Lixeira vazia).

## 4. Cancelar ocorrência da agenda + evento adiado/cancelado

1. Administração → Agenda → no item de quarta: **Suspender** = a próxima
   quarta-feira → «Cancelar ocorrência».
2. Como membro, nessa semana: a atividade aparece **riscada** com o selo
   vermelho **«Cancelado»**; nas outras semanas continua normal.
3. Administração → Eventos → editar «Conferência de teste» → estado **Adiado**
   (mudar também a data) → guardar; repetir com **Cancelado**.
4. Como membro: o evento continua em «Próximos» mas com o estado em destaque
   (ADIADO amarelo / CANCELADO vermelho, linha com fundo vermelho).

## 5. Alterar a data de um evento → notificação no sistema

1. Como membro, registar o contador do **sino** (topo).
2. Como liderança: editar o evento → data nova → «Guardar e notificar alterações».
3. Como membro (aguardar até 60 s ou reabrir a app): o sino incrementa;
   a notificação diz **«Evento «Conferência de teste» alterado para dd/mm às hh:mm»**.
4. Publicar + 2 novidades **no mesmo dia** → continua **UMA** notificação,
   agora «3 novidades em Avisos e Eventos» com a lista (máx. 1/dia/membro).
5. (Opcional, SMS/WA) marcar «Enviar também por SMS/WhatsApp» numa publicação:
   em *Contribuições → Fila* aparece 1 mensagem `board` por membro com
   telefone (modo manual, janela de 10 min); uma segunda publicação no mesmo
   dia **não** gera outra SMS ao mesmo membro.

## 6. Membro NÃO consegue escrever (pedido directo ao servidor)

Com sessão de **membro**, provar que a recusa vem do servidor (não do UI):

**Opção A — Firebase Console (recomendado):** *Firestore Database → Regras →
«Rules Playground»*: Simulation type = **create**, Location =
`/announcements/teste`, autenticado = **true** com o UID do membro, dados:
`{"title":"hack","content":"x","active":true,"createdAt":1,"adminId":"x"}` →
**SIMULATE** → tem de dar *deny* (`false for security`). Repetir para
`/events/x` e `/agenda_items/x`.

**Opção B — pedido REST real:** no navegador do membro (app aberta), DevTools →
*Application → IndexedDB → firebaseLocalStorageDb → firebase:authUser:…* →
copiar `stsTokenManager.accessToken`; depois na Consola:
```js
fetch('https://firestore.googleapis.com/v1/projects/iesa-emanuel-xangongo/databases/(default)/documents/announcements', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer COLAR_O_TOKEN' },
  body: JSON.stringify({ fields: { title: { stringValue: 'hack' }, content: { stringValue: 'x' }, active: { booleanValue: true }, createdAt: { integerValue: '1' }, adminId: { stringValue: 'x' } } })
}).then(async r => console.log(r.status, await r.text()));
```
→ tem de devolver **403 PERMISSION_DENIED**. (Com token de liderança e campo
`contentHtml` limpo, o mesmo pedido passa — prova que o critério é o papel.)

## 7. `<script>alert(1)</script>` não corre

1. Administração → novo aviso → **escrever e colar** no editor:
   `<script>alert(1)</script>` e também `<img src=x onerror=alert(1)>`.
2. Nenhum `alert` aparece; o texto surge como **texto visível** ou some
   (etiquetas perigosas são removidas com o conteúdo).
3. Gravar, abrir o documento no Firebase Console: `contentHtml` **não contém**
   `<script` nem `onerror=`.
4. Ver no Portal do membro: nenhum alert; o texto aparece inofensivo.
5. (Prova do servidor) Rules Playground → create em `/announcements/x` com
   `contentHtml: "<script>alert(1)</script>"` e UID de liderança → **deny**
   (o validador `isSafeRichText` recusa mesmo vindo da liderança).

## 8. Volume no telemóvel (360 px)

1. Criar **30 avisos** e **20 eventos** (pode usar datas variadas; alguns
   urgentes/fixados, 2–3 com cartaz).
2. No telemóvel (ou DevTools em 360×640): abrir a aba — a lista rola com
   fluidez, os fixados/urgentes aparecem primeiro, «Ver mais» só nos textos
   longos, os eventos mostram miniaturas sem engasgar.
3. Semana da agenda com vários dias preenchidos: cabe no ecrã sem cortes.

## 9. Evento às 23:30 não muda de dia noutro aparelho

1. Criar evento «Vigília» às **23:30** de uma data próxima.
2. Ver no aparelho A (fuso de Luanda): «dd/mm às 23:30».
3. No aparelho B com **outro fuso** (Definições do Android → fuso horário,
   ex.: UTC+3, ou emulador) com a mesma conta: continua **dd/mm às 23:30**
   — a data/hora são strings locais, não há conversão; só os rótulos
   («Hoje», «Faltam N dias») usam o dia de Luanda.

---

## O que ficou de fora desta versão (combinado)

- Confirmação de presença em eventos;
- Exportar para o calendário do telemóvel (.ics);
- Comentários;
- Grupos de destinatários (avisos segmentados);
- Repetições de eventos que não sejam a agenda semanal;
- Partilha para fora da aplicação.

## Notas

- **Papéis**: publica toda a liderança (admin/pastor/tesoureiro); o antigo
  mural só carregava para `admin` — agora cada componente carrega os seus
  dados para qualquer papel de liderança.
- **Legados**: avisos/eventos antigos continuam a funcionar (active:true ⇒
  publicado; sem estado ⇒ marcado). O Dashboard da liderança não mudou
  (espelhos `date`/`time`/`description` continuam a ser gravados).
- **Storage**: as regras do Storage não conseguem ler o Firestore — o papel é
  garantido nas regras do Firestore (só liderança grava `posterPath`, e só com
  caminho `posters/…`); o upload exige sessão e o bucket só aceita imagens.
- Apagar aviso/evento/atividade vai para a **Lixeira** (recuperável em
  *Administração → Lixeira*). Só o histórico de eventos tem «apagar
  definitivamente», com confirmação digitada.
