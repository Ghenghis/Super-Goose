import { StrictMode, Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from './components/ConfigContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import SuspenseLoader from './suspense-loader';
import { client } from './api/client.gen';
import { setTelemetryEnabled } from './utils/analytics';
import { readConfig } from './api';

// Global error handler for uncaught errors that would cause a blank screen
window.addEventListener('error', (event) => {
  console.error('[Renderer] Uncaught error:', event.error || event.message);
  const root = document.getElementById('root');
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `<div style="padding:2rem;color:red;font-family:monospace;">
      <h2>Uncaught Error</h2>
      <pre>${event.error?.stack || event.message || 'Unknown error'}</pre>
    </div>`;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Renderer] Unhandled promise rejection:', event.reason);
});

const App = lazy(() => import('./App'));

const TELEMETRY_CONFIG_KEY = 'GOOSE_TELEMETRY_ENABLED';

(async () => {
  try {
    // Check if we're in the launcher view (doesn't need goosed connection)
    const isLauncher = window.location.hash === '#/launcher';

    if (!isLauncher) {
      console.debug('window created, getting goosed connection info');
      const gooseApiHost = await window.electron.getGoosedHostPort();
      if (gooseApiHost === null) {
        window.alert('failed to start goose backend process');
        return;
      }
      console.debug('connecting at', gooseApiHost);
      client.setConfig({
        baseUrl: gooseApiHost,
        headers: {
          'Content-Type': 'application/json',
          'X-Secret-Key': await window.electron.getSecretKey(),
        },
      });

      try {
        const telemetryResponse = await readConfig({
          body: { key: TELEMETRY_CONFIG_KEY, is_secret: false },
        });
        const isTelemetryEnabled = telemetryResponse.data !== false;
        setTelemetryEnabled(isTelemetryEnabled);
      } catch (error) {
        console.warn('[Analytics] Failed to initialize analytics:', error);
      }
    }

    ReactDOM.createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Suspense fallback={<SuspenseLoader />}>
          <ConfigProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ConfigProvider>
        </Suspense>
      </StrictMode>
    );
  } catch (error) {
    console.error('[Renderer] Fatal error during initialization:', error);
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `<div style="padding:2rem;color:red;font-family:monospace;">
        <h2>Renderer Initialization Error</h2>
        <pre>${error instanceof Error ? error.stack : String(error)}</pre>
      </div>`;
    }
  }
})();
