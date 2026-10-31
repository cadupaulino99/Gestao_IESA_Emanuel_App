/* ═══════════════════════════════════════════════════════════════════════════
   v1.19.0 (P3) — TESTES DO WORKER (Cloudflare)
   ───────────────────────────────────────────────────────────────────────────
   O Worker é o ficheiro mais crítico do sistema: valida o auto-cadastro,
   verifica o token do Firebase, aplica rate limits, cria contas Auth, trata da
   fila SMS/WhatsApp, dos lembretes e dos estados das contribuições. Tinha
   1500 linhas e ZERO testes (o CI só fazia `node --check`).

   Aqui testam-se as funções PURAS através da superfície `__test` exportada no
   fim de worker/ai-worker.js — sem rede, sem segredos, sem Cloudflare.
   Correm em `node` (o ambiente por omissão do vitest.config.ts).
   ═══════════════════════════════════════════════════════════════════════════ */
import { describe, expect, it, beforeEach } from 'vitest';
import { __test as W } from '../ai-worker.js';

/* Implementações do lado da app, para provar que Worker e UI não divergem. */
import { formatKz } from '../../src/lib/money.ts';
import { luandaParts, luandaDayKey, luandaEndOfDay } from '../../src/lib/luanda.ts';

const at = (y, m, d, hh = 0, mm = 0) => Date.UTC(y, m - 1, d, hh, mm);

/* Token JWT falso (assinatura irrelevante: as recusas testadas acontecem ANTES
   de o Worker procurar a chave pública). */
const b64u = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeToken = (header, claims, sig = 'sig') => `${b64u(header)}.${b64u(claims)}.${sig}`;
const PROJECT = 'iesa-emanuel-xangongo';
const goodClaims = (over = {}) => ({
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: 'uid-123',
  email: 'admin@iesa.ao',
  iat: Math.floor(Date.now() / 1000) - 10,
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...over,
});
const RS256 = { alg: 'RS256', kid: 'k1', typ: 'JWT' };

describe('Worker — versão e configuração', () => {
  it('a versão publicada no repositório é a 2.10.0 (P3)', () => {
    expect(W.WORKER_VERSION).toBe('2.10.0');
  });
  it('os canais externos continuam em modo manual (sem contas pagas)', () => {
    expect(W.PROVIDERS).toMatchObject({ sms: 'manual', whatsapp: 'manual', system: 'internal' });
  });
});

describe('Worker — validateSignup (auto-cadastro: o servidor é a autoridade)', () => {
  const base = {
    name: 'Maria Domingos', email: 'Maria.Domingos@Exemplo.AO', password: 'SenhaForte1',
    phone: '923 000 000', documentNumber: '004516745LA041', birthDate: '1990-10-25',
  };
  it('aceita um pedido válido e NORMALIZA (email minúsculo, telefone +244, BI maiúsculo)', () => {
    const r = W.validateSignup(base);
    expect(r.ok).toBe(true);
    expect(r.clean.email).toBe('maria.domingos@exemplo.ao');
    expect(r.clean.phone).toBe('+244923000000');
    expect(r.clean.documentNumber).toBe('004516745LA041');
    expect(r.clean.birthDate).toBe('1990-10-25');
  });
  it('NUNCA devolve a palavra-passe no `clean`... excepto para o Auth (o Firestore não a recebe)', () => {
    /* O documento gravado em member_signups é construído com a password fora
       (`const { password: _pw, ...docFields } = s`) — confirmado na rota. */
    const r = W.validateSignup(base);
    expect(typeof r.clean.password).toBe('string');
    expect(r.clean.password).toBe('SenhaForte1');
  });
  it('recusa nome curto/longo e caracteres de marcação', () => {
    expect(W.validateSignup({ ...base, name: 'A' }).ok).toBe(false);
    expect(W.validateSignup({ ...base, name: 'x'.repeat(141) }).ok).toBe(false);
    expect(W.validateSignup({ ...base, name: '<script>Maria</script>' }).error).toMatch(/não permitidos/i);
  });
  it('recusa email inválido e palavra-passe fraca', () => {
    expect(W.validateSignup({ ...base, email: 'maria@' }).ok).toBe(false);
    expect(W.validateSignup({ ...base, email: 'sem-at' }).ok).toBe(false);
    expect(W.validateSignup({ ...base, password: '1234567' }).ok).toBe(false);
    expect(W.validateSignup({ ...base, password: 'x'.repeat(201) }).ok).toBe(false);
  });
  it('normaliza o telefone angolano (com/sem indicativo) e recusa o que não é 9XXXXXXXX', () => {
    expect(W.validateSignup({ ...base, phone: '+244 923 000 000' }).clean.phone).toBe('+244923000000');
    expect(W.validateSignup({ ...base, phone: '244923000000' }).clean.phone).toBe('+244923000000');
    expect(W.validateSignup({ ...base, phone: '923000000' }).clean.phone).toBe('+244923000000');
    expect(W.validateSignup({ ...base, phone: '222000000' }).ok).toBe(false); // fixo, não móvel
    expect(W.validateSignup({ ...base, phone: '92300000' }).ok).toBe(false);  // 8 dígitos
  });
  it('recusa e normaliza o B.I. (9 dígitos + 2 letras + 3 dígitos)', () => {
    expect(W.validateSignup({ ...base, documentNumber: '004516745la041' }).clean.documentNumber).toBe('004516745LA041');
    expect(W.validateSignup({ ...base, documentNumber: '12345' }).ok).toBe(false);
    expect(W.validateSignup({ ...base, documentNumber: '004516745LX0412' }).ok).toBe(false);
  });
  it('recusa datas fora de AAAA-MM-DD', () => {
    expect(W.validateSignup({ ...base, birthDate: '25/10/1990' }).ok).toBe(false);
    expect(W.validateSignup({ ...base, baptismDate: '' }).ok).toBe(true); // vazio = opcional
  });
  it('P3 — recusa datas IMPOSSÍVEIS (o regex antigo deixava passar 1990-13-45)', () => {
    expect(W.validateSignup({ ...base, baptismDate: '1990-13-45' }).ok).toBe(false);
    expect(W.validateSignup({ ...base, birthDate: '1990-02-30' }).ok).toBe(false);
    expect(W.validateSignup({ ...base, birthDate: '0001-01-01' }).ok).toBe(false);
    expect(W.isRealIsoDate('1990-13-45')).toBe(false);
    expect(W.isRealIsoDate('1990-02-30')).toBe(false);
    expect(W.isRealIsoDate('1990-10-25')).toBe(true);
    expect(W.isRealIsoDate('24/10/1990')).toBe(false);
    expect(W.isRealIsoDate('')).toBe(false);
    expect(W.isRealIsoDate(null)).toBe(false);
  });
  it('P3 — anos bissextos (29/02 só quando existe)', () => {
    expect(W.isLeapYear(2024)).toBe(true);
    expect(W.isLeapYear(2026)).toBe(false);
    expect(W.isLeapYear(2000)).toBe(true);   // divisível por 400
    expect(W.isLeapYear(1900)).toBe(false);  // divisível por 100, não por 400
    expect(W.isRealIsoDate('2024-02-29')).toBe(true);
    expect(W.isRealIsoDate('2026-02-29')).toBe(false);
    expect(W.isRealIsoDate('2026-04-31')).toBe(false); // Abril tem 30 dias
    expect(W.isRealIsoDate('2026-12-31')).toBe(true);
  });
  it('limita a fotografia (tamanho e caracteres base64)', () => {
    expect(W.validateSignup({ ...base, photoBase64: 'x'.repeat(900001) }).ok).toBe(false);
    expect(W.validateSignup({ ...base, photoBase64: 'não-é-base64!!' }).ok).toBe(false);
    expect(W.validateSignup({ ...base, photoBase64: ' AAAA+BB/CC== ' }).clean.photoBase64).toBe('AAAA+BB/CC==');
  });
  it('é uma ALLOWLIST: campos desconhecidos não entram no documento', () => {
    const r = W.validateSignup({ ...base, role: 'admin', isSuper: true, statusSignup: 'aprovado', status: 'Activo' });
    expect(r.ok).toBe(true);
    expect(r.clean.role).toBeUndefined();
    expect(r.clean.isSuper).toBeUndefined();
    expect(r.clean.statusSignup).toBeUndefined();
    expect(r.clean.status).toBeUndefined();
  });
  it('recusa campos opcionais com tipo errado ou demasiado longos', () => {
    expect(W.validateSignup({ ...base, address: 123 }).error).toMatch(/Campo inválido/);
    expect(W.validateSignup({ ...base, address: 'a'.repeat(201) }).error).toMatch(/demasiado longo/);
    expect(W.validateSignup({ ...base, fatherName: '<b>Pai</b>' }).error).toMatch(/não permitidos/i);
  });
  it('acceptsMessages só é false quando vem explicitamente false', () => {
    expect(W.validateSignup({ ...base, acceptsMessages: false }).clean.acceptsMessages).toBe(false);
    expect(W.validateSignup({ ...base, acceptsMessages: true }).clean.acceptsMessages).toBe(true);
    expect(W.validateSignup({ ...base, acceptsMessages: 'não' }).clean.acceptsMessages).toBe(true);
  });
  it('recusa pedidos sem corpo', () => {
    expect(W.validateSignup(null).ok).toBe(false);
    expect(W.validateSignup('texto').ok).toBe(false);
    expect(W.validateSignup({}).ok).toBe(false);
  });
});

describe('Worker — validateTempPassword (política das contas da liderança)', () => {
  it('aceita uma temporária razoável', () => {
    expect(W.validateTempPassword('Iesa2026x').ok).toBe(true);
    expect(W.validateTempPassword('SenhaForte1').value).toBe('SenhaForte1');
  });
  it('recusa curta, longa, com espaços, óbvia ou sem letras/números', () => {
    expect(W.validateTempPassword('12a').ok).toBe(false);
    expect(W.validateTempPassword('a'.repeat(201)).ok).toBe(false);
    expect(W.validateTempPassword('Iesa 2026x').error).toMatch(/espaços/i);
    expect(W.validateTempPassword('password').ok).toBe(false);
    expect(W.validateTempPassword('IESAMANUEL').ok).toBe(false); // sem números + óbvia
    expect(W.validateTempPassword('12345678').ok).toBe(false);
    expect(W.validateTempPassword('soletissonumeros1').ok).toBe(true);
    expect(W.validateTempPassword('123456789').ok).toBe(false); // só números
    expect(W.validateTempPassword(null).ok).toBe(false);
    expect(W.validateTempPassword(12345678).ok).toBe(false);
  });
  it('as palavras-passe GERADAS cumprem a própria política', () => {
    for (let i = 0; i < 25; i++) {
      const pwd = W.genTempPassword();
      expect(pwd).toHaveLength(12);
      expect(W.validateTempPassword(pwd).ok).toBe(true); // letras + números, sempre
      expect(pwd).toMatch(/[0-9]/);
      expect(pwd).toMatch(/[A-Za-z]/);
      expect(pwd).toMatch(new RegExp(`^[${W.TEMP_PASS_ALPHABET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+$`));
    }
  });
  it('as geradas não usam caracteres ambíguos (0/O/1/l) nem se repetem', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const pwd = W.genTempPassword();
      expect(pwd).not.toMatch(/[0O1l]/);
      seen.add(pwd);
    }
    expect(seen.size).toBeGreaterThan(195);
  });
});

describe('Worker — rate limits (auto-cadastro 5/10 min por IP; IA 60/10 min por email)', () => {
  beforeEach(() => W.resetBuckets());
  it('deixa passar os primeiros 5 cadastros do mesmo IP e bloqueia o 6.º', () => {
    for (let i = 0; i < W.SIGNUP_RATE_LIMIT; i++) expect(W.signupRateOk('1.2.3.4')).toBe(true);
    expect(W.signupRateOk('1.2.3.4')).toBe(false);
    expect(W.signupRateOk('1.2.3.4')).toBe(false);
  });
  it('IPs diferentes têm baldes diferentes', () => {
    for (let i = 0; i < W.SIGNUP_RATE_LIMIT; i++) W.signupRateOk('5.5.5.5');
    expect(W.signupRateOk('5.5.5.5')).toBe(false);
    expect(W.signupRateOk('6.6.6.6')).toBe(true);
  });
  it('a IA tem um tecto muito mais alto (60/10 min)', () => {
    expect(W.RATE_LIMIT).toBe(60);
    for (let i = 0; i < W.RATE_LIMIT; i++) expect(W.rateOk('a@b.ao')).toBe(true);
    expect(W.rateOk('a@b.ao')).toBe(false);
  });
  it('pruneBuckets limpa entradas antigas quando passa do tecto', () => {
    const map = new Map();
    const now = Date.now();
    for (let i = 0; i < W.BUCKET_MAX + 10; i++) map.set('ip' + i, { start: now, count: 1 });
    // metade já expirou
    for (let i = 0; i < W.BUCKET_MAX / 2; i++) map.set('ip' + i, { start: now - W.RATE_WINDOW - 1, count: 1 });
    const removed = W.pruneBuckets(map, now);
    expect(removed).toBeGreaterThanOrEqual(W.BUCKET_MAX / 2);
    expect(map.size).toBeLessThanOrEqual(W.BUCKET_MAX);
  });
  it('pruneBuckets não faz nada abaixo do tecto (custo zero no caminho quente)', () => {
    const map = new Map([['a', { start: Date.now() - 999999999, count: 9 }]]);
    expect(W.pruneBuckets(map, Date.now())).toBe(0);
    expect(map.size).toBe(1);
  });
});

describe('Worker — verifyFirebaseIdToken (recusas ANTES de procurar a chave)', () => {
  const expectReject = async (token, msg) => {
    await expect(W.verifyFirebaseIdToken(token, PROJECT)).rejects.toThrow(msg);
  };
  it('recusa tokens malformados', async () => {
    await expectReject('', /malformado/);
    await expectReject('abc', /malformado/);
    await expectReject('a.b.c.d', /malformado/);
    await expectReject('não-é-base64.nem-json.ass', /malformado/);
    await expectReject(fakeToken(RS256, goodClaims()) + 'x'.repeat(5000), /malformado/);
  });
  it('recusa alg diferente de RS256 (incl. «none» e HS256)', async () => {
    await expectReject(fakeToken({ alg: 'none' }, goodClaims()), /algoritmo/);
    await expectReject(fakeToken({ alg: 'HS256', kid: 'k1' }, goodClaims()), /algoritmo/);
    await expectReject(fakeToken({}, goodClaims()), /algoritmo/);
  });
  it('exige exp — um token sem expiração já não passa', async () => {
    const { exp, ...semExp } = goodClaims();
    void exp;
    await expectReject(fakeToken(RS256, semExp), /expirado/);
    await expectReject(fakeToken(RS256, goodClaims({ exp: 'amanhã' })), /expirado/);
  });
  it('recusa token expirado', async () => {
    await expectReject(fakeToken(RS256, goodClaims({ exp: Math.floor(Date.now() / 1000) - 5 })), /expirado/);
  });
  it('recusa iat no futuro (relógio adulterado)', async () => {
    await expectReject(fakeToken(RS256, goodClaims({ iat: Math.floor(Date.now() / 1000) + 600 })), /futura/);
  });
  it('recusa token sem sujeito (sub)', async () => {
    await expectReject(fakeToken(RS256, goodClaims({ sub: '' })), /sujeito/);
    const { sub, ...semSub } = goodClaims();
    void sub;
    await expectReject(fakeToken(RS256, semSub), /sujeito/);
  });
  it('recusa emissor/audiência de OUTRO projecto Firebase', async () => {
    await expectReject(fakeToken(RS256, goodClaims({ iss: 'https://securetoken.google.com/outro-projecto' })), /emissor/);
    await expectReject(fakeToken(RS256, goodClaims({ aud: 'outro-projecto' })), /audiencia/);
  });
});

describe('Worker — Luanda (o cron decide «hoje» e «que horas são» em UTC+1)', () => {
  it('23:30 UTC de 25/10 já é 00:30 de 26/10 em Luanda', () => {
    const L = W.luandaNow(at(2026, 10, 25, 23, 30));
    expect(L.dayKey).toBe('2026-10-26');
    expect(L.hour).toBe(0);
    expect(L.minute).toBe(30);
  });
  it('dow: 1=segunda … 7=domingo', () => {
    expect(W.luandaNow(at(2026, 10, 26, 12)).dow).toBe(1); // segunda
    expect(W.luandaNow(at(2026, 11, 1, 12)).dow).toBe(7);  // domingo
  });
  it('coincide com lib/luanda.ts da app (mesma fonte de verdade)', () => {
    for (const ms of [at(2026, 1, 1, 0, 0), at(2026, 6, 15, 22, 59), at(2026, 12, 31, 23, 30)]) {
      expect(W.luandaNow(ms).dayKey).toBe(luandaDayKey(ms));
      expect(W.luandaNow(ms).hour).toBe(luandaParts(ms).hour);
      expect(W.luandaNow(ms).dow).toBe(luandaParts(ms).dow);
    }
  });
  it('luandaEndOfDayMs = fim do dia de Luanda (22:59:59.999 UTC)', () => {
    expect(new Date(W.luandaEndOfDayMs('2026-10-31')).toISOString()).toBe('2026-10-31T22:59:59.999Z');
    expect(W.luandaEndOfDayMs('2026-10-31')).toBe(luandaEndOfDay('2026-10-31'));
    // o código antigo usava 23:59:59Z — uma hora a mais, já no dia seguinte
    expect(W.luandaEndOfDayMs('2026-10-31')).toBeLessThan(Date.parse('2026-10-31T23:59:59Z'));
  });
  it('luandaEndOfDayMs devolve NaN para datas inválidas (o prazo fica «em curso»)', () => {
    expect(Number.isNaN(W.luandaEndOfDayMs(''))).toBe(true);
    expect(Number.isNaN(W.luandaEndOfDayMs('31/10/2026'))).toBe(true);
    expect(Number.isNaN(W.luandaEndOfDayMs(null))).toBe(true);
    expect(Number.isNaN(W.luandaEndOfDayMs('2026-1-1'))).toBe(true);
  });
});

describe('Worker — moeda (espelha src/lib/money.ts)', () => {
  it('formata cêntimos como «1.500,00 Kz»', () => {
    expect(W.fmtKz(150000)).toBe('1.500,00 Kz');
    expect(W.fmtKz(0)).toBe('0,00 Kz');
    expect(W.fmtKz(99)).toBe('0,99 Kz');
    expect(W.fmtKz(-25050)).toBe('-250,50 Kz');
    expect(W.fmtKz(1234567890)).toBe('12.345.678,90 Kz');
  });
  it('não diverge da apresentação da app', () => {
    const casos = [0, 1, 99, 100, 150000, 999999, 1000000, 1234567890, -50, -150000];
    for (const c of casos) expect(W.fmtKz(c)).toBe(formatKz(c));
  });
  it('tolera lixo (null/undefined/texto) sem rebentar', () => {
    expect(W.fmtKz(null)).toBe('0,00 Kz');
    expect(W.fmtKz(undefined)).toBe('0,00 Kz');
    expect(W.fmtKz('abc')).toBe('0,00 Kz');
    expect(W.fmtKz('1500')).toBe('15,00 Kz');
  });
});

describe('Worker — helpers do Firestore REST (valores, filtros)', () => {
  it('fv lê string/integer/boolean/double e devolve null quando falta', () => {
    expect(W.fv({ a: { stringValue: 'x' } }, 'a')).toBe('x');
    expect(W.fv({ a: { integerValue: '1500' } }, 'a')).toBe('1500');
    expect(W.fv({ a: { booleanValue: false } }, 'a')).toBe(false);
    expect(W.fv({ a: { doubleValue: 1.5 } }, 'a')).toBe(1.5);
    expect(W.fv({}, 'a')).toBe(null);
    expect(W.fv({ a: { nullValue: null } }, 'a')).toBe(null);
  });
  it('fnum/fvInt convertem para número (o integerValue chega como TEXTO)', () => {
    /* É exactamente aqui que estava o bug do paidAmount: comparar "1500" (texto)
       com 1500 (número) dava sempre «diferente» → escrita todos os minutos. */
    expect(W.fnum({ amount: { integerValue: '1500' } }, 'amount')).toBe(1500);
    expect(W.fnum({ amount: { doubleValue: 1500.5 } }, 'amount')).toBe(1500.5);
    expect(W.fnum({}, 'amount')).toBe(0);
    expect(W.fvInt({ integerValue: '42' })).toBe(42);
    expect(W.fvStr({ stringValue: 'ola' })).toBe('ola');
    expect(W.fvStr(undefined)).toBe('');
    expect('1500' !== 1500).toBe(true); // o bug antigo, documentado
  });
  it('eq/le constroem filtros REST correctos', () => {
    expect(W.eq('status', 'pending')).toEqual({
      fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } },
    });
    expect(W.eq('n', 5)).toEqual({
      fieldFilter: { field: { fieldPath: 'n' }, op: 'EQUAL', value: { integerValue: '5' } },
    });
    expect(W.eq('ok', true)).toEqual({
      fieldFilter: { field: { fieldPath: 'ok' }, op: 'EQUAL', value: { booleanValue: true } },
    });
    expect(W.le('cancelUntil', 123)).toEqual({
      fieldFilter: { field: { fieldPath: 'cancelUntil' }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: '123' } },
    });
  });
  it('b64urlDecode descodifica base64url sem padding', () => {
    expect(W.b64urlDecode('eyJhIjoxfQ')).toBe('{"a":1}');
  });
  it('isRetryable: 400/404 também significam «tenta o modelo seguinte» (fallback Gemini)', () => {
    /* Nota: aqui «retryable» NÃO é «repetir o mesmo pedido» — é «este modelo
       falhou ou já não existe, experimenta o próximo da lista». */
    expect(W.isRetryable({ status: 429 })).toBe(true);
    expect(W.isRetryable({ status: 503 })).toBe(true);
    expect(W.isRetryable({ status: 400 })).toBe(true);
    expect(W.isRetryable({ status: 404 })).toBe(true);
    expect(W.isRetryable({ status: 403 })).toBe(false);
    expect(W.isRetryable({ retryable: true })).toBe(true);
    expect(W.isRetryable(null)).toBe(false);
  });
});

describe('Worker — cron resiliente (P3)', () => {
  it('runJob devolve o resultado e o tempo quando corre bem', async () => {
    const r = await W.runJob('outbox', async () => 7);
    expect(r).toMatchObject({ name: 'outbox', ok: true, n: 7, error: null });
    expect(typeof r.ms).toBe('number');
  });
  it('runJob captura o erro em vez de rebentar com o cron inteiro', async () => {
    const r = await W.runJob('contributions', async () => { throw new Error('runQuery contributions: 400'); });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('runQuery contributions: 400');
    expect(r.n).toBe(0);
  });
  it('runJob não deixa fugir promessas: o erro vira texto curto', async () => {
    const r = await W.runJob('x', async () => { throw 'boom'; });
    expect(r.error).toBe('boom');
    const r2 = await W.runJob('y', async () => { throw new Error('e'.repeat(500)); });
    expect(r2.error.length).toBeLessThanOrEqual(200);
  });
  it('heartbeat: grava na primeira vez, respeita o throttle de 10 min e volta a gravar depois', () => {
    const now = at(2026, 10, 31, 12, 0);
    expect(W.heartbeatThrottled(0, now)).toBe(true);          // nunca gravou
    expect(W.heartbeatThrottled(null, now)).toBe(true);
    expect(W.heartbeatThrottled(now - 60000, now)).toBe(false); // há 1 min
    expect(W.heartbeatThrottled(now - 11 * 60000, now)).toBe(true); // há 11 min
  });
  it('o recálculo de contribuições só corre 1 minuto em cada 5 (poupa quota)', () => {
    const bloco = at(2026, 10, 31, 12, 0); // minuto divisível por 5
    expect(W.isRecomputeMinute(bloco)).toBe(true);
    expect(W.isRecomputeMinute(bloco + 60000)).toBe(false);
    expect(W.isRecomputeMinute(bloco + 4 * 60000)).toBe(false);
    expect(W.isRecomputeMinute(bloco + 5 * 60000)).toBe(true);
    let corridas = 0;
    for (let m = 0; m < 60; m++) if (W.isRecomputeMinute(bloco + m * 60000)) corridas++;
    expect(corridas).toBe(12); // 60 min / 5
  });
});
