const assert = require('node:assert/strict');
const test = require('node:test');

const {
  hashPassword,
  isStrongPassword,
  normalizeDb,
  parseDbText,
  runSerialized,
  verifyPassword,
} = require('../src/server');

test('senha forte e hash PBKDF2 são validados sem armazenar texto claro', () => {
  assert.equal(isStrongPassword('SenhaCom12A3'), true);
  assert.equal(isStrongPassword('senhafraca'), false);
  const encoded = hashPassword('SenhaCom12A3');
  assert.match(encoded, /^pbkdf2_sha256\$600000\$/);
  assert.equal(encoded.includes('SenhaCom12A3'), false);
  assert.equal(verifyPassword('SenhaCom12A3', encoded), true);
  assert.equal(verifyPassword('SenhaErrada12', encoded), false);
});

test('banco JSON inválido é rejeitado e estrutura válida é normalizada', () => {
  assert.equal(parseDbText(''), null);
  assert.throws(() => parseDbText('{inválido'));
  const db = normalizeDb(parseDbText('{"installations":{}}'));
  assert.deepEqual(db.installations, {});
  assert.deepEqual(db.sessions, {});
  assert.deepEqual(db.users, {});
});

test('operações de banco concorrentes são executadas em ordem', async () => {
  const order = [];
  await Promise.all([
    runSerialized(async () => {
      order.push('primeiro-início');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('primeiro-fim');
    }),
    runSerialized(async () => {
      order.push('segundo');
    }),
  ]);
  assert.deepEqual(order, ['primeiro-início', 'primeiro-fim', 'segundo']);
});
