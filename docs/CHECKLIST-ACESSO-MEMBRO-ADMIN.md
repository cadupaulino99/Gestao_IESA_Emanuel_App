# Checklist — membro ou admin não consegue entrar

Guia rápido para o **administrador da igreja**. Não exige programação.

Índice operacional geral: [OPERACOES.md](./OPERACOES.md).

---

## Novo MEMBRO não entra

1. **Administração → Cadastros Pendentes** — qual é o estado do pedido?
2. Se estiver **pendente** → **Aprovar** (só depois o portal abre).
3. Se estiver **aprovado** → em **Membros**, existe ficha com o **mesmo email** da conta?
   - Se não: filtro **Aprovados** → **Recriar ficha de membro**.
4. Peça ao membro: **terminar sessão** → entrar de novo → se aparecer ecrã de estado, tocar em **«verificar novamente»** / **«Entrar no portal»**.
5. No telemóvel: instalar a **última APK** de [GitHub Releases](https://github.com/cadupaulino99/Gestao_IESA_Emanuel_App/releases) (versão ≥ a indicada em `package.json` em `main`). Na web: **Ctrl+F5**.

**Lembrete:** registar-se **não** dá acesso imediato — falta a **aprovação** do administrador.

---

## Novo ADMIN não entra / não troca a senha

1. Na lista de administradores (ou Firestore): existe **`admins/<email-em-minúsculas>`**?
2. Se **`mustChangePassword: true`**: no 1.º login use a **senha temporária** no campo **«Palavra-passe actual»**, depois a nova (8+ caracteres, **diferente** da temporária).
3. Se a conta Auth existe mas **não** há documento `admins/` → criar de novo o mesmo email no painel (reparação) ou, com o documento criado, **Gerar nova palavra-passe temporária**.
4. Actualizar a app / **Ctrl+F5**. Partilhar a temporária **uma vez** e pedir a troca no primeiro acesso.

**Conta desactivada:** só o **super administrador** pode reactivar.

---

## Atalhos de ecrã

| Mensagem na app | Significado | O que fazer |
|-----------------|-------------|-------------|
| Cadastro aguarda aprovação | Pedido **pendente** | Admin aprova em Cadastros Pendentes |
| Cadastro aprovado (sem portal) | Falta ficha ou cache | Recriar ficha; logout/login |
| Conta sem vínculo à igreja | Sem membro e sem admin | Secretaria associa email / registo |
| Troca obrigatória | Senha temporária | Preencher actual + nova + confirmar |

---

## Depois de resolver

- Confirme que o membro/admin **entra e navega** num ecrã principal.
- Se usou APK nova, anote a versão instalada (visível no login).
- Problemas repetidos com a mesma pessoa: verificar email **exactamente** igual na conta Auth e na ficha (minúsculas).
