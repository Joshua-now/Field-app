import { Link, useLocation } from "wouter";
import { Briefcase, MapPin, User, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { appConfig } from "@/lib/config";
import { OfflineIndicator, OfflineBadge } from "@/components/OfflineIndicator";

interface MobileLayoutProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function MobileLayout({ children, title, showBack, onBack }: MobileLayoutProps) {
  const [location] = useLocation();

  const navigation = [
    { name: "Jobs", href: "/tech", icon: Briefcase },
    { name: "Map", href: "/tech/map", icon: MapPin },
    { name: "Photos", href: "/tech/photos", icon: Camera },
    { name: "Profile", href: "/tech/profile", icon: User },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {title && (
        <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3 sticky top-0 z-10 shadow-md">
          {showBack && (
            <button 
              onClick={onBack} 
              className="p-1 -ml-1 hover:bg-primary-foreground/10 rounded-full"
              data-testid="button-back"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h1 className="text-lg font-semibold flex-1">{title}</h1>
          <OfflineBadge />
        </header>
      )}

      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      <OfflineIndicator />

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-20">
        <div className="flex justify-around items-center h-16 px-2">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href === "/tech" && location.startsWith("/tech/job"));
            return (
              <Link key={item.name} href={item.href}>
                <div className={cn(
                  "flex flex-col items-center justify-center py-2 px-4 rounded-lg transition-colors min-w-[64px]",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground"
                )} data-testid={`nav-${item.name.toLowerCase()}`}>
                  <item.icon className={cn("w-6 h-6", isActive && "text-primary")} />
                  <span className="text-xs mt-1 font-medium">{item.name}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
