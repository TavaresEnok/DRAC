import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricSupport = {
  available: boolean;
  label: string;
};

export async function getBiometricSupport(): Promise<BiometricSupport> {
  const [hardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const fingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  return {
    available: hardware && enrolled,
    label: fingerprint ? 'Impressão digital' : face ? 'Reconhecimento facial' : 'Biometria',
  };
}

export async function authenticateWithBiometrics(promptMessage = 'Confirme sua identidade para entrar') {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancelar',
    fallbackLabel: 'Usar senha',
    disableDeviceFallback: false,
  });
  return result.success;
}
