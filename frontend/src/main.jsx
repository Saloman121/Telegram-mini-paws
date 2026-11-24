import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import WebApp from '@twa-dev/sdk';
import App from './App.jsx';
import './style.css';

WebApp.ready();
WebApp.expand();
try { WebApp.setHeaderColor('#000000'); WebApp.setBackgroundColor('#000000'); } catch { /* older clients */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <TonConnectUIProvider manifestUrl={import.meta.env.VITE_TONCONNECT_MANIFEST_URL}>
    <App />
  </TonConnectUIProvider>
);
