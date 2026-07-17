import { ThemeProvider } from './components/ThemeProvider';
import { ThemeToggle } from './components/ThemeToggle';

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
      <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors">
        {/* Header com theme toggle */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">BI</h1>
            <ThemeToggle />
          </div>
        </div>

        {/* Main content */}
        <main className="bg-gray-50 dark:bg-gray-950">
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
