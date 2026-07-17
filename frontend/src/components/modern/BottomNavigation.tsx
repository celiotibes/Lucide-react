/**
 * Bottom Navigation Component
 * Ergonomic mobile-first navigation with glassmorphism
 */

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  badge?: number;
}

interface BottomNavigationProps {
  items: NavItem[];
  className?: string;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  items,
  className = '',
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 bg-[#1a2332] border-t border-[#334155]
        backdrop-blur-md flex justify-around items-center h-[72px] z-50 ${className}`}
    >
      {items.map((item) => {
        const isActive = location.pathname === item.path;

        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full
              transition-all duration-300 relative group
              ${
                isActive
                  ? 'text-[#3b82f6]'
                  : 'text-[#94a3b8] hover:text-[#cbd5e1]'
              }`}
            aria-label={item.label}
            title={item.label}
          >
            {/* Active Indicator */}
            {isActive && (
              <div
                className="absolute top-0 left-1/2 transform -translate-x-1/2 w-6 h-1
                  bg-[#3b82f6] rounded-b-sm shadow-[0_0_10px_rgba(59,130,246,0.5)]
                  transition-all duration-300"
              />
            )}

            {/* Icon */}
            <span className="text-2xl">{item.icon}</span>

            {/* Label */}
            <span className="text-xs font-medium">{item.label}</span>

            {/* Badge */}
            {item.badge && item.badge > 0 && (
              <span
                className="absolute top-0 right-2 bg-[#ef4444] text-white text-xs
                  font-bold rounded-full w-5 h-5 flex items-center justify-center
                  shadow-lg"
              >
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}

            {/* Hover Glow */}
            <div
              className="absolute inset-0 bg-[#3b82f6] opacity-0 group-hover:opacity-5
                transition-opacity duration-300 rounded-lg"
            />
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNavigation;
