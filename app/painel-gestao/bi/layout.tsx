import { ThemeProvider } from './components/ThemeProvider';
import { ThemeToggle } from './components/ThemeToggle';
import { FilterProvider } from './components/FilterContext';
import { RealtimeProvider } from './components/RealtimeProvider';
import { BottomNav } from './components/BottomNav';
import './styles/ui.css';

export const metadata = {
  title: 'Business Intelligence',
  description: 'Plataforma de análise e relatórios BI',
};

export default function BiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <RealtimeProvider>
        <FilterProvider>
          <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 transition-colors">
            {/* Header com theme toggle */}
            <div className="bg-gradient-to-b from-slate-800 to-slate-800/90 border-b border-slate-700/30 sticky top-0 z-40 backdrop-blur-xl">
              <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                  📊 BI
                </h1>
                <ThemeToggle />
              </div>
            </div>

            {/* Main content */}
            <main className="bg-gradient-to-b from-slate-900 to-slate-950">
              {children}
            </main>

            {/* Bottom Navigation - Mobile only */}
            <BottomNav />
          </div>
        </FilterProvider>
      </RealtimeProvider>
    </ThemeProvider>
  );
}
