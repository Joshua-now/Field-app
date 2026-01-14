import { useJobs } from "@/hooks/use-jobs";
import { useTechnicians } from "@/hooks/use-technicians";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { 
  Briefcase, 
  Users, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  MapPin
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const { data: jobs, isLoading: loadingJobs } = useJobs();
  const { data: technicians, isLoading: loadingTechs } = useTechnicians();

  if (loadingJobs || loadingTechs) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-9 w-40 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/50 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-8 md:grid-cols-7">
          <Card className="md:col-span-4 border-border/50 shadow-sm">
            <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between pb-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="md:col-span-3 border-border/50 shadow-sm">
            <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Stats Calculations
  const today = format(new Date(), "yyyy-MM-dd");
  const todaysJobs = jobs?.filter(j => j.scheduledDate === today) || [];
  const completedJobs = jobs?.filter(j => j.status === "completed") || [];
  const activeJobs = jobs?.filter(j => ["in_progress", "en_route", "arrived"].includes(j.status || "")) || [];
  
  const stats = [
    { 
      title: "Jobs Today", 
      value: todaysJobs.length, 
      icon: Briefcase, 
      color: "text-blue-600",
      bg: "bg-blue-50"
    },
    { 
      title: "Active Now", 
      value: activeJobs.length, 
      icon: Clock, 
      color: "text-amber-600",
      bg: "bg-amber-50"
    },
    { 
      title: "Completed Total", 
      value: completedJobs.length, 
      icon: CheckCircle2, 
      color: "text-emerald-600",
      bg: "bg-emerald-50"
    },
    { 
      title: "Technicians", 
      value: technicians?.length || 0, 
      icon: Users, 
      color: "text-purple-600",
      bg: "bg-purple-50"
    },
  ];

  // Chart Data (Mock - aggregated by status)
  const chartData = [
    { name: "Scheduled", count: jobs?.filter(j => j.status === "scheduled").length || 0 },
    { name: "In Progress", count: activeJobs.length },
    { name: "Completed", count: completedJobs.length },
    { name: "Cancelled", count: jobs?.filter(j => j.status === "cancelled").length || 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground font-display">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Overview of your field operations.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-border/50 shadow-sm hover:shadow-md transition-shadow" data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bg} dark:bg-opacity-20`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground" data-testid={`text-stat-value-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 md:grid-cols-7">
        {/* Recent Jobs List */}
        <Card className="md:col-span-4 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {jobs?.slice(0, 5).map((job) => (
                <div key={job.id} className="flex items-center justify-between border-b border-border/50 last:border-0 pb-4 last:pb-0">
                  <div className="space-y-1">
                    <Link href={`/jobs/${job.id}`}>
                      <span className="text-sm font-semibold hover:underline cursor-pointer" data-testid={`link-job-${job.id}`}>
                        {job.jobNumber}
                      </span>
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {job.customer.firstName} {job.customer.lastName}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={job.status || "scheduled"} />
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium">
                        {format(new Date(job.scheduledDate), "MMM d")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {job.scheduledTimeStart}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {(!jobs || jobs.length === 0) && (
                <p className="text-muted-foreground text-sm text-center py-4">No jobs found.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Analytics Chart */}
        <Card className="md:col-span-3 border-border/50 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Job Status Overview</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pl-0">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#64748b" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#64748b" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    allowDecimals={false}
                  />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]} 
                    barSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Technician Status Quick View */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle>Active Technicians</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {technicians?.map((tech) => (
              <div key={tech.id} className="flex items-start space-x-4 p-4 rounded-xl bg-muted/50" data-testid={`card-tech-${tech.id}`}>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {tech.firstName[0]}{tech.lastName[0]}
                </div>
                <div>
                  <h4 className="font-semibold text-sm" data-testid={`text-tech-name-${tech.id}`}>{tech.firstName} {tech.lastName}</h4>
                  <p className="text-xs text-muted-foreground mb-2">{tech.phone}</p>
                  <div className="flex items-center text-xs text-muted-foreground gap-1">
                    <MapPin className="w-3 h-3" />
                    <span data-testid={`text-tech-location-${tech.id}`}>
                      {tech.currentLocationLat ? "Location Active" : "No Location Data"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
