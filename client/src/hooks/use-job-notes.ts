import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export function useJobNotes(jobId: number) {
  return useQuery({
    queryKey: ["/api/job-notes", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/notes`, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json() as Promise<Array<{
        id: number;
        noteText: string;
        noteType: string;
        isInternal: boolean;
        createdAt: string;
      }>>;
    },
    enabled: !!jobId,
  });
}

export function useCreateJobNote(jobId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (noteText: string) => {
      const res = await fetch(`/api/jobs/${jobId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ noteText, noteType: "general" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to save note" }));
        throw new Error(err.message || "Failed to save note");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-notes", jobId] });
      toast({ title: "Note saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
