import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import FileManager from "./pages/FileManager";
import ForensicCockpit from "./pages/ForensicCockpit";
import { useAuth } from "./_core/hooks/useAuth";
import { Button } from "./components/ui/button";
import { Radio, Upload, LogOut, Menu } from "lucide-react";
import { useState } from "react";

/**
 * Main navigation header for forensic signal processing app
 */
function Navigation() {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!user) return null;

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container">
        <div className="flex items-center justify-between h-16">
          <Link href="/">
            <a className="flex items-center gap-2 font-black text-xl hover:text-primary transition-colors">
              <Radio className="w-6 h-6" />
              Forensic Signal Processor
            </a>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            <Link href="/files">
              <Button variant="ghost" className="gap-2">
                <Upload className="w-4 h-4" />
                File Manager
              </Button>
            </Link>
            <Link href="/cockpit">
              <Button variant="ghost" className="gap-2">
                <Radio className="w-4 h-4" />
                Cockpit
              </Button>
            </Link>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-3">
              <div className="text-sm">
                <div className="font-mono">{user.name || 'User'}</div>
                <div className="technical-label">{user.email}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => logout()} className="gap-2">
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-border py-4 space-y-2">
            <Link href="/files">
              <Button variant="ghost" className="w-full justify-start gap-2">
                <Upload className="w-4 h-4" />
                File Manager
              </Button>
            </Link>
            <Link href="/cockpit">
              <Button variant="ghost" className="w-full justify-start gap-2">
                <Radio className="w-4 h-4" />
                Cockpit
              </Button>
            </Link>
            <div className="border-t border-border pt-2 mt-2">
              <div className="px-4 py-2 text-sm">
                <div className="font-mono">{user.name || 'User'}</div>
                <div className="technical-label">{user.email}</div>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2"
                onClick={() => logout()}
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

/**
 * Main application router
 */
function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/files" component={FileManager} />
      <Route path="/cockpit" component={ForensicCockpit} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Root application component
 */
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Navigation />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
