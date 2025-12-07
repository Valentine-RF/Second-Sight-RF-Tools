import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Link } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { AccentProvider } from "./contexts/AccentContext";
import Home from "./pages/Home";
import ComparisonMode from "./pages/ComparisonMode";
import AdvancedAnalysis from "./pages/AdvancedAnalysis";
import FileManager from "./pages/FileManager";
import ForensicCockpit from "./pages/ForensicCockpit";
import APIDocumentation from "./pages/APIDocumentation";
import SplunkSettings from "./pages/SplunkSettings";
import TrainingPage from "./pages/TrainingPage";
import { useAuth } from "./_core/hooks/useAuth";
import { Button } from "./components/ui/button";
import { Radio, Upload, LogOut, Menu, Moon, Sun, Activity, Key, Brain } from 'lucide-react';
import { AccentSwitcher } from './components/AccentSwitcher';
import { useState } from "react";

/**
 * Main navigation header for forensic signal processing app
 */
function Navigation() {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  if (!user) return null;

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container">
        <div className="flex items-center justify-between h-16">
          <Link href="/">
            <span className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
              <Radio className="w-6 h-6 text-primary" />
              <div className="flex flex-col">
                <span className="second-sight-logo text-xl">Second Sight</span>
                <span className="valentine-rf-badge text-[0.65rem]">by Valentine RF</span>
              </div>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            <AccentSwitcher />
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="gap-2"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </Button>
            <Button variant="ghost" className="gap-2" asChild>
              <Link href="/files">
                <Upload className="w-4 h-4" />
                File Manager
              </Link>
            </Button>
            <Button variant="ghost" className="gap-2" asChild>
              <Link href="/cockpit">
                <Radio className="w-4 h-4" />
                Cockpit
              </Link>
            </Button>
            <Button variant="ghost" className="gap-2" asChild>
              <Link href="/compare">
                <Menu className="w-4 h-4" />
                Compare
              </Link>
            </Button>
            <Button variant="ghost" className="gap-2" asChild>
              <Link href="/advanced">
                <Activity className="w-4 h-4" />
                Advanced
              </Link>
            </Button>
            <Button variant="ghost" className="gap-2" asChild>
              <Link href="/api">
                <Key className="w-4 h-4" />
                API
              </Link>
            </Button>
            <Button variant="ghost" className="gap-2" asChild>
              <Link href="/training">
                <Brain className="w-4 h-4" />
                Training
              </Link>
            </Button>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-3">
              <div className="text-sm">
                <div className="font-mono">{user.name || 'User'}</div>
                <div className="technical-label">{user.email}</div>
              </div>
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
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-2" asChild>
              <Link href="/files">
                <Upload className="w-4 h-4" />
                File Manager
              </Link>
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-2" asChild>
              <Link href="/cockpit">
                <Radio className="w-4 h-4" />
                Cockpit
              </Link>
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-2" asChild>
              <Link href="/compare">
                <Menu className="w-4 h-4" />
                Compare
              </Link>
            </Button>
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
       <Route path={"/"} component={Home} />
      <Route path={"/files"} component={FileManager} />
      <Route path={"/cockpit"} component={ForensicCockpit} />
       <Route path="/compare" component={ComparisonMode} />
      <Route path="/advanced" component={AdvancedAnalysis} />
      <Route path="/api" component={APIDocumentation} />
      <Route path="/splunk" component={SplunkSettings} />
      <Route path="/training" component={TrainingPage} />
      <Route path={"/404"} component={NotFound} />
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
      <ThemeProvider
        defaultTheme="dark"
        switchable
      >
        <AccentProvider defaultAccent="blue">
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AccentProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
