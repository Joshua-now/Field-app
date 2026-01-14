import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useJobPhotos(jobId: number) {
  return useQuery({
    queryKey: [api.jobPhotos.list.path, jobId],
    queryFn: async () => {
      const url = buildUrl(api.jobPhotos.list.path, { jobId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch photos");
      return api.jobPhotos.list.responses[200].parse(await res.json());
    },
    enabled: !!jobId,
  });
}

export function useCreateJobPhoto(jobId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { photoUrl: string; category?: string; caption?: string }) => {
      const url = buildUrl(api.jobPhotos.create.path, { jobId });
      const res = await fetch(url, {
        method: api.jobPhotos.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save photo");
      return api.jobPhotos.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.jobPhotos.list.path, jobId] });
      toast({ title: "Success", description: "Photo saved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
