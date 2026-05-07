import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

// ─── TOKEN HELPERS ────────────────────────────────────────────────────────────
export function getToken(): string | null {
  return localStorage.getItem("cos_token");
}

export function setToken(token: string) {
  localStorage.setItem("cos_token", token);
}

export function clearToken() {
  localStorage.removeItem("cos_token");
}

export function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────
async function fetchUser(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;

  const res = await fetch("/api/auth/user", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    clearToken();
    return null;
  }
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

async function login(email: string, password: string): Promise<User> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Login failed" }));
    throw new Error(err.message);
  }
  const { token, user } = await res.json();
  setToken(token);
  return user;
}

async function register(data: {
  companyName: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}): Promise<User> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Registration failed" }));
    throw new Error(err.message);
  }
  const { token, user } = await res.json();
  setToken(token);
  return user;
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => { clearToken(); },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      window.location.href = "/login";
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
    logout: logoutMutation.mutate,
  };
}
