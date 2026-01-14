import { useQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/MobileLayout";
import { Card } from "@/components/ui/card";
import { Camera, Loader2 } from "lucide-react";
import type { Job, Customer, Technician, JobPhoto } from "@shared/schema";

type JobWithRelations = Job & { customer: Customer; technician: Technician | null };

export default function TechPhotos() {
  const { data: jobs, isLoading } = useQuery<JobWithRelations[]>({
    queryKey: ["/api/jobs"],
  });

  if (isLoading) {
    return (
      <MobileLayout title="Photos">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title="Photos">
      <div className="p-4">
        <Card className="p-8 text-center">
          <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Photo Gallery</h2>
          <p className="text-muted-foreground mb-4">
            View and manage photos from your jobs. Take photos directly from job details.
          </p>
        </Card>
      </div>
    </MobileLayout>
  );
}
