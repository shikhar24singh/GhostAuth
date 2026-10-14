import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export const nativeAuthentication = Capacitor.getPlatform() === 'android';
export type AuthStatus = {
  pinSet: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  lockedForSeconds: number;
  sessionValid: boolean;
  sessionRemainingMillis: number;
};
export type AuthResult = AuthStatus & { verified: boolean; expiresInSeconds: number };
export type AuthChange = AuthStatus & { changed: boolean };
interface NativeAuth {
  getStatus(): Promise<AuthStatus>;
  lock(): Promise<void>;
  enrollPin(options: { pin: string }): Promise<AuthStatus>;
  verifyPin(options: { pin: string; packageName: string }): Promise<AuthResult>;
  launchApp(options: { packageName: string }): Promise<void>;
  changePin(options: { currentPin: string; newPin: string }): Promise<AuthChange>;
  enableBiometric(options: { pin: string }): Promise<AuthChange>;
  disableBiometric(options: { pin: string }): Promise<AuthChange>;
  verifyBiometric(options: { packageName: string }): Promise<AuthResult>;
  addListener(event: 'sessionEnded', listener: (event: { active?: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'biometricFailed', listener: () => void): Promise<PluginListenerHandle>;
}
export const AndroidAuth = registerPlugin<NativeAuth>('GhostAuth');
export function authError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    switch (error.code) {
      case 'BIOMETRIC_LOCKOUT': return 'Too many fingerprint attempts. Use your PIN or try fingerprint again later.';
      case 'BIOMETRIC_CANCELED': return 'Fingerprint verification was canceled. Try again or use your PIN.';
      case 'BIOMETRIC_UNAVAILABLE': return 'Fingerprint is unavailable. Enroll a strong biometric in Android Settings, then enable it here using your PIN.';
      case 'SESSION_ENDED': return 'Your verification ended. Please verify again.';
      case 'BUSY': return 'Complete the Android prompt first.';
      case 'APP_UNAVAILABLE': return 'This app could not be opened. It may have been removed or disabled. Refresh your app selection and verify again.';
    }
  }
  return 'Native authentication is unavailable. Restart GhostAuth and try again. Your saved PIN has been kept.';
}
