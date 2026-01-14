import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, User, MapPin, Briefcase, Star, Sparkles } from "lucide-react";
import type { Technician } from "@shared/schema";

type Suggestion = {
  technician: Technician;
  score: number;
  reasons: string[];
  distanceMiles: number | null;
  jobsScheduled: number;
};

interface TechnicianSuggestionsProps {
  customerId: number;
  serviceType: string;
  scheduledDate: string;
  onSelect: (technicianId: number) => void;
  selectedId?: number | null;
}

export function TechnicianSuggestions({
  customerId,
  serviceType,
  scheduledDate,
  onSelect,
  selectedId
}: TechnicianSuggestionsProps) {
  const { data: suggestions, isLoading } = useQuery<Suggestion[]>({
    queryKey: ["/api/dispatch/suggestions", { customerId, serviceType, scheduledDate }],
    queryFn: async () => {
      const params = new URLSearchParams({
        customerId: customerId.toString(),
        serviceType,
        scheduledDate
      });
      const res = await fetch(`/api/dispatch/suggestions?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customerId && !!serviceType && !!scheduledDate,
  });

  if (!customerId || !serviceType || !scheduledDate) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 text-center text-sm text-muted-foreground">
          <Sparkles className="w-5 h-5 mx-auto mb-2 opacity-50" />
          Select customer, service type, and date to see technician suggestions
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
          <span className="text-sm text-muted-foreground">Finding best technicians...</span>
        </CardContent>
      </Card>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-sm text-muted-foreground">
          No technicians available
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Sparkles className="w-4 h-4 text-primary" />
        Smart Suggestions
      </div>
      {suggestions.map((suggestion, idx) => {
        const tech = suggestion.technician;
        const isSelected = selectedId === tech.id;
        const isTopPick = idx === 0;
        
        return (
          <Card
            key={tech.id}
            className={`cursor-pointer transition-all ${
              isSelected 
                ? "ring-2 ring-primary border-primary" 
                : "hover-elevate"
            }`}
            onClick={() => onSelect(tech.id)}
            data-testid={`suggestion-tech-${tech.id}`}
          >
            <CardContent className="py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                {tech.profilePhotoUrl ? (
                  <img 
                    src={tech.profilePhotoUrl} 
                    alt="" 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{tech.firstName} {tech.lastName}</span>
                  {isTopPick && (
                    <Badge className="bg-primary/10 text-primary">
                      <Star className="w-3 h-3 mr-1" />
                      Best Match
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {suggestion.reasons.slice(0, 2).map((reason, i) => (
                    <span key={i} className="text-xs text-muted-foreground">
                      {i > 0 && "·"} {reason}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 text-sm">
                  <Briefcase className="w-3 h-3 text-muted-foreground" />
                  <span>{suggestion.jobsScheduled} jobs</span>
                </div>
                {suggestion.distanceMiles && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {suggestion.distanceMiles.toFixed(1)} mi
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
