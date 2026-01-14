import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const getStatusColor = (s: string) => {
    switch (s.toLowerCase()) {
      case "scheduled":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "in_progress":
      case "en_route":
      case "arrived":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "completed":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "cancelled":
        return "bg-red-100 text-red-700 border-red-200";
      case "pending":
        return "bg-slate-100 text-slate-700 border-slate-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const formatStatus = (s: string) => {
    return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <span className={cn(
      "px-2.5 py-0.5 rounded-full text-xs font-medium border",
      getStatusColor(status),
      className
    )}>
      {formatStatus(status)}
    </span>
  );
}
