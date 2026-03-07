import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { seedDefaultReferences } from "@/lib/referenceSeeder";
import { runBulkBuildAndDownload, runBulkBuildReport } from "@/lib/levelBulkBuilder";

console.log('🚀 main.tsx starting...');

const maybeReloadOnceForNewBuild = () => {
  if (typeof window === 'undefined') return;
  // Only do this in production builds where VITE_BUILD_ID is set by CI.
  if (!import.meta.env.PROD) return;
  const buildId = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? '';
  if (!buildId) return;

  const lastKey = 'stone-age-last-build-id';
  const onceKey = `stone-age-reloaded-${buildId}`;
  const last = localStorage.getItem(lastKey) ?? '';
  if (last !== buildId) {
    localStorage.setItem(lastKey, buildId);
    // Prevent loops: reload at most once per build per tab/session.
    if (!sessionStorage.getItem(onceKey)) {
      sessionStorage.setItem(onceKey, '1');
      window.location.reload();
    }
  }
};

try {
  const rootElement = document.getElementById("root");
  console.log('📦 Root element:', rootElement);

  if (!rootElement) {
    throw new Error('Root element not found!');
  }

  maybeReloadOnceForNewBuild();

  console.log('🎯 Creating React root...');
  const root = createRoot(rootElement);

  seedDefaultReferences().catch((error) => {
    console.warn('Failed to seed default references:', error);
  });

  if (typeof window !== 'undefined') {
    (window as any).runBulkBuildAndDownload = runBulkBuildAndDownload;
    (window as any).runBulkBuildReport = runBulkBuildReport;

    const params = new URLSearchParams(window.location.search);
    if (params.has('bulkbuild') && sessionStorage.getItem('bulkbuild-ran') !== '1') {
      sessionStorage.setItem('bulkbuild-ran', '1');
      setTimeout(() => {
        runBulkBuildAndDownload({
          onProgress: (status) => console.log(`[bulkbuild] ${status}`)
        })
          .then((report) => {
            console.log('[bulkbuild] complete', report.summary, 'edge cases', report.edgeCases?.length ?? 0);
          })
          .catch((error) => {
            console.error('[bulkbuild] failed', error);
          });
      }, 500);
    }
  }

  console.log('⚛️ Rendering App...');
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  console.log('✅ App rendered successfully!');
} catch (error) {
  console.error('❌ Fatal error in main.tsx:', error);
  console.error('Stack trace:', (error as Error).stack);
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: monospace; color: red;">
      <h1>🚨 Application Failed to Load</h1>
      <p><strong>Error:</strong> ${(error as Error).message}</p>
      <pre>${(error as Error).stack}</pre>
    </div>
  `;
}
