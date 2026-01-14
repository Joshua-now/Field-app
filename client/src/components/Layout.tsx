import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  CalendarDays, 
  Briefcase, 
  Users, 
  Contact, 
  Package, 
  MapPin,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/config";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Schedule", href: "/schedule", icon: CalendarDays },
    { name: "Jobs", href: "/jobs", icon: Briefcase },
    { name: "Live Map", href: "/live-map", icon: MapPin },
    { name: "Technicians", href: "/technicians", icon: Users },
    { name: "Customers", href: "/customers", icon: Contact },
    { name: "Inventory", href: "/inventory", icon: Package },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar for Desktop */}
      <div className="hidden md:flex flex-col w-64 bg-card border-r border-border/50 shadow-sm fixed h-full z-20">
        <div className="p-6 border-b border-border/50">
          <h1 className="text-xl font-bold font-display text-primary flex items-center gap-2">
            <span className="bg-primary text-primary-foreground p-1 rounded-md">{appConfig.companyName.slice(0, 2).toUpperCase()}</span>
            {appConfig.companyName}
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group",
                  isActive 
                    ? "bg-primary/10 text-primary shadow-sm" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}>
                  <item.icon className={cn(
                    "w-5 h-5 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )} />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-3 px-3 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.firstName?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 w-64 bg-card border-r border-border z-50 transform transition-transform duration-300 ease-in-out md:hidden",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <h1 className="text-xl font-bold font-display text-primary">FieldTech</h1>
          <button onClick={() => setIsMobileMenuOpen(false)} className="text-muted-foreground">
            <X className="w-6 h-6" />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {navigation.map((item) => (
            <Link key={item.name} href={item.href} onClick={() => setIsMobileMenuOpen(false)}>
              <div className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                location === item.href 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-muted"
              )}>
                <item.icon className="w-5 h-5" />
                {item.name}
              </div>
            </Link>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 md:ml-64 w-full">
        {/* Mobile Header */}
        <header className="md:hidden bg-card border-b border-border p-4 flex items-center justify-between sticky top-0 z-10">
          <h1 className="font-bold font-display text-lg">FieldTech</h1>
          <button onClick={() => setIsMobileMenuOpen(true)}>
            <Menu className="w-6 h-6 text-foreground" />
          </button>
        </header>

        <main className="p-4 md:p-8 max-w-7xl mx-auto animate-in">
          {children}
        </main>
      </div>
    </div>
  );
}
