import { useState, useCallback, useRef } from 'react';
import { Dimensions } from 'react-native';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingElement {
  id: string;
  type: 'arrow' | 'circle' | 'rectangle' | 'text';
  startPoint: Point;
  endPoint?: Point;
  points?: Point[];
  radius?: number;
  text?: string;
  color: string;
  strokeWidth: number;
}

export interface AnnotationState {
  elements: DrawingElement[];
  history: DrawingElement[][];
  historyIndex: number;
}

export function usePhotoAnnotations(initialData?: string) {
  const [state, setState] = useState<AnnotationState>(() => {
    if (initialData) {
      try {
        const loaded = JSON.parse(initialData);
        return {
          elements: loaded,
          history: [loaded],
          historyIndex: 0,
        };
      } catch (err) {
        console.error('Failed to load annotations:', err);
      }
    }
    return {
      elements: [],
      history: [[]],
      historyIndex: 0,
    };
  });

  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const tempElementRef = useRef<DrawingElement | null>(null);

  const saveState = useCallback((elements: DrawingElement[]) => {
    setState((prev) => {
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push([...elements]);
      return {
        elements,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  }, []);

  const handleStartDrawing = useCallback(
    (point: Point) => {
      if (!currentTool) return;

      setIsDrawing(true);
      const id = `${currentTool}-${Date.now()}`;

      if (currentTool === 'text') {
        // Text handling - prompt for text input
        const newElement: DrawingElement = {
          id,
          type: 'text',
          startPoint: point,
          text: '',
          color,
          strokeWidth,
        };
        tempElementRef.current = newElement;
      } else {
        const newElement: DrawingElement = {
          id,
          type: currentTool as any,
          startPoint: point,
          endPoint: point,
          color,
          strokeWidth,
          ...(currentTool === 'arrow' && { points: [point] }),
        };
        tempElementRef.current = newElement;
      }
    },
    [currentTool, color, strokeWidth]
  );

  const handleDrawing = useCallback(
    (point: Point) => {
      if (!isDrawing || !tempElementRef.current) return;

      const element = tempElementRef.current;

      if (element.type === 'arrow' && element.points) {
        element.points.push(point);
      } else if (element.type === 'circle' || element.type === 'rectangle') {
        element.endPoint = point;
        if (element.type === 'circle' && element.startPoint) {
          const dx = point.x - element.startPoint.x;
          const dy = point.y - element.startPoint.y;
          element.radius = Math.sqrt(dx * dx + dy * dy);
        }
      }
    },
    [isDrawing]
  );

  const handleEndDrawing = useCallback(
    (endPoint?: Point) => {
      if (!tempElementRef.current) return;

      const element = tempElementRef.current;
      if (endPoint) {
        element.endPoint = endPoint;
        if (element.type === 'circle') {
          const dx = endPoint.x - element.startPoint.x;
          const dy = endPoint.y - element.startPoint.y;
          element.radius = Math.sqrt(dx * dx + dy * dy);
        }
      }

      const newElements = [...state.elements, element];
      saveState(newElements);
      tempElementRef.current = null;
      setIsDrawing(false);
    },
    [state.elements, saveState]
  );

  const handleAddText = useCallback(
    (point: Point, text: string) => {
      const newElement: DrawingElement = {
        id: `text-${Date.now()}`,
        type: 'text',
        startPoint: point,
        text,
        color,
        strokeWidth,
      };
      const newElements = [...state.elements, newElement];
      saveState(newElements);
    },
    [state.elements, color, strokeWidth, saveState]
  );

  const handleUndo = useCallback(() => {
    setState((prev) => {
      if (prev.historyIndex > 0) {
        const newIndex = prev.historyIndex - 1;
        return {
          ...prev,
          historyIndex: newIndex,
          elements: [...prev.history[newIndex]],
        };
      }
      return prev;
    });
  }, []);

  const handleRedo = useCallback(() => {
    setState((prev) => {
      if (prev.historyIndex < prev.history.length - 1) {
        const newIndex = prev.historyIndex + 1;
        return {
          ...prev,
          historyIndex: newIndex,
          elements: [...prev.history[newIndex]],
        };
      }
      return prev;
    });
  }, []);

  const handleClear = useCallback(() => {
    saveState([]);
  }, [saveState]);

  const getSerializedAnnotations = useCallback((): string => {
    return JSON.stringify(state.elements);
  }, [state.elements]);

  return {
    elements: state.elements,
    currentTool,
    isDrawing,
    color,
    strokeWidth,
    setCurrentTool,
    setColor,
    setStrokeWidth,
    handleStartDrawing,
    handleDrawing,
    handleEndDrawing,
    handleAddText,
    handleUndo,
    handleRedo,
    handleClear,
    canUndo: state.historyIndex > 0,
    canRedo: state.historyIndex < state.history.length - 1,
    getSerializedAnnotations,
  };
}
