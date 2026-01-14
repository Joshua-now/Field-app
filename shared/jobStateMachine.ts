export const JOB_STATUSES = [
  "scheduled",
  "assigned",
  "en_route", 
  "arrived",
  "in_progress",
  "completed",
  "cancelled"
] as const;

export type JobStatus = typeof JOB_STATUSES[number];

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  scheduled: ["assigned", "en_route", "cancelled"],
  assigned: ["en_route", "scheduled", "cancelled"],
  en_route: ["arrived", "assigned", "scheduled", "cancelled"],
  arrived: ["in_progress", "en_route", "cancelled"],
  in_progress: ["completed", "arrived", "cancelled"],
  completed: [],
  cancelled: ["scheduled"]
};

export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidNextStatuses(currentStatus: JobStatus): JobStatus[] {
  return VALID_TRANSITIONS[currentStatus] || [];
}

export function validateStatusTransition(from: JobStatus, to: JobStatus): { valid: boolean; message?: string } {
  if (from === to) {
    return { valid: true };
  }
  
  if (!VALID_TRANSITIONS[from]) {
    return { valid: false, message: `Unknown status: ${from}` };
  }
  
  if (!VALID_TRANSITIONS[from].includes(to)) {
    const allowed = VALID_TRANSITIONS[from].join(", ") || "none";
    return { 
      valid: false, 
      message: `Cannot transition from "${from}" to "${to}". Allowed transitions: ${allowed}` 
    };
  }
  
  return { valid: true };
}
