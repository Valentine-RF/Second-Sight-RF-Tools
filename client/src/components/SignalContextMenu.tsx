/**
 * Signal Context Menu
 * 
 * Right-click context menu for signal selections in the spectrogram
 * Provides forensic actions: Analyze Cycles, Classify Modulation, Save Annotation
 */

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Activity, Zap, Save, Layers } from "lucide-react";

export interface SignalSelection {
  sampleStart: number;
  sampleCount: number;
  timeStart: number;
  timeEnd: number;
  freqStart: number;
  freqEnd: number;
}

interface SignalContextMenuProps {
  children: React.ReactNode;
  selection: SignalSelection | null;
  captureId: number;
  onAnalyzeCycles?: (selection: SignalSelection) => void;
  onClassifyModulation?: (selection: SignalSelection) => void;
  onSaveAnnotation?: (selection: SignalSelection) => void;
  onViewDetails?: (selection: SignalSelection) => void;
}

export default function SignalContextMenu({
  children,
  selection,
  captureId,
  onAnalyzeCycles,
  onClassifyModulation,
  onSaveAnnotation,
  onViewDetails,
}: SignalContextMenuProps) {
  const hasSelection = selection !== null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      
      <ContextMenuContent className="w-64 bg-gray-900 border-gray-700">
        {!hasSelection ? (
          <ContextMenuItem disabled className="text-gray-500">
            No selection - draw a box to select signal region
          </ContextMenuItem>
        ) : (
          <>
            <div className="px-2 py-1.5 text-xs text-gray-400 font-semibold">
              Forensic Actions
            </div>
            
            <ContextMenuItem
              onClick={() => selection && onAnalyzeCycles?.(selection)}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-800"
            >
              <Activity className="w-4 h-4 text-blue-400" />
              <div>
                <div className="font-medium">Analyze Cycles</div>
                <div className="text-xs text-gray-400">
                  Run FAM algorithm for cyclostationary analysis
                </div>
              </div>
            </ContextMenuItem>
            
            <ContextMenuItem
              onClick={() => selection && onClassifyModulation?.(selection)}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-800"
            >
              <Zap className="w-4 h-4 text-yellow-400" />
              <div>
                <div className="font-medium">Classify Modulation</div>
                <div className="text-xs text-gray-400">
                  Identify modulation type using ML
                </div>
              </div>
            </ContextMenuItem>
            
            <ContextMenuSeparator className="bg-gray-700" />
            
            <ContextMenuItem
              onClick={() => selection && onSaveAnnotation?.(selection)}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-800"
            >
              <Save className="w-4 h-4 text-green-400" />
              <div>
                <div className="font-medium">Save Annotation</div>
                <div className="text-xs text-gray-400">
                  Mark this region for future reference
                </div>
              </div>
            </ContextMenuItem>
            
            <ContextMenuItem
              onClick={() => selection && onViewDetails?.(selection)}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-800"
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <div>
                <div className="font-medium">View Details</div>
                <div className="text-xs text-gray-400">
                  Show selection parameters
                </div>
              </div>
            </ContextMenuItem>
            
            <ContextMenuSeparator className="bg-gray-700" />
            
            <div className="px-2 py-1.5 text-xs text-gray-500">
              Selection: {selection.sampleCount.toLocaleString()} samples
              <br />
              Time: {selection.timeStart.toFixed(3)}s - {selection.timeEnd.toFixed(3)}s
            </div>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
