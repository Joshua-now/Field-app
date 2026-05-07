import { useJob, useUpdateJobStatus } from "@/hooks/use-jobs";
import { useJobPhotos, useCreateJobPhoto } from "@/hooks/use-job-photos";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Phone, Mail, Calendar, Clock, User, Camera, ImageIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useRef, useState } from "react";

const CLOUDINARY_CLOUD = "dvlcwjzcx";
const CLOUDINARY_PRESET = "contractor-photos";

export default function JobDetail() {
  const { id } = useParams();
  const jobId = Number(id);
  const { data: job, isLoading } = useJob(jobId);
  const { data: photos, isLoading: photosLoading } = useJobPhotos(jobId);
  const createPhoto = useCreateJobPhoto(jobId);
  const updateStatus = useUpdateJobStatus();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-muted animate-pulse rounded-full" />
          <div className="space-y-2">
            <div className="h-6 w-40 bg-muted animate-pulse rounded" />
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card><CardContent className="p-6"><div className="h-32 bg-muted animate-pulse rounded" /></CardContent></Card>
          </div>
          <div className="space-y-6">
            <Card><CardContent className="p-6"><div className="h-40 bg-muted animate-pulse rounded" /></CardContent></Card>
          </div>
        </div>
      </div>
    );
  }
  if (!job) return <div className="text-center py-12 text-muted-foreground">Job not found</div>;

  const handleStatusChange = (newStatus: string) => {
    updateStatus.mutate({ id: jobId, status: newStatus });
  };

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_PRESET);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
        { method: "POST", body: formData }
      );
      if (!res.ok) throw new Error(`Cloudinary error ${res.status}`);
      const data = await res.json();
      createPhoto.mutate({ photoUrl: data.secure_url, category: "during" });
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      // reset input so same file can be re-selected
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex items-center gap-4">
        <Link href="/jobs">
          <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-back-jobs">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold font-display">{job.jobNumber}</h2>
          <p className="text-muted-foreground">Job Details</p>
        </div>
        <div className="ml-auto flex gap-2">
          {job.status === "scheduled" && (
            <Button onClick={() => handleStatusChange("en_route")} data-testid="button-start-travel">Start Travel</Button>
          )}
          {job.status === "en_route" && (
            <Button onClick={() => handleStatusChange("arrived")} data-testid="button-arrived">Arrived</Button>
          )}
          {job.status === "arrived" && (
            <Button onClick={() => handleStatusChange("in_progress")} data-testid="button-start-job">Start Job</Button>
          )}
          {job.status === "in_progress" && (
            <Button onClick={() => handleStatusChange("completed")} variant="default" className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-complete-job">
              Complete Job
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Info */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Overview</CardTitle>
                <StatusBadge status={job.status || "scheduled"} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-1">Service Type</h4>
                <p className="text-lg font-medium">{job.serviceType}</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-1">Description</h4>
                <p className="text-foreground">{job.description || "No description provided."}</p>
              </div>
              {job.specialInstructions && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-amber-900 text-sm">
                  <strong>Note:</strong> {job.specialInstructions}
                </div>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="photos">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="photos" data-testid="tab-photos">Photos</TabsTrigger>
              <TabsTrigger value="notes" data-testid="tab-notes">Notes</TabsTrigger>
              <TabsTrigger value="parts" data-testid="tab-parts">Parts Used</TabsTrigger>
            </TabsList>
            <TabsContent value="photos" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">Job Photos</CardTitle>
                    <div>
                      {/* Hidden file input — opens camera on mobile */}
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handlePhotoSelected}
                      />
                      <Button
                        size="sm"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={uploading}
                        data-testid="button-add-photo"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Uploading…
                          </>
                        ) : (
                          <>
                            <Camera className="w-4 h-4 mr-2" />
                            Add Photo
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  {uploadError && (
                    <p className="text-xs text-destructive mt-1">{uploadError}</p>
                  )}
                </CardHeader>
                <CardContent>
                  {photosLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading photos...</div>
                  ) : photos && photos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {photos.map((photo) => (
                        <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted" data-testid={`photo-${photo.id}`}>
                          <img
                            src={photo.photoUrl}
                            alt={photo.caption || "Job photo"}
                            className="w-full h-full object-cover"
                          />
                          {photo.caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 truncate">
                              {photo.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl flex flex-col items-center gap-2">
                      <ImageIcon className="w-8 h-8 opacity-50" />
                      <span>No photos uploaded yet.</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="notes">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground text-sm">No notes yet.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Customer Card */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {job.customer.firstName[0]}
                </div>
                <div>
                  <p className="font-medium">{job.customer.firstName} {job.customer.lastName}</p>
                  <p className="text-xs text-muted-foreground">ID: #{job.customer.id}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <a href={`tel:${job.customer.phone}`} className="hover:text-primary transition-colors">{job.customer.phone}</a>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  <a href={`mailto:${job.customer.email}`} className="hover:text-primary transition-colors">{job.customer.email}</a>
                </div>
                <div className="flex items-start gap-3 text-muted-foreground">
                  <MapPin className="w-4 h-4 mt-0.5" />
                  <span>
                    {job.customer.addressStreet}<br/>
                    {job.customer.addressCity}, {job.customer.addressState} {job.customer.addressZip}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Schedule Card */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Date</span>
                </div>
                <span className="font-medium">{format(new Date(job.scheduledDate), "MMM d, yyyy")}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>Time</span>
                </div>
                <span className="font-medium">{job.scheduledTimeStart}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>Technician</span>
                </div>
                <span className="font-medium">
                  {job.technician ? `${job.technician.firstName} ${job.technician.lastName}` : "Unassigned"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
