import { useJobs } from "@/hooks/use-jobs";
import { useTechnicians } from "@/hooks/use-technicians";
import { getToken } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { 
  Briefcase, 
  Users, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  Wrench,
  Database,
  Loader2,
  CheckCircle
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const { data: jobs, isLoading: loadingJobs, isError: jobsError } = useJobs();
  const { data: technicians, isLoading: loadingTechs, isError: techsError } = useTechnicians();
  const queryClient = useQueryClient();
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  const isEmpty = !loadingJobs && !loadingTechs && (!jobs || jobs.length === 0) && (!technicians || technicians.length === 0);

  async function handleSeed() {
    setSeeding(true);
    setSeedError(null);
    try {
      const token = getToken();
      const res = await fetch("/api/admin/seed-demo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Seed failed");
      setSeedDone(true);
      // Refresh all data
      await queryClient.invalidateQueries();
    } catch (err: any) {
      setSeedError(err.message);
    } finally {
      setSeeding(false);
    }
  }

  if (jobsError || techsError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
        <p className="text-xl font-semibold text-destructive">Failed to load dashboard data</p>
        <p className="text-muted-foreground text-sm">Check your connection and refresh the page.</p>
      </div>
    );
  }

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
      </div>
    );
  }

  // Stats Calculations
  const today = format(new Date(), "yyyy-MM-dd");
  const todaysJobs = jobs?.filter(j => j.scheduledDate === today) || [];
  const completedJobs = jobs?.filter(j => j.status === "completed") || [];
  const activeJobs = jobs?.filter(j => ["in_progress", "en_route", "arrived"].includes(j.status || "")) || [];
  
  const stats = [
    { title: "Jobs Today", value: todaysJobs.length, icon: Briefcase, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Active Now", value: activeJobs.length, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { title: "Completed Total", value: completedJobs.length, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "Technicians", value: technicians?.length || 0, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
  ];

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

      {/* Empty state — show seed button */}
      {isEmpty && !seedDone && (
        <Card className="border-dashed border-2 border-border bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Database className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">No data yet</h3>
              <p className="text-muted-foreground text-sm max-w-sm">
                Load demo data to see what the app looks like with real jobs, customers, and technicians.
              </p>
            </div>
            {seedError && (
              <p className="text-sm text-destructive">{seedError}</p>
            )}
            <Button onClick={handleSeed} disabled={seeding} size="lg">
              {seeding ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading demo data…</>
              ) : (
                <><Database className="w-4 h-4 mr-2" />Load Demo Data</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {seedDone && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-800 font-medium">
              Demo data loaded — 3 technicians, 5 customers, 8 jobs. The page will update automatically.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-border/50 shadow-sm hover:shadow-md transition-shadow" data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg ${stat.bg}`}>
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
                      <p className="text-sm font-medium">{format(new Date(job.scheduledDate), "MMM d")}</p>
                      <p className="text-xs text-muted-foreground">{job.scheduledTimeStart}</p>
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
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Technician Status Quick View */}
      {technicians && technicians.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Active Technicians</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {technicians.map((tech) => (
                <div key={tech.id} className="flex items-start space-x-4 p-4 rounded-xl bg-muted/50" data-testid={`card-tech-${tech.id}`}>
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {tech.firstName[0]}{tech.lastName[0]}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm" data-testid={`text-tech-name-${tech.id}`}>{tech.firstName} {tech.lastName}</h4>
                    <p className="text-xs text-muted-foreground mb-2">{tech.phone}</p>
                    <div className="flex items-center text-xs text-muted-foreground gap-1">
                      <Wrench className="w-3 h-3" />
                      <span data-testid={`text-tech-specialties-${tech.id}`}>{tech.specialties?.join(", ") || "General"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
