/**
 * Flag do redesign — decidida em tempo de BUILD, não em runtime.
 *
 * Existe para gerar um segundo APK (mesmo código, mesmas câmeras, mesma lógica) mudando
 * SÓ o design, e assim comparar os dois lado a lado de forma honesta. Com a flag
 * desligada — o padrão — nada muda: o app atual segue idêntico.
 *
 * Liga com `REDESIGN=1` no build (app.config.js repassa via expo.extra.redesign).
 */
import Constants from 'expo-constants';

export const isRedesign: boolean =
  (Constants.expoConfig?.extra as { redesign?: boolean } | undefined)?.redesign === true;
