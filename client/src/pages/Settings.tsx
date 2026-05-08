import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { authHeaders } from "@/hooks/use-auth";
import { Phone, Bot, Bell, BellOff, Building2, Loader2, CheckCircle } from "lucide-react";

interface TenantSettings {
  companyName: string;
  email: string;
  phone: string | null;
  bobEnabled: boolean;
  briefingEnabled: boolean;
  planTier: string;
}

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");

  useEffect(() => {
    fetch("/api/tenant/settings", { headers: authHeaders() })
      .then(r => r.json())
      .then((data: TenantSettings) => {
        setSettings(data);
        setPhone(data.phone ?? "");
      })
      .catch(() => toast({ title: "Error", description: "Could not load settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  async function patchSettings(patch: Partial<TenantSettings>) {
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated: TenantSettings = await res.json();
      setSettings(updated);
      setPhone(updated.phone ?? "");
      toast({ title: "Saved", description: "Settings updated." });
    } catch {
      toast({ title: "Error", description: "Could not save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and Bob AI preferences.</p>
      </div>

      {/* Company */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4" />
            Company
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Company name</span>
            <span className="font-medium">{settings.companyName}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{settings.email}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Plan</span>
            <Badge variant="outline" className="capitalize">{settings.planTier}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Briefing Phone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="w-4 h-4" />
            Briefing Phone Number
          </CardTitle>
          <CardDescription>
            Bob calls this number for your morning (6 AM) and evening (6 PM) briefings. Must be a US mobile number.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="+1 (813) 555-0100"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={() => patchSettings({ phone: phone.trim() || null })}
              disabled={saving || phone === (settings.phone ?? "")}
              size="sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              <span className="ml-1">Save</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Format: +1XXXXXXXXXX or (XXX) XXX-XXXX
          </p>
        </CardContent>
      </Card>

      {/* Bob AI Toggles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="w-4 h-4" />
            Bob AI
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Bob Chat</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable Bob for chat and field questions</p>
            </div>
            <Switch
              checked={settings.bobEnabled}
              onCheckedChange={checked => patchSettings({ bobEnabled: checked })}
              disabled={saving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <div>
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  {settings.briefingEnabled
                    ? <Bell className="w-3.5 h-3.5 text-emerald-600" />
                    : <BellOff className="w-3.5 h-3.5 text-muted-foreground" />}
                  Daily Voice Briefings
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bob calls you at 6 AM &amp; 6 PM EDT with your schedule and alerts
                </p>
                {settings.briefingEnabled && !settings.phone && (
                  <p className="text-xs text-amber-600 mt-1 font-medium">
                    ⚠ Set a briefing phone number above to receive calls
                  </p>
                )}
              </div>
            </div>
            <Switch
              checked={settings.briefingEnabled}
              onCheckedChange={checked => patchSettings({ briefingEnabled: checked })}
              disabled={saving || !settings.bobEnabled}
            />
          </div>

          {!settings.bobEnabled && (
            <p className="text-xs text-muted-foreground italic">Enable Bob Chat first to use briefings.</p>
          )}
        </CardContent>
      </Card>

      {/* Telnyx webhook info */}
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Telnyx Webhook (admin)</CardTitle>
        </CardHeader>
        <CardContent>
          <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
            https://field-app-production-d5c8.up.railway.app/api/voice/webhook
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            Set this as the Inbound Webhook URL in Telnyx Portal → My Numbers → Edit → Voice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
