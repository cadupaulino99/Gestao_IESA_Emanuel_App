# Verificação — gestão de administradores (v1.10.0)

> Pré-requisitos: APK v1.10.0 instalado; **Worker v2.4.0 publicado** (colar
> `worker/ai-worker.js` no editor da Cloudflare → Save and Deploy → `/__health` = 2.4.0);
> regras do Firestore publicadas (workflow *Deploy Firebase*); e, uma vez,
> *Admin → Administradores → Migração de contas existentes* (backup primeiro).

## A. Criar um administrador e partilhar as credenciais

1. Entre como **super** (cadupaulino99@gmail.com) → *Administração → Administradores*.
2. **Novo administrador** → pesquise o membro pelo nome → escolha → papel → **Gerar credenciais**.
3. **Esperado:** ecrã «Credenciais do administrador» com utilizador + palavra-passe
   temporária (12 caracteres, sem 0/O/1/l) e quatro botões:
   - **Copiar mensagem** → cola num bloco de notas: tem nome da app, utilizador,
     password temporária e endereço de acesso;
   - **WhatsApp** → abre o WhatsApp com o número do membro e a mensagem escrita;
   - **SMS** → abre a app de SMS com a mensagem;
   - **Email** → abre o email com assunto e corpo.
4. Feche o ecrã → **esperado:** aviso «ao fechar deixa de poder ser vista»; depois
   de fechar, **não há onde a recuperar** (só gerando nova).

## B. Primeiro acesso do novo administrador

1. Saia da sua conta e entre com o email novo + a password temporária.
2. **Esperado:** modal bloqueante «Troca obrigatória» — sem dele não se usa a app;
   defina uma password nova (8+), a app recarrega e entra.
3. Volte a sair e entre com a **temporária outra vez** → **esperado:** erro de
   credenciais (deixou de valer).
4. Deixe passar 7 dias sem trocar (ou teste com um relógio adiantado):
   **esperado:** modal diz «expirou» e só oferece Terminar sessão.

## C. Um administrador normal NÃO gere admins

1. Entre como o admin novo (papel admin/pastor/tesoureiro).
2. **Esperado:** o separador «Administradores» **não aparece**; e abrindo
   `/admin` à mão, o conteúdo mostra «Acesso negado».
3. Prova de servidor (não só de ecrã): com esse login, qualquer escrita em
   `admins/` é recusada pelas regras do Firestore, e as rotas `/admin/*` do Worker
   devolvem 403 «Só o super administrador».

## D. Repor, desativar, auditar

1. Como super: na linha de um admin → **chave** («Gerar nova palavra-passe
   temporária») → **esperado:** ecrã de partilha outra vez; o utilizador é obrigado
   a trocar no acesso seguinte.
2. **X/✓** desativa/reativa: desativado → o utilizador não entra (app e Worker
   bloqueiam); os dados não são apagados; reativar repõe o acesso.
3. A linha do **super** não tem estes botões (não pode ser reposto nem desativado).
4. *Administração → Auditorias*: aparecem `admin.created`, `admin.password-reset`,
   `admin.disabled`, `admin.enabled`, `admin.password-changed` com quem fez e quando —
   **sem palavras-passe no registo**.

## E. Menu móvel (v1.9.8 incluída nesta release)

- Abra o menu (☰) num ecrã pequeno: «Terminar Sessão» está **sempre visível**
  no rodapé do sheet, mesmo com o menu rolado.
