import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type AccentMode = 'blue' | 'red' | 'silver';

interface AccentContextType {
  accent: AccentMode;
  setAccent: (accent: AccentMode) => void;
}

const AccentContext = createContext<AccentContextType | undefined>(undefined);

interface AccentProviderProps {
  children: ReactNode;
  defaultAccent?: AccentMode;
}

export function AccentProvider({ children, defaultAccent = 'blue' }: AccentProviderProps) {
  const [accent, setAccentState] = useState<AccentMode>(() => {
    // Load from localStorage or use default
    const stored = localStorage.getItem('second-sight-accent');
    return (stored as AccentMode) || defaultAccent;
  });

  useEffect(() => {
    // Apply accent to document root
    document.documentElement.setAttribute('data-accent', accent);
    // Persist to localStorage
    localStorage.setItem('second-sight-accent', accent);
  }, [accent]);

  const setAccent = (newAccent: AccentMode) => {
    setAccentState(newAccent);
  };

  return (
    <AccentContext.Provider value={{ accent, setAccent }}>
      {children}
    </AccentContext.Provider>
  );
}

export function useAccent() {
  const context = useContext(AccentContext);
  if (context === undefined) {
    throw new Error('useAccent must be used within an AccentProvider');
  }
  return context;
}
