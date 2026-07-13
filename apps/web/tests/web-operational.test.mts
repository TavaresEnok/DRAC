import assert from 'node:assert/strict';
import test from 'node:test';
import { contrastRatio, localDayRange, relativeLuminance } from '../src/lib/web-operational.ts';

test('localDayRange representa o dia local inteiro e não o fuso do servidor', () => {
  const range = localDayRange('2026-07-08');
  const from = new Date(range.from);
  const to = new Date(range.to);

  assert.equal(from.getFullYear(), 2026);
  assert.equal(from.getMonth(), 6);
  assert.equal(from.getDate(), 8);
  assert.equal(from.getHours(), 0);
  assert.equal(from.getMinutes(), 0);
  assert.equal(to.getTime() + 1, new Date(2026, 6, 9, 0, 0, 0, 0).getTime());
});

test('contraste WCAG retorna valores conhecidos e rejeita cor inválida', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.ok(contrastRatio('#111827', '#ffffff') > 15);
  assert.ok(contrastRatio('#a6b0bf', '#ffffff') < 4.5);
  assert.equal(relativeLuminance('azul'), null);
  assert.equal(contrastRatio('azul', '#ffffff'), 0);
});
