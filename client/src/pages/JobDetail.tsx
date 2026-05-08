import { useJob, useUpdateJobStatus } from "@/hooks/use-jobs";
import { useJobPhotos, useCreateJobPhoto } from "@/hooks/use-job-photos";
import { useJobNotes, useCreateJobNote } from "@/hooks/use-job-notes";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, MapPin, Phone, Mail, Calendar, Clock, User,
  Camera, ImageIcon, Loader2, StickyNote, Plus, AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CLOUDINARY_CLOUD  = "dvlcwjzcx";
const CLOUDINARY_PRESET = "contractor-photos";

export default function JobDetail() {
  const { id } = useParams();
  const jobId = Number(id);
  const { data: job, isLoading, isError } = useJob(jobId);
  const { data: photos, isLoading: photosLoading } = useJobPhotos(jobId);
  const { data: notes, isLoading: notesLoading } = useJobNotes(jobId);
  const createPhoto = useCreateJobPhoto(jobId);
  const createNote  = useCreateJobNote(jobId);
  const updateStatus = useUpdateJobStatus();

  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [noteText, setNoteText]       = useState("");
  const [savingNote, setSavingNote]   = useState(false);

  // ── Loading skeleton ──────────────────────────────────────────────────────
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
          <div className="md:col-span-2">
            <Card><CardContent className="p-6"><div className="h-40 bg-muted animate-pulse rounded" /></CardContent></Card>
          </div>
          <div>
            <Card><CardContent className="p-6"><div className="h-40 bg-muted animate-pulse rounded" /></CardContent></Card>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-lg font-medium">Job not found</p>
        <Link href="/jobs"><Button variant="outline">Back to Jobs</Button></Link>
      </div>
    );
  }

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
      e.target.value = "";
    }
  }

  async function handleSaveNote() {
    const text = noteText.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      await createNote.mutateAsync(text);
      setNoteText("");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="space-y-6 animate-in pb-8">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/jobs">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0" data-testid="button-back-jobs">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold font-display truncate">{job.jobNumber}</h2>
          <p className="text-muted-foreground text-sm">Job Details</p>
        </div>
        {/* Status action buttons — responsive */}
        <div className="flex gap-2 flex-wrap">
          {job.status === "scheduled" && (
            <Button size="sm" onClick={() => handleStatusChange("en_route")} data-testid="button-start-travel">
              Start Travel
            </Button>
          )}
          {job.status === "en_route" && (
            <Button size="sm" onClick={() => handleStatusChange("arrived")} data-testid="button-arrived">
              Arrived
            </Button>
          )}
          {job.status === "arrived" && (
            <Button size="sm" onClick={() => handleStatusChange("in_progress")} data-testid="button-start-job">
              Start Job
            </Button>
          )}
          {job.status === "in_progress" && (
            <Button
              size="sm"
              onClick={() => handleStatusChange("completed")}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-complete-job"
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Complete Job"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Main Grid ────────────────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left — 2/3 width */}
        <div className="md:col-span-2 space-y-6">
          {/* Overview card */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">Overview</CardTitle>
                <StatusBadge status={job.status || "scheduled"} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Service Type
                </h4>
                <p className="text-base font-medium">{job.serviceType}</p>
              </div>
              {job.description && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Description
                  </h4>
                  <p className="text-sm text-foreground leading-relaxed">{job.description}</p>
                </div>
              )}
              {job.specialInstructions && (
                <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-900 dark:text-amber-200">
                    <strong>⚠ Note:</strong> {job.specialInstructions}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabs — Photos / Notes / Parts */}
          <Tabs defaultValue="photos">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="photos" data-testid="tab-photos">
                <Camera className="w-3.5 h-3.5 mr-1.5" />Photos
              </TabsTrigger>
              <TabsTrigger value="notes" data-testid="tab-notes">
                <StickyNote className="w-3.5 h-3.5 mr-1.5" />Notes
              </TabsTrigger>
            </TabsList>

            {/* ── Photos tab ────────────────────────────────────────────── */}
            <TabsContent value="photos" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">Job Photos</CardTitle>
                    <div>
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
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading…</>
                        ) : (
                          <><Camera className="w-4 h-4 mr-2" />Add Photo</>
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
                    <div className="text-center py-8 text-muted-foreground text-sm">Loading photos…</div>
                  ) : photos && photos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {photos.map((photo) => (
                        <div
                          key={photo.id}
                          className="relative aspect-square rounded-lg overflow-hidden border bg-muted"
                          data-testid={`photo-${photo.id}`}
                        >
                          <img
                            src={photo.photoUrl}
                            alt={photo.caption || "Job photo"}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {photo.caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1.5 truncate">
                              {photo.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-xl flex flex-col items-center gap-2">
                      <ImageIcon className="w-7 h-7 opacity-40" />
                      <p className="text-sm">No photos yet — tap Add Photo to capture one.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Notes tab ─────────────────────────────────────────────── */}
            <TabsContent value="notes" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Job Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Input */}
                  <div className="space-y-2">
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a note — what was found, what was done, anything to flag…"
                      className="resize-none min-h-[90px]"
                      rows={3}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveNote}
                      disabled={!noteText.trim() || savingNote}
                    >
                      {savingNote ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Save Note
                    </Button>
                  </div>

                  {/* Note list */}
                  {notesLoading ? (
                    <div className="text-sm text-muted-foreground">Loading notes…</div>
                  ) : notes && notes.length > 0 ? (
                    <div className="space-y-3">
                      {notes.map((note) => (
                        <div
                          key={note.id}
                          className="p-3 rounded-lg bg-muted/50 border text-sm"
                        >
                          <p className="leading-relaxed">{note.noteText}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(note.createdAt).toLocaleString([], {
                              month: "short", day: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
                      No notes yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Customer */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {job.customer ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                      {job.customer.firstName?.[0] ?? "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {job.customer.firstName} {job.customer.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">ID: #{job.customer.id}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <a
                        href={`tel:${job.customer.phone}`}
                        className="hover:text-primary transition-colors truncate"
                      >
                        {job.customer.phone}
                      </a>
                    </div>
                    {job.customer.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <a
                          href={`mailto:${job.customer.email}`}
                          className="hover:text-primary transition-colors truncate"
                        >
                          {job.customer.email}
                        </a>
                      </div>
                    )}
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(
                          [job.customer.addressStreet, job.customer.addressCity,
                           job.customer.addressState, job.customer.addressZip]
                           .filter(Boolean).join(", ")
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-primary transition-colors leading-snug"
                      >
                        {job.customer.addressStreet}<br />
                        {job.customer.addressCity}, {job.customer.addressState}{" "}
                        {job.customer.addressZip}
                      </a>
                    </div>
                  </div>
                  {/* Access notes */}
                  {(job.customer as any).accessNotes && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 p-2.5 rounded-md border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
                      <strong>Access:</strong> {(job.customer as any).accessNotes}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No customer linked.</p>
              )}
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />Date
                </span>
                <span className="font-medium">
                  {format(new Date(job.scheduledDate), "MMM d, yyyy")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />Time
                </span>
                <span className="font-medium">{job.scheduledTimeStart}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-3.5 h-3.5" />Technician
                </span>
                <span className="font-medium">
                  {job.technician
                    ? `${job.technician.firstName} ${job.technician.lastName}`
                    : "Unassigned"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Cost / Payment */}
          {job.totalCost && (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Billing</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">${parseFloat(String(job.totalCost)).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Payment</span>
                  <span className={cn(
                    "capitalize font-medium",
                    job.paymentStatus === "paid" ? "text-emerald-600" : "text-amber-600"
                  )}>
                    {job.paymentStatus || "pending"}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
