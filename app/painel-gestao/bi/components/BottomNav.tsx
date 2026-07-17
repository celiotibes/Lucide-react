'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  FileText,
  AlertCircle,
  Activity,
  Settings2,
} from 'lucide-react';

const navItems = [
  {
    name: 'Dashboard',
    href: '/painel-gestao/bi/dashboard',
    icon: BarChart3,
  },
  {
    name: 'Relatórios',
    href: '/painel-gestao/bi/relatorios',
    icon: FileText,
  },
  {
    name: 'Alertas',
    href: '/painel-gestao/bi/alertas',
    icon: AlertCircle,
  },
  {
    name: 'Performance',
    href: '/painel-gestao/bi/performance',
    icon: Activity,
  },
  {
    name: 'Config',
    href: '/painel-gestao/bi/configuracoes',
    icon: Settings2,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Spacer para conteúdo não ficar atrás */}
      <div className="h-20 md:h-0" />

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden z-40 bg-gradient-to-t from-slate-900 to-slate-800/90 border-t border-slate-700/30 backdrop-blur-xl">
        <div className="flex items-center justify-around h-20 px-2 max-w-7xl mx-auto w-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all duration-300 flex-1 ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
                }`}
              >
                <Icon className="w-5 h-5" />
                {isActive && (
                  <span className="text-xs font-medium leading-tight text-center">
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
