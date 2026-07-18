import React from 'react'

export const CardSkeleton: React.FC = () => (
  <div className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 animate-pulse">
    <div className="mb-4 h-6 bg-slate-800 rounded w-3/4" />
    <div className="mb-3 h-4 bg-slate-800 rounded w-1/2" />
    <div className="mb-4 space-y-2">
      <div className="h-2 bg-slate-800 rounded" />
      <div className="h-2 bg-slate-800 rounded w-5/6" />
    </div>
    <div className="h-4 bg-slate-800 rounded w-2/3" />
  </div>
)

export const SkeletonGrid: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {Array.from({ length: count }).map((_, i) => (
      <CardSkeleton key={i} />
    ))}
  </div>
)

export const TableRowSkeleton: React.FC = () => (
  <div className="backdrop-blur-lg bg-slate-900/80 border border-slate-700/50 rounded-lg p-4 animate-pulse">
    <div className="flex items-center gap-4">
      <div className="h-12 w-12 bg-slate-800 rounded" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-slate-800 rounded w-3/4" />
        <div className="h-3 bg-slate-800 rounded w-1/2" />
      </div>
      <div className="h-8 w-20 bg-slate-800 rounded" />
    </div>
  </div>
)

export const ListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <TableRowSkeleton key={i} />
    ))}
  </div>
)
