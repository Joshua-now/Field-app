import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { MobileLayout } from "@/components/MobileLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Loader2, MapPin, Phone, Clock, Navigation, Camera, 
  CheckCircle, ArrowRight, Play, AlertCircle, PenTool
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import type { Job, Customer, Technician, JobPhoto } from "@shared/schema";
import { SignatureCapture } from "@/components/SignatureCapture";

type JobWithRelations = Job & { customer: Customer; technician: Technician | null };

const statusFlow = ["scheduled", "assigned", "en_route", "arrived", "in_progress", "completed"];

const statusConfig: Record<string, { label: string; color: string; nextLabel: string; nextIcon: any }> = {
  scheduled: { label: "Scheduled", color: "bg-blue-500", nextLabel: "Start Route", nextIcon: Navigation },
  assigned: { label: "Assigned", color: "bg-purple-500", nextLabel: "Start Route", nextIcon: Navigation },
  en_route: { label: "En Route", color: "bg-yellow-500", nextLabel: "Mark Arrived", nextIcon: MapPin },
  arrived: { label: "On Site", color: "bg-orange-500", nextLabel: "Start Work", nextIcon: Play },
  in_progress: { label: "Working", color: "bg-green-500", nextLabel: "Complete Job", nextIcon: CheckCircle },
  completed: { label: "Completed", color: "bg-gray-500", nextLabel: "", nextIcon: null },
  cancelled: { label: "Cancelled", color: "bg-red-500", nextLabel: "", nextIcon: null },
};

export default function TechJobDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [showSignature, setShowSignature] = useState(false);

  const { data: job, isLoading } = useQuery<JobWithRelations>({
    queryKey: ["/api/jobs", id],
  });

  const { data: photos } = useQuery<JobPhoto[]>({
    queryKey: ["/api/jobs", id, "photos"],
    enabled: !!id,
  });

  const updateStatus = useMutation({
    mutationFn: async (data: { status: string; customerSignatureUrl?: string; workPerformed?: string }) => {
      return apiRequest("PUT", `/api/jobs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Status updated" });
      setShowSignature(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Cannot update status", 
        description: error.message || "Invalid status transition",
        variant: "destructive" 
      });
    },
  });

  const handleCompleteWithSignature = (signatureDataUrl: string) => {
    updateStatus.mutate({
      status: "completed",
      customerSignatureUrl: signatureDataUrl,
      workPerformed: notes || undefined
    });
  };

  const handleNextStatus = () => {
    if (nextStatus === "completed") {
      setShowSignature(true);
    } else if (nextStatus) {
      updateStatus.mutate({ status: nextStatus });
    }
  };

  const getNextStatus = (current: string): string | null => {
    const idx = statusFlow.indexOf(current);
    if (idx === -1 || idx >= statusFlow.length - 1) return null;
    return statusFlow[idx + 1];
  };

  if (isLoading || !job) {
    return (
      <MobileLayout title="Job Details" showBack onBack={() => setLocation("/tech")}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MobileLayout>
    );
  }

  const config = statusConfig[job.status as keyof typeof statusConfig] || statusConfig.scheduled;
  const nextStatus = getNextStatus(job.status as string);
  const NextIcon = config.nextIcon;

  const openMaps = () => {
    const address = `${job.customer.addressStreet}, ${job.customer.addressCity}, ${job.customer.addressState} ${job.customer.addressZip}`;
    window.open(`https://maps.google.com/?q=${encodeURIComponent(address)}`, "_blank");
  };

  const callCustomer = () => {
    window.location.href = `tel:${job.customer.phone}`;
  };

  return (
    <MobileLayout title={`Job #${job.jobNumber}`} showBack onBack={() => setLocation("/tech")}>
      <div className="p-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <Badge className={`${config.color} text-white`}>
              {config.label}
            </Badge>
            {job.priority === "urgent" && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Urgent
              </Badge>
            )}
          </div>

          <h2 className="text-xl font-bold mb-1">
            {job.customer.firstName} {job.customer.lastName}
          </h2>
          <p className="text-muted-foreground mb-4">{job.description}</p>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>
                {job.scheduledTimeStart?.slice(0, 5)} - {job.estimatedDurationMinutes} min estimated
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3">Location</h3>
          <p className="text-sm text-muted-foreground mb-3">
            {job.customer.addressStreet}<br />
            {job.customer.addressCity}, {job.customer.addressState} {job.customer.addressZip}
          </p>
          {job.customer.gateCode && (
            <p className="text-sm mb-3">
              <span className="font-medium">Gate Code:</span> {job.customer.gateCode}
            </p>
          )}
          {job.customer.accessNotes && (
            <p className="text-sm text-muted-foreground mb-3">
              <span className="font-medium text-foreground">Notes:</span> {job.customer.accessNotes}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={openMaps} className="flex-1" data-testid="button-navigate">
              <Navigation className="w-4 h-4 mr-2" />
              Navigate
            </Button>
            <Button onClick={callCustomer} variant="outline" className="flex-1" data-testid="button-call">
              <Phone className="w-4 h-4 mr-2" />
              Call
            </Button>
          </div>
        </Card>

        {job.specialInstructions && (
          <Card className="p-4 border-yellow-500/50 bg-yellow-500/5">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              Special Instructions
            </h3>
            <p className="text-sm">{job.specialInstructions}</p>
          </Card>
        )}

        <Card className="p-4">
          <h3 className="font-semibold mb-3">Photos ({photos?.length || 0})</h3>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {photos?.slice(0, 6).map((photo) => (
              <div key={photo.id} className="aspect-square rounded-lg bg-muted overflow-hidden">
                <img src={photo.photoUrl} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full" data-testid="button-add-photo">
            <Camera className="w-4 h-4 mr-2" />
            Add Photo
          </Button>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3">Work Notes</h3>
          <Textarea 
            placeholder="Add notes about the job..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mb-2"
            data-testid="input-notes"
          />
        </Card>

        {nextStatus && job.status !== "completed" && job.status !== "cancelled" && (
          <Button 
            size="lg"
            className="w-full h-14 text-lg"
            onClick={handleNextStatus}
            disabled={updateStatus.isPending}
            data-testid="button-next-status"
          >
            {updateStatus.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : nextStatus === "completed" ? (
              <PenTool className="w-5 h-5 mr-2" />
            ) : NextIcon ? (
              <NextIcon className="w-5 h-5 mr-2" />
            ) : null}
            {nextStatus === "completed" ? "Get Signature & Complete" : config.nextLabel}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        )}

        {showSignature && (
          <SignatureCapture
            onSave={handleCompleteWithSignature}
            onCancel={() => setShowSignature(false)}
            title="Customer Signature"
          />
        )}

        {job.status === "completed" && (
          <Card className="p-4 bg-green-500/10 border-green-500/30">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-semibold">Job Completed</span>
            </div>
            {job.completedAt && (
              <p className="text-sm text-muted-foreground mt-1">
                Completed at {format(new Date(job.completedAt), "h:mm a")}
              </p>
            )}
          </Card>
        )}
      </div>
    </MobileLayout>
  );
}
