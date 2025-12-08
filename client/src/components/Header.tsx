import { Link, useLocation } from 'wouter';
import { Radio } from 'lucide-react';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from './ui/button';
import { getLoginUrl } from '@/const';

export function Header() {
  const [location] = useLocation();
  const { user } = useAuth();

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/files', label: 'Files' },
    { href: '/cockpit', label: 'Cockpit' },
  ];

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/">
          <span className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
            <Radio className="w-6 h-6 text-cyan-500" />
            <div className="flex flex-col">
              <span className="font-black text-lg leading-none">Second Sight</span>
              <span className="text-xs text-muted-foreground leading-none">by Valentine RF</span>
            </div>
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-6">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <span
                className={`text-sm font-medium transition-colors hover:text-cyan-500 cursor-pointer ${
                  location === link.href
                    ? 'text-cyan-500'
                    : 'text-muted-foreground'
                }`}
              >
                {link.label}
              </span>
            </Link>
          ))}

          {/* User Section */}
          {user ? (
            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border">
              <span className="text-sm text-muted-foreground">{user.name}</span>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = getLoginUrl()}
              className="ml-4"
            >
              Sign In
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
