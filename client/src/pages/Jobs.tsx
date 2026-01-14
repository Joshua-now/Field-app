import { useJobs, useCreateJob } from "@/hooks/use-jobs";
import { useTechnicians } from "@/hooks/use-technicians";
import { useCustomers } from "@/hooks/use-customers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Calendar as CalendarIcon, Filter, Clock, Briefcase, Users } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertJobSchema } from "@shared/schema";

// Form Schema adjustment for Selects/Dates
const formSchema = insertJobSchema.extend({
  customerId: z.coerce.number(),
  technicianId: z.coerce.number(),
  scheduledDate: z.coerce.date().transform(d => format(d, 'yyyy-MM-dd')),
});

export default function Jobs() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: jobs, isLoading } = useJobs();
  const { data: technicians } = useTechnicians();
  const { data: customers } = useCustomers();
  const createJob = useCreateJob();

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: undefined as unknown as number,
      technicianId: undefined as unknown as number,
      scheduledDate: format(new Date(), 'yyyy-MM-dd'),
      scheduledTimeStart: "09:00",
      estimatedDurationMinutes: 60,
      priority: "normal",
      status: "scheduled",
      serviceType: "repair",
      description: "",
      jobNumber: `JOB-${Date.now()}`,
    }
  });

  const onSubmit = async (data: any) => {
    try {
      await createJob.mutateAsync(data);
      setIsDialogOpen(false);
      form.reset();
    } catch (error) {
      console.error(error);
    }
  };

  const filteredJobs = jobs?.filter(job => {
    const matchesSearch = 
      job.jobNumber.toLowerCase().includes(search.toLowerCase()) ||
      job.customer.lastName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight font-display">Jobs</h2>
          <p className="text-muted-foreground">Manage service appointments and work orders.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4 mr-2" />
              New Job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Job</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Customer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers?.map(c => (
                              <SelectItem key={c.id} value={c.id.toString()}>
                                {c.firstName} {c.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="technicianId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Technician</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Assign Tech" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {technicians?.map(t => (
                              <SelectItem key={t.id} value={t.id.toString()}>
                                {t.firstName} {t.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scheduledDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scheduledTimeStart"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="serviceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Type</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. HVAC Repair" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Job details..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={createJob.isPending}>
                  {createJob.isPending ? "Creating..." : "Create Job"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-card p-4 rounded-xl border border-border/50 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by Job # or Customer..." 
            className="pl-9 bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-background">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Job List */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading jobs...</div>
        ) : filteredJobs?.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-xl border border-dashed border-border">
            <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No jobs found</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your filters or create a new job.</p>
          </div>
        ) : (
          filteredJobs?.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer group border-border/50">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg group-hover:text-primary transition-colors">
                          {job.jobNumber}
                        </span>
                        <StatusBadge status={job.status || "scheduled"} />
                      </div>
                      <p className="font-medium text-foreground">
                        {job.customer.firstName} {job.customer.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {job.description || "No description provided."}
                      </p>
                    </div>

                    <div className="flex flex-col md:items-end gap-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4" />
                        <span>{format(new Date(job.scheduledDate), "EEE, MMM d, yyyy")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{job.scheduledTimeStart}</span>
                      </div>
                      {job.technician && (
                        <div className="flex items-center gap-2 mt-1">
                          <Users className="w-4 h-4" />
                          <span className="text-foreground font-medium">
                            {job.technician.firstName} {job.technician.lastName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
