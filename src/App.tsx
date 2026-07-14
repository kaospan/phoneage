import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Component, ErrorInfo, ReactNode, useState, useEffect } from "react";
import { supabase, type DbLevel } from "@/lib/supabaseClient";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Error Boundary Component
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('🔥 ErrorBoundary caught error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🔥 ErrorBoundary componentDidCatch:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'monospace', color: 'red' }}>
          <h1>🚨 Something went wrong</h1>
          <p><strong>Error:</strong> {this.state.error?.message}</p>
          <pre>{this.state.error?.stack}</pre>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }

    return this.props.children;
  }
}

console.log('📦 App.tsx loading...');

const App = () => {
  console.log('⚛️ App component rendering...');

  const [dbLevels, setDbLevels] = useState<DbLevel[]>([]);

  useEffect(() => {
    async function getLevels() {
      if (!supabase) return;
      const { data: levels } = await supabase.from('levels').select();
      if (levels) {
        setDbLevels(levels as DbLevel[]);
        console.log(`[supabase] ${levels.length} levels loaded from DB`);
        // Expose on window for debug access in the browser console
        (window as Window & { dbLevels?: DbLevel[] }).dbLevels = levels as DbLevel[];
      }
    }
    getLevels();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/mapper" element={<Index />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

console.log('✅ App.tsx loaded');

export default App;
