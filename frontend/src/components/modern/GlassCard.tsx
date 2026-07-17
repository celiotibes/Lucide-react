/**
 * Glass Card Component
 * Glassmorphism effect with modern micro-interactions
 */

import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'premium' | 'interactive';
  onClick?: () => void;
  title?: string;
  icon?: React.ReactNode;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  variant = 'default',
  onClick,
  title,
  icon,
}) => {
  const baseStyles = 'rounded-xl backdrop-blur-md transition-all duration-300 border';

  const variantStyles = {
    default: 'bg-[rgba(30,41,59,0.7)] border-[rgba(226,232,240,0.1)]',
    premium: 'bg-[rgba(30,41,59,0.7)] border-[rgba(212,175,55,0.2)] shadow-[0_0_20px_rgba(212,175,55,0.3)]',
    interactive: 'bg-[rgba(30,41,59,0.7)] border-[rgba(226,232,240,0.1)] cursor-pointer hover:shadow-lg hover:-translate-y-1',
  };

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} p-6 ${className}`}
      onClick={onClick}
    >
      {(title || icon) && (
        <div className="flex items-center gap-3 mb-4">
          {icon && <div className="text-2xl">{icon}</div>}
          {title && <h3 className="text-lg font-semibold text-[#f1f5f9]">{title}</h3>}
        </div>
      )}
      {children}
    </div>
  );
};

export default GlassCard;
