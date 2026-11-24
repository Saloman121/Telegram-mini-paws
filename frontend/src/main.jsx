import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import WebApp from '@twa-dev/sdk';
import App from './App.jsx';
import './style.css';

WebApp.ready();

try {
  WebApp.expand();
  WebApp.setHeaderColor('#000000');
  WebApp.setBackgroundColor('#000000');
} catch (error) {
  console.log('Telegram SDK:', error);
}

const manifestUrl =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ||
  `${window.location.origin}/tonconnect-manifest.json`;

// Crash भए कालो screen को सट्टा error देखाउने
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: '#ff6b6b', padding: 16, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {'App error:\n' + String(this.state.error?.stack || this.state.error).slice(0, 700)}
        </div>
      );
    }
    return this.props.children;
  }
}

function showFatal(msg) {
  const root = document.getElementById('root');
  if (root && !root.childElementCount) {
    root.innerHTML = '<pre style="color:#ff6b6b;padding:16px;font-size:13px;white-space:pre-wrap;word-break:break-word"></pre>';
    root.firstChild.textContent = 'Error:\n' + String(msg).slice(0, 700);
  }
}
window.addEventListener('error', (e) => showFatal(e.message));
window.addEventListener('unhandledrejection', (e) => showFatal(e.reason?.stack || e.reason));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TonConnectUIProvider manifestUrl={manifestUrl}>
        <App />
      </TonConnectUIProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
