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
  verifyPin(options: { pin: string }): Promise<AuthResult>;
  changePin(options: { currentPin: string; newPin: string }): Promise<AuthChange>;
  enableBiometric(options: { pin: string }): Promise<AuthChange>;
  disableBiometric(options: { pin: string }): Promise<AuthChange>;
  verifyBiometric(): Promise<AuthResult>;
  addListener(event: 'sessionEnded', listener: (event: { active?: boolean }) => void): Promise<PluginListenerHandle>;
}
export const AndroidAuth = registerPlugin<NativeAuth>('GhostAuth');
export function authError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    switch (error.code) {
      case 'BIOMETRIC_CANCELED': return 'Fingerprint verification was canceled. Try again or use your PIN.';
      case 'BIOMETRIC_UNAVAILABLE': return 'Fingerprint is unavailable. Enroll a strong biometric in Android Settings, then enable it here using your PIN.';
      case 'SESSION_ENDED': return 'The app left the foreground. Please verify again.';
      case 'BUSY': return 'Complete the Android prompt first.';
    }
  }
  return 'Native authentication is unavailable. Restart GhostAuth and try again. Your saved PIN has been kept.';
}
