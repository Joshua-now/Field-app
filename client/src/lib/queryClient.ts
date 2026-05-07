import { QueryClient } from "@tanstack/react-query";
import { getToken } from "@/hooks/use-auth";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(method: string, url: string, data?: unknown) {
  const token = getToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  await throwIfResNotOk(res);
  return res;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const token = getToken();
        const res = await fetch(queryKey[0] as string, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        await throwIfResNotOk(res);
        return res.json();
      },
      retry: (count, err: any) => {
        if (err?.message?.startsWith("401") || err?.message?.startsWith("403")) return false;
        return count < 2;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
