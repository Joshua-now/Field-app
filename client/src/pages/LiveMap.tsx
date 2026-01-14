import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Phone, Navigation, Clock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

type Technician = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  specialties: string[] | null;
  isActive: boolean;
  currentLocationLat: string | null;
  currentLocationLng: string | null;
  lastLocationUpdate: string | null;
};

type JobWithRelations = {
  id: number;
  jobNumber: string;
  status: string;
  technicianId: number | null;
  customer: {
    firstName: string;
    lastName: string;
    addressStreet: string;
    addressCity: string;
  };
};

const statusColors: Record<string, string> = {
  available: "bg-green-500",
  en_route: "bg-yellow-500",
  on_site: "bg-blue-500",
  offline: "bg-gray-400",
};

export default function LiveMap() {
  const [selectedTech, setSelectedTech] = useState<number | null>(null);

  const { data: technicians, isLoading: loadingTechs, refetch: refetchTechs } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
    refetchInterval: 30000,
  });

  const { data: jobs } = useQuery<JobWithRelations[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 30000,
  });

  const activeTechs = technicians?.filter(t => t.isActive) || [];

  const getTechStatus = (tech: Technician) => {
    const activeJob = jobs?.find(j => 
      j.technicianId === tech.id && 
      ["en_route", "arrived", "in_progress"].includes(j.status)
    );
    if (!tech.lastLocationUpdate) return "offline";
    if (activeJob?.status === "en_route") return "en_route";
    if (activeJob?.status === "arrived" || activeJob?.status === "in_progress") return "on_site";
    return "available";
  };

  const getTechCurrentJob = (techId: number) => {
    return jobs?.find(j => 
      j.technicianId === techId && 
      ["en_route", "arrived", "in_progress"].includes(j.status)
    );
  };

  if (loadingTechs) {
    return (
      <Layout>
        <div className="p-6">
          <Skeleton className="h-[600px] w-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Live Tracking</h1>
            <p className="text-muted-foreground">Real-time technician locations</p>
          </div>
          <Button variant="outline" onClick={() => refetchTechs()} data-testid="button-refresh-map">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Map View
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative bg-muted rounded-lg h-[500px] flex items-center justify-center">
                  <div className="absolute inset-0 p-4">
                    <div className="grid grid-cols-3 gap-4 h-full">
                      {activeTechs.map((tech) => {
                        const status = getTechStatus(tech);
                        const currentJob = getTechCurrentJob(tech.id);
                        const isSelected = selectedTech === tech.id;
                        
                        return (
                          <div
                            key={tech.id}
                            className={`relative rounded-lg p-4 cursor-pointer transition-all ${
                              isSelected ? "ring-2 ring-primary bg-card" : "bg-background/50 hover:bg-card"
                            }`}
                            onClick={() => setSelectedTech(isSelected ? null : tech.id)}
                            data-testid={`tech-marker-${tech.id}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-3 h-3 rounded-full ${statusColors[status]} animate-pulse`} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {tech.firstName} {tech.lastName}
                                </p>
                                <p className="text-xs text-muted-foreground capitalize">
                                  {status.replace("_", " ")}
                                </p>
                                {currentJob && (
                                  <p className="text-xs text-primary mt-1 truncate">
                                    {currentJob.customer.firstName} {currentJob.customer.lastName}
                                  </p>
                                )}
                                {tech.lastLocationUpdate && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Updated {formatDistanceToNow(new Date(tech.lastLocationUpdate))} ago
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {activeTechs.length === 0 && (
                    <p className="text-muted-foreground">No active technicians</p>
                  )}
                </div>
                
                <div className="flex items-center gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span>Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span>En Route</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span>On Site</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-400" />
                    <span>Offline</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Technician List</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeTechs.map((tech) => {
                  const status = getTechStatus(tech);
                  const currentJob = getTechCurrentJob(tech.id);
                  
                  return (
                    <div
                      key={tech.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedTech === tech.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                      }`}
                      onClick={() => setSelectedTech(selectedTech === tech.id ? null : tech.id)}
                      data-testid={`tech-list-item-${tech.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {tech.firstName} {tech.lastName}
                          </p>
                          <Badge variant="outline" className="mt-1 capitalize text-xs">
                            {status.replace("_", " ")}
                          </Badge>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${statusColors[status]}`} />
                      </div>
                      
                      {currentJob && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          <p className="flex items-center gap-1">
                            <Navigation className="w-3 h-3" />
                            {currentJob.customer.addressStreet}
                          </p>
                        </div>
                      )}
                      
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`tel:${tech.phone}`, "_self");
                          }}
                          data-testid={`call-tech-${tech.id}`}
                        >
                          <Phone className="w-3 h-3 mr-1" />
                          Call
                        </Button>
                      </div>
                    </div>
                  );
                })}
                
                {activeTechs.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No active technicians
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Active Jobs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {jobs?.filter(j => ["en_route", "arrived", "in_progress"].includes(j.status)).map((job) => {
                  const tech = technicians?.find(t => t.id === job.technicianId);
                  return (
                    <div key={job.id} className="p-2 rounded border text-sm">
                      <p className="font-medium">{job.customer.firstName} {job.customer.lastName}</p>
                      <p className="text-muted-foreground text-xs">
                        {tech ? `${tech.firstName} ${tech.lastName}` : "Unassigned"} - {job.status.replace("_", " ")}
                      </p>
                    </div>
                  );
                })}
                {jobs?.filter(j => ["en_route", "arrived", "in_progress"].includes(j.status)).length === 0 && (
                  <p className="text-center text-muted-foreground py-2 text-sm">
                    No active jobs
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
