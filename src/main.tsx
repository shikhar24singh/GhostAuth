import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeAndroidShell } from './native/android';
import { Capacitor } from '@capacitor/core';
import { applyDarkMode, loadDarkMode } from './mobile/appearance';

initializeAndroidShell();
applyDarkMode(loadDarkMode(Capacitor.getPlatform() === 'android'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
