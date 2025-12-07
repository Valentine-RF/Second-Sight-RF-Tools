import { useAccent, AccentMode } from '@/contexts/AccentContext';
import { Button } from './ui/button';
import { Circle, AlertTriangle, Shield } from 'lucide-react';
import { toast } from 'sonner';

const accentModes: { mode: AccentMode; label: string; icon: typeof Circle; description: string }[] = [
  { mode: 'blue', label: 'Analysis', icon: Circle, description: 'Default analysis mode' },
  { mode: 'red', label: 'Alert', icon: AlertTriangle, description: 'Threat detection mode' },
  { mode: 'silver', label: 'Stealth', icon: Shield, description: 'Passive monitoring mode' },
];

export function AccentSwitcher() {
  const { accent, setAccent } = useAccent();

  const handleAccentChange = (newAccent: AccentMode) => {
    setAccent(newAccent);
    const mode = accentModes.find(m => m.mode === newAccent);
    toast.success(`Switched to ${mode?.label} mode`, {
      description: mode?.description,
    });
  };

  return (
    <div className="flex items-center gap-1 border border-border rounded-md p-1">
      {accentModes.map(({ mode, label, icon: Icon }) => (
        <Button
          key={mode}
          variant={accent === mode ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleAccentChange(mode)}
          className="gap-2 text-xs"
        >
          <Icon className="w-3 h-3" />
          {label}
        </Button>
      ))}
    </div>
  );
}
