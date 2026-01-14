import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardList, CheckCircle, Circle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { JobChecklistItem } from "@shared/schema";

interface JobChecklistProps {
  jobId: number;
  serviceType: string;
  canEdit?: boolean;
}

export function JobChecklist({ jobId, serviceType, canEdit = true }: JobChecklistProps) {
  const { data: items, isLoading, refetch } = useQuery<JobChecklistItem[]>({
    queryKey: ["/api/jobs", jobId, "checklist"],
  });

  const initChecklist = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/jobs/${jobId}/checklist/initialize`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "checklist"] });
    },
  });

  const toggleItem = useMutation({
    mutationFn: async ({ id, isCompleted }: { id: number; isCompleted: boolean }) => {
      return apiRequest("PUT", `/api/checklist-items/${id}`, { isCompleted });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "checklist"] });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
          <span className="text-sm text-muted-foreground">Loading checklist...</span>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Job Checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            No checklist items yet. Initialize the checklist to get started.
          </p>
          <Button 
            onClick={() => initChecklist.mutate()}
            disabled={initChecklist.isPending}
            variant="outline"
            size="sm"
            className="w-full"
            data-testid="button-init-checklist"
          >
            {initChecklist.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ClipboardList className="w-4 h-4 mr-2" />
            )}
            Load Checklist
          </Button>
        </CardContent>
      </Card>
    );
  }

  const completedCount = items.filter(i => i.isCompleted).length;
  const progress = Math.round((completedCount / items.length) * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Job Checklist
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/{items.length} ({progress}%)
          </span>
        </div>
        <div className="w-full bg-muted h-2 rounded-full mt-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div 
            key={item.id}
            className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
              item.isCompleted ? "bg-green-500/5" : "bg-muted/50"
            }`}
          >
            {canEdit ? (
              <Checkbox
                checked={item.isCompleted ?? false}
                onCheckedChange={(checked) => {
                  toggleItem.mutate({ id: item.id, isCompleted: !!checked });
                }}
                disabled={toggleItem.isPending}
                data-testid={`checkbox-step-${item.stepNumber}`}
              />
            ) : (
              item.isCompleted ? (
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              )
            )}
            <div className="flex-1">
              <span className={`text-sm ${item.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                {item.stepNumber}. {item.label}
              </span>
            </div>
          </div>
        ))}
        
        {completedCount === items.length && (
          <div className="flex items-center gap-2 text-green-600 p-3 bg-green-500/10 rounded-lg mt-4">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">All steps completed!</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
