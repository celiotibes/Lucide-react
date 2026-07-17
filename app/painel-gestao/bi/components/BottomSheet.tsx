'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, GripVertical } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapPoints?: (number | string)[];
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = [50, 100],
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [currentSnap, setCurrentSnap] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);

  const getSnapValue = (snap: number | string) => {
    if (typeof snap === 'number') return snap;
    if (snap.endsWith('%')) return parseInt(snap) / 100;
    if (snap === '25') return 0.25;
    if (snap === '50') return 0.5;
    if (snap === '100') return 1;
    return 0.5;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartY(e.clientY);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !sheetRef.current) return;

    const diff = e.clientY - startY;
    if (diff > 50) {
      onClose();
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, startY]);

  const snapValue = getSnapValue(snapPoints[currentSnap]);
  const height = `${snapValue * 100}vh`;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-slate-900 to-slate-800 rounded-t-3xl border border-slate-700/50 backdrop-blur-xl transition-all duration-500 ease-out max-h-screen ${
          isOpen
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ height: isOpen ? height : 'auto' }}
      >
        {/* Handle */}
        <div
          className="flex justify-center items-center pt-4 pb-2 cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2 text-slate-400">
            <GripVertical className="w-5 h-5" />
          </div>
        </div>

        {/* Header */}
        <div className="sticky top-12 bg-gradient-to-b from-slate-800 to-slate-800/0 px-6 py-4 border-b border-slate-700/30 flex items-center justify-between">
          {title && <h2 className="text-xl font-semibold text-slate-100">{title}</h2>}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-4 pb-8 max-h-[calc(100% - 120px)] space-y-4">
          {children}
        </div>

        {/* Safe Area Bottom */}
        <div className="h-6 md:h-0" />
      </div>
    </>
  );
}
