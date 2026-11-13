# Checklist — membro ou admin não consegue entrar

Guia rápido para o administrador da igreja. Não exige programação.

---

## Novo MEMBRO não entra

1. **Administração → Cadastros Pendentes** — qual é o estado do pedido?
2. Se estiver **pendente** → **Aprovar** (só depois o portal abre).
3. Se estiver **aprovado** → em **Membros**, existe ficha com o **mesmo email** da conta?
   - Se não: no filtro **Aprovados**, use **Recriar ficha de membro**.
4. Peça ao membro: **terminar sessão** → entrar de novo → se aparecer o ecrã de estado, tocar em **«verificar novamente»** / **«Entrar no portal»**.
5. No telemóvel: app actualizada (**APK ≥ 1.21.28** ou a mais recente com os fixes de email). Na web: **Ctrl+F5**.

**Lembrete:** registar-se **não** dá acesso imediato — falta a aprovação do administrador.

---

## Novo ADMIN não entra / não troca a senha

1. No Firestore (ou lista de administradores): existe **`admins/<email-em-minúsculas>`**?
2. Se **`mustChangePassword: true`**: no 1.º login use a **senha temporária** no campo **«Palavra-passe actual»**, depois defina a nova (8+ caracteres, diferente da temporária).
3. Se a conta Auth existe mas **não** há documento `admins/` → no painel, criar de novo o mesmo email (reparação automática) ou **Gerar nova palavra-passe temporária** depois de o documento existir.
4. Actualizar a app / **Ctrl+F5**. Partilhar a temporária **só uma vez** e pedir troca no primeiro acesso.

**Conta desactivada:** só o **super administrador** pode reactivar.

---

## Atalhos de ecrã

| Mensagem | Significado |
|----------|-------------|
| Cadastro aguarda aprovação | Pedido ainda **pendente** |
| Cadastro aprovado (sem portal) | Falta ficha ou cache — recriar ficha / voltar a entrar |
| Conta sem vínculo à igreja | Sem ficha de membro e sem perfil admin |
| Troca obrigatória | Admin/membro com senha temporária |
