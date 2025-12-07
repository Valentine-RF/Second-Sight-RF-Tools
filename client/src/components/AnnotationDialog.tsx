/**
 * Annotation Dialog
 * 
 * Dialog for creating/editing signal annotations with label and color selection
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Loader2 } from 'lucide-react';

interface AnnotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { label: string; color: string }) => void | Promise<void>;
  initialLabel?: string;
  initialColor?: string;
  selectionInfo?: {
    sampleStart: number;
    sampleCount: number;
    timeStart: number;
    timeEnd: number;
  };
}

const PRESET_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Green', value: '#10b981' },
  { name: 'Yellow', value: '#f59e0b' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Orange', value: '#f97316' },
];

export default function AnnotationDialog({
  open,
  onOpenChange,
  onSave,
  initialLabel = '',
  initialColor = '#3b82f6',
  selectionInfo,
}: AnnotationDialogProps) {
  const [label, setLabel] = useState(initialLabel);
  const [color, setColor] = useState(initialColor);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ label, color });
      onOpenChange(false);
      // Reset form
      setLabel('');
      setColor('#3b82f6');
    } catch (error) {
      console.error('Failed to save annotation:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Save Annotation</DialogTitle>
          <DialogDescription>
            Add a label and color to mark this signal region for future reference.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Selection Info */}
          {selectionInfo && (
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Samples:</span>
                <span className="font-mono">
                  {selectionInfo.sampleStart.toLocaleString()} - {(selectionInfo.sampleStart + selectionInfo.sampleCount).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span className="font-mono">
                  {((selectionInfo.timeEnd - selectionInfo.timeStart) * 1000).toFixed(2)} ms
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Count:</span>
                <span className="font-mono">{selectionInfo.sampleCount.toLocaleString()} samples</span>
              </div>
            </div>
          )}

          {/* Label Input */}
          <div className="grid gap-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              placeholder="e.g., Suspicious burst, WiFi signal, etc."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>

          {/* Color Picker */}
          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`h-10 rounded-md border-2 transition-all ${
                    color === preset.value
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:border-muted-foreground'
                  }`}
                  style={{ backgroundColor: preset.value }}
                  onClick={() => setColor(preset.value)}
                  title={preset.name}
                />
              ))}
            </div>
            
            {/* Custom Color Input */}
            <div className="flex items-center gap-2 mt-2">
              <Label htmlFor="custom-color" className="text-sm text-muted-foreground">
                Custom:
              </Label>
              <Input
                id="custom-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-20 cursor-pointer"
              />
              <span className="text-sm font-mono text-muted-foreground">{color}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !label.trim()}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Annotation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
