/**
 * Bento Grid Layout Container
 * Responsive grid for modern dashboard layouts
 */

import React from 'react';

type GridSize = 'sm' | 'md' | 'lg';

interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
  gap?: 'sm' | 'md' | 'lg';
}

interface BentoItemProps {
  children: React.ReactNode;
  size?: GridSize;
  className?: string;
}

const gapClasses = {
  sm: 'gap-3',
  md: 'gap-6',
  lg: 'gap-8',
};

const sizeClasses = {
  sm: 'col-span-1 row-span-1',
  md: 'col-span-1 md:col-span-2 row-span-1 md:row-span-2',
  lg: 'col-span-1 md:col-span-2 lg:col-span-2 row-span-1',
};

export const BentoGrid: React.FC<BentoGridProps> = ({
  children,
  className = '',
  gap = 'md',
}) => {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4
        ${gapClasses[gap]} ${className}`}
    >
      {children}
    </div>
  );
};

export const BentoItem: React.FC<BentoItemProps> = ({
  children,
  size = 'sm',
  className = '',
}) => {
  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      {children}
    </div>
  );
};

export default BentoGrid;
