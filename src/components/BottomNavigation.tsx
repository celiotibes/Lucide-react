import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export const BottomNavigation: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/cases', label: 'Casos', icon: '📋' },
    { path: '/intimations', label: 'Intimações', icon: '📬' },
    { path: '/compliance', label: 'Compliance', icon: '✅' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-700/50 backdrop-blur-lg z-40">
      <div className="max-w-7xl mx-auto px-4 h-20">
        <div className="flex items-center justify-around h-full">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition ${
                  isActive
                    ? 'text-purple-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-xs font-medium">{item.label}</span>
                {isActive && (
                  <div className="absolute bottom-0 w-12 h-1 bg-gradient-to-r from-purple-500 to-blue-500 rounded-t" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
