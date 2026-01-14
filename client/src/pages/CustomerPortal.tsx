import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Phone, Mail, Calendar, Clock, CheckCircle, Truck, Wrench, MapPin } from "lucide-react";
import { format } from "date-fns";
import { appConfig } from "@/lib/config";

type Job = {
  id: number;
  jobNumber: string;
  scheduledDate: string;
  scheduledTimeStart: string;
  serviceType: string;
  status: string;
  description: string;
  workPerformed: string | null;
  completedAt: string | null;
  technician: { firstName: string; lastName: string } | null;
};

type Customer = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  scheduled: { label: "Scheduled", color: "bg-blue-500/10 text-blue-600", icon: Calendar },
  assigned: { label: "Technician Assigned", color: "bg-purple-500/10 text-purple-600", icon: Wrench },
  en_route: { label: "Technician On The Way", color: "bg-yellow-500/10 text-yellow-600", icon: Truck },
  arrived: { label: "Technician Arrived", color: "bg-orange-500/10 text-orange-600", icon: MapPin },
  in_progress: { label: "Work In Progress", color: "bg-green-500/10 text-green-600", icon: Wrench },
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-600", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-500/10 text-red-600", icon: Calendar },
};

export default function CustomerPortal() {
  const [searchPhone, setSearchPhone] = useState("");
  const [searchedPhone, setSearchedPhone] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const { data: customerData, isLoading, refetch } = useQuery<{ customer: Customer; jobs: Job[] } | null>({
    queryKey: ["/api/customer-portal", searchedPhone],
    queryFn: async () => {
      if (!searchedPhone) return null;
      const res = await fetch(`/api/customer-portal/lookup?phone=${encodeURIComponent(searchedPhone)}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to lookup");
      }
      return res.json();
    },
    enabled: !!searchedPhone,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchPhone.trim()) {
      setSearchedPhone(searchPhone.trim());
    }
  };

  const activeJobs = customerData?.jobs?.filter(j => j.status !== "completed" && j.status !== "cancelled") || [];
  const pastJobs = customerData?.jobs?.filter(j => j.status === "completed" || j.status === "cancelled") || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl font-bold">{appConfig.companyName}</h1>
          <p className="text-primary-foreground/80">Customer Service Portal</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Look Up Your Service
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-3">
              <Input
                type="tel"
                placeholder="Enter your phone number"
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                className="flex-1"
                data-testid="input-phone-search"
              />
              <Button type="submit" disabled={!searchPhone.trim()} data-testid="button-search">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </Button>
            </form>
            <p className="text-sm text-muted-foreground mt-2">
              Enter the phone number associated with your account to view your service history.
            </p>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {searchedPhone && !isLoading && !customerData && (
          <Card className="text-center py-8">
            <CardContent>
              <p className="text-muted-foreground">No account found with that phone number.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Please contact us at {appConfig.supportPhone || appConfig.supportEmail} for assistance.
              </p>
            </CardContent>
          </Card>
        )}

        {customerData && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Welcome, {customerData.customer.firstName}!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  {customerData.customer.addressStreet}, {customerData.customer.addressCity}, {customerData.customer.addressState} {customerData.customer.addressZip}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  {customerData.customer.phone}
                </div>
                {customerData.customer.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    {customerData.customer.email}
                  </div>
                )}
              </CardContent>
            </Card>

            {activeJobs.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4">Current Service</h2>
                <div className="space-y-4">
                  {activeJobs.map((job) => {
                    const status = statusConfig[job.status] || statusConfig.scheduled;
                    const StatusIcon = status.icon;
                    return (
                      <Card key={job.id} className="border-l-4 border-l-primary">
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <div>
                              <Badge className={status.color}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {status.label}
                              </Badge>
                              <p className="font-medium mt-2">{job.serviceType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                            </div>
                            <div className="text-right text-sm text-muted-foreground">
                              <div className="flex items-center gap-1 justify-end">
                                <Calendar className="w-4 h-4" />
                                {format(new Date(job.scheduledDate), "MMM d, yyyy")}
                              </div>
                              <div className="flex items-center gap-1 justify-end mt-1">
                                <Clock className="w-4 h-4" />
                                {job.scheduledTimeStart?.slice(0, 5)}
                              </div>
                            </div>
                          </div>
                          
                          {job.description && (
                            <p className="text-sm text-muted-foreground mb-3">{job.description}</p>
                          )}
                          
                          {job.technician && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">Technician:</span>{" "}
                              {job.technician.firstName} {job.technician.lastName}
                            </p>
                          )}

                          {job.status === "en_route" && (
                            <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg text-sm">
                              Your technician is on the way! They should arrive shortly.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {pastJobs.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Service History</h2>
                <div className="space-y-3">
                  {pastJobs.slice(0, 10).map((job) => (
                    <Card key={job.id}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{job.serviceType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(job.scheduledDate), "MMM d, yyyy")}
                            </p>
                          </div>
                          <Badge variant={job.status === "completed" ? "default" : "secondary"}>
                            {job.status === "completed" ? "Completed" : "Cancelled"}
                          </Badge>
                        </div>
                        {job.workPerformed && (
                          <p className="text-sm text-muted-foreground mt-2 border-t pt-2">
                            {job.workPerformed}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {activeJobs.length === 0 && pastJobs.length === 0 && (
              <Card className="text-center py-8">
                <CardContent>
                  <p className="text-muted-foreground">No service records found.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>Need help? Contact us:</p>
          {appConfig.supportPhone && <p className="font-medium">{appConfig.supportPhone}</p>}
          {appConfig.supportEmail && <p>{appConfig.supportEmail}</p>}
        </div>
      </main>
    </div>
  );
}
