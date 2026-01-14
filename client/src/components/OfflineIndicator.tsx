import { useOffline } from "@/hooks/use-offline";
import { Wifi, WifiOff, RefreshCw, Loader2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function OfflineIndicator() {
  const { isOnline, queueCount, isSyncing, syncNow } = useOffline();

  if (isOnline && queueCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:hidden space-y-2">
      {!isOnline && (
        <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <Camera className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Photo uploads require an internet connection. Status updates are saved.
          </AlertDescription>
        </Alert>
      )}
      <div className={`rounded-lg p-3 shadow-lg flex items-center justify-between ${
        isOnline ? 'bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100' : 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100'
      }`}>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi className="h-5 w-5" />
          ) : (
            <WifiOff className="h-5 w-5" />
          )}
          <div>
            <p className="font-medium text-sm">
              {isOnline ? 'Back online' : 'You are offline'}
            </p>
            {queueCount > 0 && (
              <p className="text-xs opacity-75">
                {queueCount} pending {queueCount === 1 ? 'update' : 'updates'}
              </p>
            )}
          </div>
        </div>
        
        {isOnline && queueCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={syncNow}
            disabled={isSyncing}
            className="text-current hover:bg-amber-200 dark:hover:bg-amber-800"
            data-testid="button-sync-now"
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1">Sync</span>
          </Button>
        )}
      </div>
    </div>
  );
}

export function OfflineBadge() {
  const { isOnline, queueCount } = useOffline();

  if (isOnline && queueCount === 0) {
    return null;
  }

  return (
    <Badge 
      variant={isOnline ? "secondary" : "destructive"} 
      className="flex items-center gap-1"
      data-testid="badge-offline-status"
    >
      {isOnline ? (
        <Wifi className="h-3 w-3" />
      ) : (
        <WifiOff className="h-3 w-3" />
      )}
      {queueCount > 0 && <span>{queueCount}</span>}
    </Badge>
  );
}
