import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, Clock } from "lucide-react";
import { useState, useMemo } from "react";
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks } from "date-fns";

type Job = {
  id: number;
  jobNumber: string;
  scheduledDate: string;
  scheduledTimeStart: string;
  serviceType: string;
  status: string;
  customer: { firstName: string; lastName: string };
  technician: { firstName: string; lastName: string } | null;
};

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6);

function getStatusColor(status: string) {
  switch (status) {
    case "scheduled": return "bg-blue-100 border-blue-300 text-blue-800";
    case "en_route": return "bg-amber-100 border-amber-300 text-amber-800";
    case "arrived": return "bg-purple-100 border-purple-300 text-purple-800";
    case "in_progress": return "bg-orange-100 border-orange-300 text-orange-800";
    case "completed": return "bg-emerald-100 border-emerald-300 text-emerald-800";
    case "cancelled": return "bg-red-100 border-red-300 text-red-800";
    default: return "bg-gray-100 border-gray-300 text-gray-800";
  }
}

function parseTime(timeStr: string): number {
  const [hours] = timeStr.split(":").map(Number);
  return hours;
}

export default function Schedule() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );

  const { data: jobs, isLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  const jobsByDayAndHour = useMemo(() => {
    if (!jobs) return {};
    
    const map: Record<string, Record<number, Job[]>> = {};
    
    jobs.forEach(job => {
      if (!job.scheduledDate || !job.scheduledTimeStart) return;
      
      const jobDate = new Date(job.scheduledDate + "T00:00:00");
      const dayKey = format(jobDate, "yyyy-MM-dd");
      const hour = parseTime(job.scheduledTimeStart);
      
      if (!map[dayKey]) map[dayKey] = {};
      if (!map[dayKey][hour]) map[dayKey][hour] = [];
      map[dayKey][hour].push(job);
    });
    
    return map;
  }, [jobs]);

  const goToPreviousWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));
  const goToToday = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));

  const isToday = (date: Date) => isSameDay(date, new Date());

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-8 border-b">
              <Skeleton className="h-12 m-2" />
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-12 m-2" />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-8 border-b">
                <Skeleton className="h-16 m-2" />
                {Array.from({ length: 7 }).map((_, j) => (
                  <Skeleton key={j} className="h-16 m-2" />
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight font-display">Schedule</h2>
          <p className="text-muted-foreground">
            Week of {format(currentWeekStart, "MMMM d, yyyy")}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousWeek} data-testid="button-prev-week">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={goToToday} data-testid="button-today">
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextWeek} data-testid="button-next-week">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-8 border-b bg-muted/30">
                <div className="p-3 text-center text-sm font-medium text-muted-foreground border-r">
                  <Clock className="w-4 h-4 mx-auto" />
                </div>
                {weekDays.map((day, i) => (
                  <div 
                    key={i} 
                    className={`p-3 text-center border-r last:border-r-0 ${
                      isToday(day) ? "bg-primary/10" : ""
                    }`}
                    data-testid={`day-header-${format(day, "yyyy-MM-dd")}`}
                  >
                    <div className="text-xs text-muted-foreground uppercase">
                      {format(day, "EEE")}
                    </div>
                    <div className={`text-lg font-semibold ${
                      isToday(day) ? "text-primary" : ""
                    }`}>
                      {format(day, "d")}
                    </div>
                  </div>
                ))}
              </div>

              {HOURS.map(hour => (
                <div key={hour} className="grid grid-cols-8 border-b last:border-b-0 min-h-[80px]">
                  <div className="p-2 text-xs text-muted-foreground border-r flex items-start justify-center pt-1">
                    {format(new Date().setHours(hour, 0), "h a")}
                  </div>
                  {weekDays.map((day, dayIndex) => {
                    const dayKey = format(day, "yyyy-MM-dd");
                    const dayJobs = jobsByDayAndHour[dayKey]?.[hour] || [];
                    
                    return (
                      <div 
                        key={dayIndex} 
                        className={`p-1 border-r last:border-r-0 ${
                          isToday(day) ? "bg-primary/5" : ""
                        }`}
                        data-testid={`cell-${dayKey}-${hour}`}
                      >
                        {dayJobs.map(job => (
                          <Link key={job.id} href={`/jobs/${job.id}`}>
                            <div 
                              className={`p-2 rounded-md border text-xs cursor-pointer hover:shadow-md transition-shadow mb-1 ${getStatusColor(job.status)}`}
                              data-testid={`job-block-${job.id}`}
                            >
                              <div className="font-semibold truncate">
                                {job.customer.lastName}
                              </div>
                              <div className="truncate opacity-80">
                                {job.serviceType.replace(/_/g, " ")}
                              </div>
                              {job.technician && (
                                <div className="truncate opacity-70 mt-1">
                                  {job.technician.firstName}
                                </div>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Status Legend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-blue-100 border-blue-300 text-blue-800">Scheduled</Badge>
            <Badge variant="outline" className="bg-amber-100 border-amber-300 text-amber-800">En Route</Badge>
            <Badge variant="outline" className="bg-purple-100 border-purple-300 text-purple-800">Arrived</Badge>
            <Badge variant="outline" className="bg-orange-100 border-orange-300 text-orange-800">In Progress</Badge>
            <Badge variant="outline" className="bg-emerald-100 border-emerald-300 text-emerald-800">Completed</Badge>
            <Badge variant="outline" className="bg-red-100 border-red-300 text-red-800">Cancelled</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
