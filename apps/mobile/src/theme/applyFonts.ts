/**
 * Aplica a tipografia do redesign no app INTEIRO, de um lugar só.
 *
 * Como funciona (e por que assim):
 * - O plugin do expo-font registra FAMÍLIAS NATIVAS com pesos no Android (res/font/*.xml).
 *   Com isso, `fontFamily: 'Sora'` + `fontWeight: '800'` seleciona o arquivo certo — que é
 *   o comportamento que o RN NÃO dá quando cada peso é registrado como família separada.
 * - Falta então só injetar o `fontFamily`; os `fontWeight` que as telas já usam continuam
 *   valendo. Fazemos isso interceptando o `StyleSheet.create`, que é onde praticamente
 *   toda a tipografia do app é declarada.
 *
 * Por que não editar tela a tela: seriam centenas de estilos, e qualquer um esquecido
 * ficaria com a fonte do sistema no meio do redesign.
 *
 * Por que não interceptar o <Text>: no RN 0.81 o Text é criado com a sintaxe nova
 * (`component(...)`) e não expõe mais `.render`; e `defaultProps` foi removido no React 19.
 *
 * IMPORTANTE: este módulo precisa ser importado ANTES das telas — o StyleSheet.create
 * delas roda no momento do import. O App.tsx o importa primeiro, de propósito.
 *
 * Com a flag do redesign desligada, nada aqui é aplicado.
 */
import { StyleSheet, type TextStyle } from 'react-native';
import { isRedesign } from './redesign';

/** Acima deste tamanho, um texto pesado é título (Sora). Reproduz o uso do handoff. */
const TITLE_MIN_SIZE = 18;
const TITLE_MIN_WEIGHT = 700;

/** Famílias registradas nativamente pelo plugin (ver app.config.js). */
const FAMILY_TITLE = 'Sora';
const FAMILY_UI = 'InstrumentSans';

function withFamily(style: TextStyle): TextStyle {
  // Já tem família explícita → respeita (ex.: um mono intencional).
  if (style.fontFamily) return style;

  const hasType = style.fontSize != null || style.fontWeight != null;
  if (!hasType) return style;

  const w = style.fontWeight;
  const weight = w === 'bold' ? 700 : w === 'normal' || w == null ? 400 : Number(w) || 400;
  const size = typeof style.fontSize === 'number' ? style.fontSize : 14;

  const isTitle = weight >= TITLE_MIN_WEIGHT && size >= TITLE_MIN_SIZE;
  return { ...style, fontFamily: isTitle ? FAMILY_TITLE : FAMILY_UI };
}

/** Chamar UMA vez, antes de qualquer tela ser importada. */
export function applyRedesignFonts() {
  if (!isRedesign) return;

  const target = StyleSheet as unknown as {
    create: (styles: Record<string, unknown>) => unknown;
    __dracFontsPatched?: boolean;
  };
  if (target.__dracFontsPatched) return;

  const original = target.create.bind(StyleSheet);
  target.create = (styles: Record<string, unknown>) => {
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(styles)) {
      const value = styles[key];
      next[key] =
        value && typeof value === 'object' && !Array.isArray(value)
          ? withFamily(value as TextStyle)
          : value;
    }
    return original(next);
  };
  target.__dracFontsPatched = true;
}

// Efeito no import: garante que o patch esteja ativo antes de qualquer StyleSheet.create
// das telas rodar (o App.tsx importa este módulo primeiro).
applyRedesignFonts();
