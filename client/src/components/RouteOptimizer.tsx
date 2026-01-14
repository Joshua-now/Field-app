import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Route, Loader2, Navigation, MapPin } from "lucide-react";
import type { Job, Customer } from "@shared/schema";

type JobWithCustomer = Job & { customer: Customer };

interface RouteOptimizerProps {
  jobs: JobWithCustomer[];
  onOptimized?: (orderedJobIds: number[]) => void;
}

interface OptimizeResult {
  optimizedOrder: number[];
  jobs: { id: number; jobNumber: string; customer: { name: string; address: string } | null }[];
  totalDistanceMiles: number | null;
  message?: string;
}

export function RouteOptimizer({ jobs, onOptimized }: RouteOptimizerProps) {
  const [selectedJobs, setSelectedJobs] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const { toast } = useToast();

  const optimizeMutation = useMutation({
    mutationFn: async (jobIds: number[]) => {
      const response = await apiRequest("POST", "/api/optimize-route", { jobIds });
      return response.json() as Promise<OptimizeResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.message) {
        toast({ title: "Note", description: data.message });
      } else {
        toast({ 
          title: "Route Optimized", 
          description: `Estimated ${data.totalDistanceMiles} miles total` 
        });
      }
      onOptimized?.(data.optimizedOrder);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const toggleJob = (jobId: number) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
    setResult(null);
  };

  const selectAll = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map(j => j.id)));
    }
    setResult(null);
  };

  const handleOptimize = () => {
    if (selectedJobs.size < 2) {
      toast({ title: "Select at least 2 jobs", variant: "destructive" });
      return;
    }
    optimizeMutation.mutate(Array.from(selectedJobs));
  };

  const openMapsRoute = () => {
    if (!result?.jobs) return;
    
    const addresses = result.jobs
      .filter(j => j.customer?.address)
      .map(j => encodeURIComponent(j.customer!.address));
    
    if (addresses.length < 2) return;
    
    const origin = addresses[0];
    const destination = addresses[addresses.length - 1];
    const waypoints = addresses.slice(1, -1).join('|');
    
    const url = waypoints 
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}`
      : `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    
    window.open(url, '_blank');
  };

  const pendingJobs = jobs.filter(j => 
    j.status === 'scheduled' || j.status === 'assigned'
  );

  if (pendingJobs.length < 2) {
    return null;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Route className="h-4 w-4" />
            Route Optimizer
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={selectAll} data-testid="button-select-all-jobs">
            {selectedJobs.size === pendingJobs.length ? "Deselect All" : "Select All"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {pendingJobs.map((job, index) => (
            <div 
              key={job.id} 
              className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
            >
              <Checkbox
                checked={selectedJobs.has(job.id)}
                onCheckedChange={() => toggleJob(job.id)}
                data-testid={`checkbox-job-${job.id}`}
              />
              {result && result.optimizedOrder.includes(job.id) && (
                <Badge variant="secondary" className="w-6 h-6 flex items-center justify-center p-0">
                  {result.optimizedOrder.indexOf(job.id) + 1}
                </Badge>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{job.jobNumber}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {job.customer?.firstName} {job.customer?.lastName} - {job.customer?.addressCity}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={handleOptimize}
            disabled={selectedJobs.size < 2 || optimizeMutation.isPending}
            className="flex-1"
            data-testid="button-optimize-route"
          >
            {optimizeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Route className="h-4 w-4 mr-2" />
            )}
            Optimize ({selectedJobs.size} jobs)
          </Button>
          
          {result && result.jobs && result.jobs.length >= 2 && (
            <Button variant="outline" onClick={openMapsRoute} data-testid="button-open-maps">
              <Navigation className="h-4 w-4 mr-2" />
              Navigate
            </Button>
          )}
        </div>

        {result && (
          <div className="p-3 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {result.totalDistanceMiles !== null 
                  ? `Optimized: ${result.totalDistanceMiles} miles total`
                  : result.message || "Route calculated"
                }
              </span>
            </div>
            {result.jobs && (
              <div className="mt-2 text-xs text-muted-foreground">
                Order: {result.jobs.map((j, i) => (
                  <span key={j.id}>
                    {i > 0 && " → "}
                    {j.jobNumber}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
