import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { handleAndroidBack } from './back';

export function initializeAndroidShell() {
  if (Capacitor.getPlatform() !== 'android') return;
  document.documentElement.dataset.nativeAndroid = 'true';
  void App.addListener('backButton', ({ canGoBack }) => {
    handleAndroidBack(canGoBack, {
      dismissDialog: () => {
        const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
        if (!dialog) return false;
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        return true;
      },
      goBack: () => window.history.back(),
      exit: () => { void App.exitApp().catch(error => console.warn('Could not close GhostAuth', error)); },
    });
  }).catch(error => console.warn('Android Back handler unavailable', error));
}
