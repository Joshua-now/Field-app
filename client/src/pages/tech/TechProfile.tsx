import { MobileLayout } from "@/components/MobileLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, User, Settings, Bell, HelpCircle } from "lucide-react";

export default function TechProfile() {
  const { user, logout } = useAuth();

  return (
    <MobileLayout title="Profile">
      <div className="p-4 space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold">
              {user?.firstName?.[0] || 'U'}
            </div>
            <div>
              <h2 className="text-xl font-bold">{user?.firstName} {user?.lastName}</h2>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </Card>

        <Card className="divide-y divide-border">
          <button className="w-full p-4 flex items-center gap-3 text-left hover-elevate" data-testid="button-settings">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <span>Settings</span>
          </button>
          <button className="w-full p-4 flex items-center gap-3 text-left hover-elevate" data-testid="button-notifications">
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span>Notifications</span>
          </button>
          <button className="w-full p-4 flex items-center gap-3 text-left hover-elevate" data-testid="button-help">
            <HelpCircle className="w-5 h-5 text-muted-foreground" />
            <span>Help & Support</span>
          </button>
        </Card>

        <Button 
          variant="destructive" 
          className="w-full"
          onClick={() => logout()}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </MobileLayout>
  );
}
