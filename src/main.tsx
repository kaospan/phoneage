import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { seedDefaultReferences } from "@/lib/referenceSeeder";

console.log('🚀 main.tsx starting...');

try {
  const rootElement = document.getElementById("root");
  console.log('📦 Root element:', rootElement);

  if (!rootElement) {
    throw new Error('Root element not found!');
  }

  console.log('🎯 Creating React root...');
  const root = createRoot(rootElement);

  seedDefaultReferences().catch((error) => {
    console.warn('Failed to seed default references:', error);
  });

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
