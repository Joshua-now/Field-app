import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { InsertTechnician } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useTechnicians() {
  return useQuery({
    queryKey: [api.technicians.list.path],
    queryFn: async () => {
      const res = await fetch(api.technicians.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch technicians");
      return api.technicians.list.responses[200].parse(await res.json());
    },
  });
}

export function useTechnician(id: number) {
  return useQuery({
    queryKey: [api.technicians.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.technicians.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch technician");
      return api.technicians.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateTechnician() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertTechnician) => {
      const res = await fetch(api.technicians.create.path, {
        method: api.technicians.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create technician");
      return api.technicians.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.technicians.list.path] });
      toast({ title: "Success", description: "Technician added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
