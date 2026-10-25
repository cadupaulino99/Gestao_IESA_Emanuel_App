# ✅ VERIFICAÇÃO — Auto-cadastro do membro (v1.14.0)

## 0. Publicar (por esta ordem)

1. **Cópia de segurança**: Administração → Gestão de Dados → «1. Descarregar
   cópia de segurança» (sempre antes de publicar regras).
2. **Regras do Firestore**: Actions → **«Deploy Firebase»** → Run workflow
   (publica `firestore.rules` com `member_signups` e a troca-obrigatória).
3. **Worker 2.8.0** (obrigatório — o auto-cadastro vive nele):
   Cloudflare → Workers & Pages → `iesa-ai` → *Edit code* → colar
   `worker/ai-worker.js` → **Deploy**. Conferir:
   `https://iesa-ai.cadupaulino99.workers.dev/__health` → `"version": "2.8.0"`
   e a rota `/auth/self-register (público)` na lista.
4. **APK v1.14.0**: build automático no push (Actions); instalar no telemóvel.

> Sem o passo 3, o formulário de cadastro devolve erro claro («Não foi
> possível enviar» / 404 = Worker antigo). Nada mais na app é afectado.

## Base de dados (sem migração, sem apagar nada)

- Colecção nova `member_signups/<email-normalizado>` — nasce no primeiro
  pedido (criada só pelo Worker).
- `members`: campos novos OPCIONAIS (`mustChangePassword`, `memberEmail`,
  `signupId`). Membros antigos continuam a funcionar exactamente como antes.
- Palavras-passe: só no Firebase Auth (hash scrypt da Google). O Firestore
  nunca as guarda; o Worker nunca as loga.

## 1. Cadastro (telemóvel ou web)

1. Ecrã de login → **«Ainda não tem conta? Criar conta / Cadastrar-me»**.
2. Preencher: nome, email, palavra-passe (8+) e confirmação; telefone
   `+244 9XX XXX XXX`; BI `123456789LA012`; restantes opcionais; foto opcional.
3. «Enviar cadastro para aprovação» → ecrã **«Cadastro recebido!»**
   (mensagem: aguarda autorização do administrador).
4. Verificar no Firebase Console → Firestore → `member_signups/<email>`:
   `statusSignup: 'pendente'`, dados todos, **sem campo de palavra-passe**.
- [ ] Campos inválidos são recusados com mensagem (nome <2, email inválido,
      palavra-passe <8, confirmação diferente, telefone errado, BI errado).

## 2. Login com cadastro pendente → sem acesso

1. Login com o email + palavra-passe do cadastro.
2. - [ ] Entra no ecrã **«Cadastro aguarda aprovação»** (ampulheta) — NÃO
      aparece o Portal do Membro nem qualquer dado.
3. - [ ] Botão «Terminar sessão» funciona; «Já fui aprovado — verificar
      novamente» reavalia o estado.

## 3. Aprovação (perfil admin)

1. Entrar como **admin** → Administração → aba **«Cadastros Pendentes»**
   (só o perfil admin a vê; pastor/tesoureiro não).
2. - [ ] O pedido aparece com foto/dados; «Ver todos os dados» expande.
3. «Aprovar» → confirmar.
4. - [ ] Em **Membros**: o novo membro está `Activo`, com `internalCode`
      M-XXXX seguinte e email ligado.
5. - [ ] Na aba: pedido passou a «Aprovados» com quem/quando.
6. - [ ] Sino do membro (depois do 1.º login): «Cadastro aprovado — bem-vindo(a)!».

## 4. Primeiro login → troca obrigatória da palavra-passe

1. Terminar sessão; entrar com o email + a palavra-passe DO CADASTRO.
2. - [ ] ANTES de qualquer ecrã: diálogo **«Defina a sua palavra-passe
      definitiva»** (não se fecha tocando fora).
3. Tentar nova igual à actual → - [ ] recusa («tem de ser DIFERENTE»).
4. Nova com <8 → - [ ] recusa. Confirmação diferente → - [ ] recusa.
5. Actual errada no primeiro campo → - [ ] «A palavra-passe actual está errada.»
6. Correcto → - [ ] «Palavra-passe definitiva gravada. Bem-vindo(a)!» e entra
      no Portal do Membro.
7. Sair e entrar com a NOVA palavra-passe → - [ ] entra directamente (sem diálogo).
8. - [ ] Firestore: `members/<id>.mustChangePassword == false`.

## 5. Rejeição

1. Novo cadastro (outro email) → Admin → «Cadastros Pendentes» → **Rejeitar**
   com motivo «Já existe registo com outro email» → confirmar.
2. Login com esse email/palavra-passe → - [ ] ecrã **«Cadastro rejeitado»**
   com o MOTIVO visível; sem acesso a nada; «Terminar sessão» funciona.
3. - [ ] Rejeitados aparecem no filtro «Rejeitados» da aba, e podem ser
      **Aprovados mais tarde** directamente daí (o admin reconsidera).
4. Novo auto-cadastro com o mesmo email → - [ ] «O seu cadastro foi rejeitado:
   <motivo>. Contacte o administrador.»

## 6. Duplicados (não cria cópias)

Com um membro já cadastrado pela liderança (ex.: telefone `+244923000000`):
- [ ] Auto-cadastro com o MESMO email de um membro → «Já existe uma conta
      com este email…».
- [ ] Com o MESMO BI → «Este B.I. já está cadastrado… contacte o administrador».
- [ ] Com o MESMO telefone → «Este telefone já está associado a um membro…».
- [ ] Repetir um pedido pendente → «Já existe um pedido pendente…».
(Decisão: nunca liga automaticamente a um registo existente — quem decide é
o administrador, que já tem o fluxo «Novo Utilizador» para dar credenciais.)

## 7. Servidor, não só botões escondidos

- **Sem Worker actualizado não há cadastro**: a validação toda (allowlist,
  política 8+, duplicados, rate limit) corre no Worker 2.8.0.
- **Rules Playground** (Firebase Console → Firestore → Regras):
  - update em `/member_signups/maria@x.com` com UID de **pastor** → *deny*
    (só `admin` aprova/rejeita);
  - create em `/member_signups/x` autenticado (qualquer um) → *deny*
    (só o Worker cria);
  - update em `/members/<id>` com UID do próprio membro mudando só
    `mustChangePassword:false` → *allow*; mudando `name` → *deny*.
- **Rate limit**: 6 cadastros seguidos da mesma ligação (mesmo com dados
  válidos) → o 6.º devolve «Demasiadas tentativas… aguarde» (429).
  Login: o Firebase Auth já limita tentativas («Demasiadas tentativas» no ecrã).
- **Mensagens de login genéricas**: email inexistente e palavra-passe errada
  devolvem AMBOS «Email ou palavra-passe incorretos.» (não revela existência).

## 8. Regressão (não partir o que existe)

- [ ] Membros cadastrados pela liderança entram como antes (sem diálogo de troca).
- [ ] Admin → Membros → «Novo Membro»: formulário igual (o esquema zod foi
      movido para `lib/memberSchema.ts`, não alterado).
- [ ] Admins com palavra-passe temporária continuam com o SEU modal de troca.

## Decisões tomadas (corrija se quiser diferente)

1. Pedidos em colecção própria `member_signups` (id = email) — `members`
   continua a ser só a lista oficial.
2. Conta Auth criada NO acto do cadastro (garante unicidade real do email e
   hash forte); rejeição NÃO apaga a conta (para mostrar o motivo no login) —
   o email fica reservado; reaprovação resolve.
3. Duplicados por email/BI/telefone → bloqueio + «contacte o administrador»
   (sem ligação automática: segurança de identidade).
4. Rate limit do cadastro: 5 pedidos/10 min por IP (Worker); login: Firebase.
5. «Cadastros pendentes» só para perfil `admin` (requisito 6) — liderança
   restante não vê a aba e o servidor recusa-lhe as escritas.
