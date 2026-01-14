import { MobileLayout } from "@/components/MobileLayout";
import { Card } from "@/components/ui/card";
import { MapPin } from "lucide-react";

export default function TechMap() {
  return (
    <MobileLayout title="Map">
      <div className="p-4">
        <Card className="p-8 text-center">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Map View</h2>
          <p className="text-muted-foreground">
            Map integration coming soon. Use the Navigate button on job details to open directions.
          </p>
        </Card>
      </div>
    </MobileLayout>
  );
}
