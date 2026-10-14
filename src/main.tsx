import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { hydratePrefs } from './lib/prefs';

// Repor definicoes persistidas (storage nativo do Android) antes de montar a UI.
hydratePrefs().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
