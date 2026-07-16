import { timingSafeEqual } from 'node:crypto';

/**
 * Compara dois segredos em tempo constante.
 *
 * `a === b` em string vaza o tamanho do prefixo em comum pelo tempo de resposta, o que
 * permite recuperar um segredo byte a byte quando o atacante pode repetir a tentativa
 * (ex.: um endpoint público sem throttle). Use isto para QUALQUER comparação de
 * credencial/token/licença.
 *
 * O `timingSafeEqual` do Node exige buffers do mesmo tamanho — comparar os tamanhos antes
 * vaza só o comprimento, que não é segredo útil aqui.
 */
export function timingSafeTextEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
