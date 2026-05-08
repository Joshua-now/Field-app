import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const KEY = "/api/bob/knowledge";

export interface KnowledgeDoc {
  id: number;
  title: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  contentPreview: string;
}

export function useKnowledge() {
  return useQuery<KnowledgeDoc[]>({
    queryKey: [KEY],
    queryFn: async () => {
      const res = await fetch(KEY, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch knowledge base");
      return res.json();
    },
  });
}

export function useAddKnowledge() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { title: string; content: string; category: string }) => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to add knowledge");
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast({ title: "Added to knowledge base", description: `Split into ${data.chunkCount} searchable chunks.` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteKnowledge() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${KEY}/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast({ title: "Deleted from knowledge base" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useToggleKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`${KEY}/${id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
