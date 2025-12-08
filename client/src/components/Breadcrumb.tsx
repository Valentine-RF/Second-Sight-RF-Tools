import { Link } from 'wouter';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        
        return (
          <div key={index} className="flex items-center gap-2">
            {item.href ? (
              <Link href={item.href}>
                <span className="flex items-center gap-1.5 text-muted-foreground hover:text-cyan-500 transition-colors cursor-pointer">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
              </Link>
            ) : (
              <span className={`flex items-center gap-1.5 ${isLast ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {item.icon}
                <span>{item.label}</span>
              </span>
            )}
            
            {!isLast && (
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            )}
          </div>
        );
      })}
    </nav>
  );
}
