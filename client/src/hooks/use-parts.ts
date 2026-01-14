import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { InsertPart } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useParts() {
  return useQuery({
    queryKey: [api.parts.list.path],
    queryFn: async () => {
      const res = await fetch(api.parts.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch parts");
      return api.parts.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreatePart() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertPart) => {
      const res = await fetch(api.parts.create.path, {
        method: api.parts.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create part");
      return api.parts.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.parts.list.path] });
      toast({ title: "Success", description: "Part added to inventory" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
