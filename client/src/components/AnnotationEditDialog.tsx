import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Annotation {
  id: number;
  label: string;
  notes?: string;
  color: string;
  freqStart: number;
  freqEnd: number;
  timeStart: number;
  timeEnd: number;
}

interface AnnotationEditDialogProps {
  open: boolean;
  annotation: Annotation | null;
  onClose: () => void;
  onSave: (annotation: Annotation) => void;
  onDelete?: (annotationId: number) => void;
}

const PRESET_COLORS = [
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Green', value: '#10b981' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
];

export function AnnotationEditDialog({
  open,
  annotation,
  onClose,
  onSave,
  onDelete,
}: AnnotationEditDialogProps) {
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState('#ec4899');
  const [freqStart, setFreqStart] = useState(0);
  const [freqEnd, setFreqEnd] = useState(0);
  const [timeStart, setTimeStart] = useState(0);
  const [timeEnd, setTimeEnd] = useState(0);

  // Populate form when annotation changes
  useEffect(() => {
    if (annotation) {
      setLabel(annotation.label);
      setNotes(annotation.notes || '');
      setColor(annotation.color);
      setFreqStart(annotation.freqStart);
      setFreqEnd(annotation.freqEnd);
      setTimeStart(annotation.timeStart);
      setTimeEnd(annotation.timeEnd);
    }
  }, [annotation]);

  const handleSave = () => {
    if (!annotation) return;

    onSave({
      ...annotation,
      label,
      notes,
      color,
      freqStart,
      freqEnd,
      timeStart,
      timeEnd,
    });
    onClose();
  };

  const handleDelete = () => {
    if (!annotation || !onDelete) return;
    if (confirm('Are you sure you want to delete this annotation?')) {
      onDelete(annotation.id);
      onClose();
    }
  };

  if (!annotation) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Annotation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., FM Broadcast, WiFi Signal"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details about this signal..."
              rows={3}
            />
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setColor(preset.value)}
                  className="w-8 h-8 rounded border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: preset.value,
                    borderColor: color === preset.value ? '#fff' : 'transparent',
                  }}
                  title={preset.name}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded border-2 border-border cursor-pointer"
                title="Custom color"
              />
            </div>
          </div>

          {/* Frequency Bounds */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="freqStart">Freq Start (MHz)</Label>
              <Input
                id="freqStart"
                type="number"
                step="0.001"
                value={freqStart}
                onChange={(e) => setFreqStart(parseFloat(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="freqEnd">Freq End (MHz)</Label>
              <Input
                id="freqEnd"
                type="number"
                step="0.001"
                value={freqEnd}
                onChange={(e) => setFreqEnd(parseFloat(e.target.value))}
              />
            </div>
          </div>

          {/* Time Bounds */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeStart">Time Start (s)</Label>
              <Input
                id="timeStart"
                type="number"
                step="0.001"
                value={timeStart}
                onChange={(e) => setTimeStart(parseFloat(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeEnd">Time End (s)</Label>
              <Input
                id="timeEnd"
                type="number"
                step="0.001"
                value={timeEnd}
                onChange={(e) => setTimeEnd(parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
