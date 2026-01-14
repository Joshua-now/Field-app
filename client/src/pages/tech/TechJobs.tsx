import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MobileLayout } from "@/components/MobileLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Clock, Phone, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { Job, Customer, Technician } from "@shared/schema";

type JobWithRelations = Job & { customer: Customer; technician: Technician | null };

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  assigned: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  en_route: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  arrived: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  in_progress: "bg-green-500/10 text-green-600 border-green-500/20",
  completed: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
};

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  assigned: "Assigned",
  en_route: "En Route",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function TechJobs() {
  const { data: jobs, isLoading } = useQuery<JobWithRelations[]>({
    queryKey: ["/api/jobs"],
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const todaysJobs = jobs?.filter(j => j.scheduledDate === today && j.status !== "completed" && j.status !== "cancelled") || [];
  const completedToday = jobs?.filter(j => j.scheduledDate === today && j.status === "completed") || [];

  if (isLoading) {
    return (
      <MobileLayout title="My Jobs">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="My Jobs">
      <div className="p-4 space-y-4">
        <div className="text-sm text-muted-foreground mb-2">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </div>

        {todaysJobs.length === 0 && completedToday.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No jobs scheduled for today</p>
          </Card>
        ) : (
          <>
            {todaysJobs.length > 0 && (
              <div className="space-y-3">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Active Jobs</h2>
                {todaysJobs.map((job) => (
                  <Link key={job.id} href={`/tech/job/${job.id}`}>
                    <Card className="p-4 hover-elevate cursor-pointer" data-testid={`job-card-${job.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={statusColors[job.status as string] || statusColors.scheduled}>
                              {statusLabels[job.status as string] || job.status}
                            </Badge>
                            {job.priority === "urgent" && (
                              <Badge variant="destructive">Urgent</Badge>
                            )}
                          </div>
                          <h3 className="font-semibold text-foreground truncate">
                            {job.customer.firstName} {job.customer.lastName}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-1">{job.description}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                      
                      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{job.scheduledTimeStart?.slice(0, 5)}</span>
                          {job.estimatedDurationMinutes && (
                            <span className="text-xs">({job.estimatedDurationMinutes} min)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span className="truncate">
                            {job.customer.addressStreet}, {job.customer.addressCity}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          <a 
                            href={`tel:${job.customer.phone}`} 
                            className="text-primary"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`call-customer-${job.id}`}
                          >
                            {job.customer.phone}
                          </a>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}

            {completedToday.length > 0 && (
              <div className="space-y-3 mt-6">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Completed Today ({completedToday.length})</h2>
                {completedToday.map((job) => (
                  <Link key={job.id} href={`/tech/job/${job.id}`}>
                    <Card className="p-4 opacity-75 cursor-pointer" data-testid={`job-card-${job.id}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-foreground">
                            {job.customer.firstName} {job.customer.lastName}
                          </h3>
                          <p className="text-sm text-muted-foreground">{job.description}</p>
                        </div>
                        <Badge className={statusColors.completed}>Done</Badge>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </MobileLayout>
  );
}
