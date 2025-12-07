import { useState, useRef, useEffect } from 'react';

interface AnnotationBoxProps {
  annotation: {
    id: number;
    label: string;
    color: string;
    sampleStart: number;
    sampleEnd: number;
    freqStart: number;
    freqEnd: number;
  };
  containerWidth: number;
  containerHeight: number;
  totalSamples: number;
  sampleRate: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: {
    sampleStart?: number;
    sampleEnd?: number;
    freqStart?: number;
    freqEnd?: number;
  }) => void;
  onDoubleClick: () => void;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' | null;

export function AnnotationBox({
  annotation,
  containerWidth,
  containerHeight,
  totalSamples,
  sampleRate,
  isSelected,
  onSelect,
  onUpdate,
  onDoubleClick,
}: AnnotationBoxProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<ResizeHandle>(null);
  const dragStartRef = useRef({ x: 0, y: 0, sampleStart: 0, sampleEnd: 0, freqStart: 0, freqEnd: 0 });

  // Convert sample positions to pixel positions
  const left = (annotation.sampleStart / totalSamples) * containerWidth;
  const width = ((annotation.sampleEnd - annotation.sampleStart) / totalSamples) * containerWidth;
  const top = (1 - annotation.freqEnd / (sampleRate / 2)) * containerHeight;
  const height = ((annotation.freqEnd - annotation.freqStart) / (sampleRate / 2)) * containerHeight;

  const handleMouseDown = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    setIsDragging(true);
    setActiveHandle(handle);
    onSelect();

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      sampleStart: annotation.sampleStart,
      sampleEnd: annotation.sampleEnd,
      freqStart: annotation.freqStart,
      freqEnd: annotation.freqEnd,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      const deltaSamples = (deltaX / containerWidth) * totalSamples;
      const deltaFreq = -(deltaY / containerHeight) * (sampleRate / 2);

      const start = dragStartRef.current;
      let updates: any = {};

      switch (activeHandle) {
        case 'move':
          updates = {
            sampleStart: Math.max(0, Math.min(totalSamples - (start.sampleEnd - start.sampleStart), start.sampleStart + deltaSamples)),
            sampleEnd: Math.max(start.sampleEnd - start.sampleStart, Math.min(totalSamples, start.sampleEnd + deltaSamples)),
            freqStart: Math.max(0, Math.min(sampleRate / 2 - (start.freqEnd - start.freqStart), start.freqStart + deltaFreq)),
            freqEnd: Math.max(start.freqEnd - start.freqStart, Math.min(sampleRate / 2, start.freqEnd + deltaFreq)),
          };
          break;
        case 'nw':
          updates = {
            sampleStart: Math.max(0, Math.min(start.sampleEnd - 100, start.sampleStart + deltaSamples)),
            freqEnd: Math.max(start.freqStart + 1000, Math.min(sampleRate / 2, start.freqEnd + deltaFreq)),
          };
          break;
        case 'n':
          updates = {
            freqEnd: Math.max(start.freqStart + 1000, Math.min(sampleRate / 2, start.freqEnd + deltaFreq)),
          };
          break;
        case 'ne':
          updates = {
            sampleEnd: Math.max(start.sampleStart + 100, Math.min(totalSamples, start.sampleEnd + deltaSamples)),
            freqEnd: Math.max(start.freqStart + 1000, Math.min(sampleRate / 2, start.freqEnd + deltaFreq)),
          };
          break;
        case 'e':
          updates = {
            sampleEnd: Math.max(start.sampleStart + 100, Math.min(totalSamples, start.sampleEnd + deltaSamples)),
          };
          break;
        case 'se':
          updates = {
            sampleEnd: Math.max(start.sampleStart + 100, Math.min(totalSamples, start.sampleEnd + deltaSamples)),
            freqStart: Math.max(0, Math.min(start.freqEnd - 1000, start.freqStart + deltaFreq)),
          };
          break;
        case 's':
          updates = {
            freqStart: Math.max(0, Math.min(start.freqEnd - 1000, start.freqStart + deltaFreq)),
          };
          break;
        case 'sw':
          updates = {
            sampleStart: Math.max(0, Math.min(start.sampleEnd - 100, start.sampleStart + deltaSamples)),
            freqStart: Math.max(0, Math.min(start.freqEnd - 1000, start.freqStart + deltaFreq)),
          };
          break;
        case 'w':
          updates = {
            sampleStart: Math.max(0, Math.min(start.sampleEnd - 100, start.sampleStart + deltaSamples)),
          };
          break;
      }

      if (Object.keys(updates).length > 0) {
        onUpdate(updates);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setActiveHandle(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, activeHandle, containerWidth, containerHeight, totalSamples, sampleRate, onUpdate]);

  const handleStyle = {
    width: '8px',
    height: '8px',
    background: 'white',
    border: `2px solid ${annotation.color}`,
    borderRadius: '50%',
    position: 'absolute' as const,
    zIndex: 20,
  };

  return (
    <div
      className={`absolute border-2 transition-all ${
        isSelected ? 'ring-2 ring-white' : ''
      }`}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        borderColor: annotation.color,
        backgroundColor: `${annotation.color}20`,
        cursor: isDragging ? 'grabbing' : 'grab',
        pointerEvents: 'auto',
      }}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
    >
      {/* Label */}
      <div
        className="absolute top-0 left-0 px-1 text-xs font-bold text-white"
        style={{ backgroundColor: annotation.color }}
      >
        {annotation.label}
      </div>

      {/* Resize handles - only show when selected */}
      {isSelected && (
        <>
          {/* Top-left */}
          <div
            style={{ ...handleStyle, top: '-4px', left: '-4px', cursor: 'nw-resize' }}
            onMouseDown={(e) => handleMouseDown(e, 'nw')}
          />
          {/* Top */}
          <div
            style={{ ...handleStyle, top: '-4px', left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' }}
            onMouseDown={(e) => handleMouseDown(e, 'n')}
          />
          {/* Top-right */}
          <div
            style={{ ...handleStyle, top: '-4px', right: '-4px', cursor: 'ne-resize' }}
            onMouseDown={(e) => handleMouseDown(e, 'ne')}
          />
          {/* Right */}
          <div
            style={{ ...handleStyle, top: '50%', right: '-4px', transform: 'translateY(-50%)', cursor: 'e-resize' }}
            onMouseDown={(e) => handleMouseDown(e, 'e')}
          />
          {/* Bottom-right */}
          <div
            style={{ ...handleStyle, bottom: '-4px', right: '-4px', cursor: 'se-resize' }}
            onMouseDown={(e) => handleMouseDown(e, 'se')}
          />
          {/* Bottom */}
          <div
            style={{ ...handleStyle, bottom: '-4px', left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' }}
            onMouseDown={(e) => handleMouseDown(e, 's')}
          />
          {/* Bottom-left */}
          <div
            style={{ ...handleStyle, bottom: '-4px', left: '-4px', cursor: 'sw-resize' }}
            onMouseDown={(e) => handleMouseDown(e, 'sw')}
          />
          {/* Left */}
          <div
            style={{ ...handleStyle, top: '50%', left: '-4px', transform: 'translateY(-50%)', cursor: 'w-resize' }}
            onMouseDown={(e) => handleMouseDown(e, 'w')}
          />
        </>
      )}
    </div>
  );
}
