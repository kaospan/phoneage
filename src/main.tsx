import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { seedDefaultReferences } from "@/lib/referenceSeeder";
import { runBulkBuildAndDownload, runBulkBuildReport } from "@/lib/levelBulkBuilder";
import { dumpLevel, runSolveAllLevels, runSolveLevel } from "@/lib/levelSolver";

console.log('🚀 main.tsx starting...');

type LocalStorageSeed = {
  version: 1;
  generatedAt: string;
  localStorage: Record<string, string>;
};

const buildLocalStorageSeed = (): LocalStorageSeed => {
  const prefixes = [
    // Grid overrides saved by the mapper
    'level_override_',
    // Custom levels
    'custom_level_def_',
    'custom_level_ids_v1',
    // Per-level rows/cols overrides
    'level_layout_override_',
    // Mapper overlay scale tweaks
    'level_mapper_image_scale_',
  ];

  const out = {} as Record<string, string>;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === 'custom_level_ids_v1') {
        const v = localStorage.getItem(k);
        if (v != null) out[k] = v;
        continue;
      }
      if (!prefixes.some((p) => k.startsWith(p))) continue;
      const v = localStorage.getItem(k);
      if (v == null) continue;
      out[k] = v;
    }
  } catch {
    // ignore; seed will just be empty if storage access fails
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    localStorage: out,
  };
};

const applyLocalStorageSeed = (seed: any) => {
  const entries = seed?.localStorage && typeof seed.localStorage === 'object' ? seed.localStorage : null;
  if (!entries) return { applied: 0 };
  let applied = 0;
  for (const [k, v] of Object.entries(entries)) {
    try {
      localStorage.setItem(String(k), String(v));
      applied += 1;
    } catch {
      // ignore
    }
  }
  return { applied };
};

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
    (window as any).runSolveAllLevels = runSolveAllLevels;
    (window as any).runSolveLevel = runSolveLevel;
    (window as any).dumpLevel = dumpLevel;

    // Used to make Playwright reports match your current mapper edits/overrides.
    // Example:
    //   const seed = exportLocalStorageSeed(); copy(JSON.stringify(seed, null, 2));
    (window as any).exportLocalStorageSeed = buildLocalStorageSeed;
    (window as any).importLocalStorageSeed = applyLocalStorageSeed;

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
