/* v1.19.0 (P3) — testes do verificador estático das regras.
   Sem Java/emulador no CI, é isto que impede um `firestore.rules` partido de
   chegar ao deploy manual. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkRules, stripCommentsAndStrings, findMatchBlocks } from '../check-rules.mjs';

const ok = (src) => checkRules(src, 't.rules');
const MINIMO = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() { return request.auth != null; }
    match /members/{id} {
      allow read: if isAdmin();
      allow write: if false;
    }
  }
}
`;

describe('checkRules — ficheiro mínimo válido', () => {
  it('não dá erros nem avisos', () => {
    const { errors, warnings } = ok(MINIMO);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe('checkRules — erros que têm de ser apanhados', () => {
  it('chaveta/parêntesis por fechar', () => {
    const { errors } = ok(MINIMO.replace('allow write: if false;', 'allow write: if false;'));
    expect(errors).toEqual([]);
    const partida = MINIMO.replace(/}\s*}\s*}\s*$/, '} }');
    expect(ok(partida).errors.join(' ')).toMatch(/nunca fecha/);
    const paren = MINIMO.replace('if isAdmin();', 'if isAdmin(;', 1);
    expect(ok(paren).errors.length).toBeGreaterThan(0);
  });

  it('chamada a função inexistente (o erro que só aparecia no deploy)', () => {
    const { errors } = ok(MINIMO.replace('allow read: if isAdmin();', 'allow read: if isAdmn();'));
    expect(errors.join(' ')).toMatch(/isAdmn/);
    expect(errors.join(' ')).toMatch(/não está definida/);
  });

  it('get()/exists() são builtins das regras e não dão erro', () => {
    const src = MINIMO.replace('return request.auth != null;',
      'return exists(/databases/$(database)/documents/admins/$(request.auth.token.email)) && get(/databases/$(database)/documents/admins/x).data.role == "admin";');
    expect(ok(src).errors).toEqual([]);
  });

  it('blocos match DUPLICADOS para o mesmo caminho (o caso real de /settings)', () => {
    const dup = MINIMO.replace(
      '    match /members/{id} {',
      '    match /members/{docId} {\n      allow read: if false;\n    }\n    match /members/{id} {');
    const { errors } = ok(dup);
    expect(errors.join(' ')).toMatch(/DUPLICADO/);
  });

  it('wildcards com nomes diferentes contam como o mesmo caminho', () => {
    const { masked } = stripCommentsAndStrings(MINIMO);
    const blocks = findMatchBlocks(masked).map((b) => b.key);
    expect(blocks).toContain('/members/{}');
    expect(blocks).toContain('/databases/{}/documents');
  });

  it('match sem allow → aviso (colecção inacessível)', () => {
    const { warnings } = ok(MINIMO.replace('      allow read: if isAdmin();\n      allow write: if false;\n', ''));
    expect(warnings.join(' ')).toMatch(/nenhuma regra allow/);
  });

  it('função definida e nunca usada → aviso (o «isValidMemberCreate desligado»)', () => {
    const { warnings } = ok(MINIMO.replace('    function isAdmin()', '    function isValidThing(d) { return d.keys().size() < 3; }\n    function isAdmin()'));
    expect(warnings.join(' ')).toMatch(/isValidThing/);
    expect(warnings.join(' ')).toMatch(/NUNCA é usada/);
  });

  it('operação desconhecida em allow', () => {
    const { errors } = ok(MINIMO.replace('allow read: if', 'allow reada: if'));
    expect(errors.join(' ')).toMatch(/reada/);
  });

  it('cabeçalho em falta → avisos', () => {
    const semVersao = MINIMO.replace("rules_version = '2';\n", '');
    expect(ok(semVersao).warnings.join(' ')).toMatch(/rules_version/);
    const semService = MINIMO.replace('service cloud.firestore {', 'service outra.coisa {');
    expect(ok(semService).warnings.join(' ')).toMatch(/service/);
  });

  it('strings e comentários não confundem a análise', () => {
    const src = MINIMO.replace('    match /members/{id} {',
      '    // allow read: if nada(); { } ) (\n    /* match /fake/{x} { allow read: if falso(); } */\n    match /members/{id} {');
    const { errors, warnings } = ok(src);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe('checkRules — os ficheiros reais do projecto', () => {
  for (const f of ['firestore.rules', 'storage.rules']) {
    it(`${f} passa sem erros nem avisos`, () => {
      const src = readFileSync(resolve(process.cwd(), f), 'utf8');
      const { errors, warnings } = checkRules(src, f);
      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
    });
  }

  it('firestore.rules já não tem o bloco /settings duplicado', () => {
    const src = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const { masked } = stripCommentsAndStrings(src);
    const settings = findMatchBlocks(masked).filter((b) => b.key === '/settings/{}');
    expect(settings).toHaveLength(1);
  });

  it('os validadores novos do P3 estão LIGADOS a um allow (não podem ficar decorativos)', () => {
    const src = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    for (const fn of ['isValidNotificationDoc', 'isValidOutboxDoc', 'isValidWhatsAppOutboxDoc',
      'isValidAuditDoc', 'isValidUpdateRequestDoc', 'ownsMemberRecord', 'isStr',
      'isValidMemberCreate', 'isValidMemberUpdate']) {
      const uses = (src.match(new RegExp(`${fn}\\(`, 'g')) || []).length;
      expect(uses, `${fn} deve aparecer na definição e num allow`).toBeGreaterThanOrEqual(2);
    }
  });
});
