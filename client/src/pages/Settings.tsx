import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authHeaders } from "@/hooks/use-auth";
import { useKnowledge, useAddKnowledge, useDeleteKnowledge, useToggleKnowledge } from "@/hooks/use-knowledge";
import {
  Phone, Bot, Bell, BellOff, Building2, Loader2, CheckCircle,
  BookOpen, Plus, Trash2, FileText, ChevronDown, ChevronUp, Sparkles, Upload
} from "lucide-react";

interface TenantSettings {
  companyName: string;
  email: string;
  phone: string | null;
  bobEnabled: boolean;
  briefingEnabled: boolean;
  planTier: string;
}

const CATEGORIES = [
  { value: "general",    label: "General" },
  { value: "pricing",    label: "Pricing & Rates" },
  { value: "procedures", label: "Service Procedures" },
  { value: "policies",   label: "Company Policies" },
  { value: "equipment",  label: "Equipment & Parts" },
];

export default function Settings() {
  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [testCalling, setTestCalling] = useState(false);
  const [fixingTelnyx, setFixingTelnyx] = useState(false);
  const [fixingOutbound, setFixingOutbound] = useState(false);

  async function fixTelnyxOutbound() {
    setFixingOutbound(true);
    try {
      const res = await fetch("/api/admin/fix-telnyx-outbound", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast({
        title: "✅ Outbound profile assigned!",
        description: `Profile "${data.profileName}" linked to your call app.`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setFixingOutbound(false);
    }
  }

  async function fixTelnyxNumber() {
    setFixingTelnyx(true);
    try {
      const res = await fetch("/api/admin/fix-telnyx-number", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast({
        title: "✅ Telnyx number reassigned!",
        description: `+${data.phoneNumber} → connection ${data.newConnectionId}`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setFixingTelnyx(false);
    }
  }

  async function testCall() {
    setTestCalling(true);
    try {
      const res = await fetch("/api/admin/test-call", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Test call failed", variant: "destructive" });
      } else {
        toast({ title: `Lexi is calling ${data.callingTo} now — pick up!` });
      }
    } catch {
      toast({ title: "Request failed", variant: "destructive" });
    } finally {
      setTestCalling(false);
    }
  }

  async function loadSampleData() {
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/seed-demo", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Could not load sample data", variant: "destructive" });
      } else {
        setSeeded(true);
        toast({ title: "Sample data loaded! Refresh the dashboard to see it." });
      }
    } catch {
      toast({ title: "Request failed", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  }
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");

  // Knowledge base state
  const { data: knowledgeDocs, isLoading: kbLoading } = useKnowledge();
  const addKnowledge   = useAddKnowledge();
  const deleteKnowledge = useDeleteKnowledge();
  const toggleKnowledge = useToggleKnowledge();
  const [showAddForm, setShowAddForm] = useState(false);
  const [kbTitle, setKbTitle]         = useState("");
  const [kbContent, setKbContent]     = useState("");
  const [kbCategory, setKbCategory]   = useState("general");
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);
  const [uploading, setUploading]     = useState(false);

  useEffect(() => {
    fetch("/api/tenant/settings", { headers: authHeaders() })
      .then(r => r.json())
      .then((data: TenantSettings) => { setSettings(data); setPhone(data.phone ?? ""); })
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

  async function handleAddKnowledge() {
    if (!kbTitle.trim() || !kbContent.trim()) return;
    await addKnowledge.mutateAsync({ title: kbTitle.trim(), content: kbContent.trim(), category: kbCategory });
    setKbTitle(""); setKbContent(""); setKbCategory("general"); setShowAddForm(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name.replace(/\.[^.]+$/, ""));
      form.append("category", kbCategory);
      const res = await fetch("/api/bob/knowledge/upload", {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      toast({ title: "File added to knowledge base", description: `Split into ${data.chunkCount} searchable chunks.` });
      // reset file input
      e.target.value = "";
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
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
        <p className="text-muted-foreground text-sm mt-1">Manage your account and Lexi AI preferences.</p>
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
            Lexi calls this number for your morning (6 AM) and evening (6 PM) briefings.
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
          <p className="text-xs text-muted-foreground mt-2">Format: +1XXXXXXXXXX</p>
          <div className="pt-2">
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={testCall} disabled={testCalling}>
                {testCalling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Phone className="w-4 h-4 mr-2" />}
                Test Call Now
              </Button>
              <Button variant="outline" size="sm" onClick={fixTelnyxNumber} disabled={fixingTelnyx}>
                {fixingTelnyx ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Fix Phone Routing
              </Button>
              <Button variant="outline" size="sm" onClick={fixTelnyxOutbound} disabled={fixingOutbound}>
                {fixingOutbound ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Fix Outbound Profile
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Lexi will call the number above right now with a morning briefing.</p>
          </div>
        </CardContent>
      </Card>

      {/* Lexi AI Toggles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="w-4 h-4" />
            Lexi AI
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Lexi Chat</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable Lexi for chat and field questions</p>
            </div>
            <Switch
              checked={settings.bobEnabled}
              onCheckedChange={checked => patchSettings({ bobEnabled: checked })}
              disabled={saving}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium flex items-center gap-1.5">
                {settings.briefingEnabled
                  ? <Bell className="w-3.5 h-3.5 text-emerald-600" />
                  : <BellOff className="w-3.5 h-3.5 text-muted-foreground" />}
                Daily Voice Briefings
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lexi calls you at 6 AM &amp; 6 PM EDT with your schedule and alerts
              </p>
              {settings.briefingEnabled && !settings.phone && (
                <p className="text-xs text-amber-600 mt-1 font-medium">⚠ Set a briefing phone number above</p>
              )}
            </div>
            <Switch
              checked={settings.briefingEnabled}
              onCheckedChange={checked => patchSettings({ briefingEnabled: checked })}
              disabled={saving || !settings.bobEnabled}
            />
          </div>
          {!settings.bobEnabled && (
            <p className="text-xs text-muted-foreground italic">Enable Lexi Chat first to use briefings.</p>
          )}
        </CardContent>
      </Card>

      {/* Knowledge Base */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="w-4 h-4" />
                Lexi's Knowledge Base
              </CardTitle>
              <CardDescription className="mt-1">
                Pricing, procedures, policies, equipment specs — Lexi uses this to answer company-specific questions.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <label className={`cursor-pointer inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploading ? "Uploading..." : "Upload File"}
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.csv"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(v => !v)}>
                <Plus className="w-4 h-4 mr-1" />
                Paste Text
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add form */}
          {showAddForm && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <Input
                placeholder="Title  e.g. AC Tune-Up Pricing 2025"
                value={kbTitle}
                onChange={e => setKbTitle(e.target.value)}
              />
              <Select value={kbCategory} onValueChange={setKbCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Paste your content here — pricing tables, policy text, equipment manuals, service checklists..."
                value={kbContent}
                onChange={e => setKbContent(e.target.value)}
                rows={8}
                className="text-sm"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={handleAddKnowledge}
                  disabled={addKnowledge.isPending || !kbTitle.trim() || !kbContent.trim()}
                >
                  {addKnowledge.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Save to Knowledge Base
                </Button>
              </div>
            </div>
          )}

          {/* Doc list */}
          {kbLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : knowledgeDocs && knowledgeDocs.length > 0 ? (
            <div className="space-y-2">
              {knowledgeDocs.map(doc => (
                <div key={doc.id} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium truncate ${!doc.isActive ? "text-muted-foreground line-through" : ""}`}>
                          {doc.title}
                        </span>
                        <Badge variant="secondary" className="text-xs capitalize">{doc.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.contentPreview}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Switch
                        checked={doc.isActive}
                        onCheckedChange={checked => toggleKnowledge.mutate({ id: doc.id, isActive: checked })}
                        className="scale-75"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                      >
                        {expandedDoc === doc.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                  {expandedDoc === doc.id && (
                    <div className="border-t px-3 pb-3 pt-2 flex justify-end">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => { deleteKnowledge.mutate(doc.id); setExpandedDoc(null); }}
                        disabled={deleteKnowledge.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete this document
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No knowledge base documents yet.</p>
              <p className="text-xs mt-1">Add pricing, procedures, or policies so Lexi can reference them.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Load Sample Data */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4" />
            Sample Data
          </CardTitle>
          <CardDescription>
            Load demo technicians, customers, and jobs so you can see the app with real-looking data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {seeded ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4" />
              Sample data loaded — refresh the dashboard to see it.
            </div>
          ) : (
            <Button onClick={loadSampleData} disabled={seeding} variant="outline">
              {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Load Sample Jobs & Customers
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Telnyx webhook */}
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Telnyx Webhook (admin)</CardTitle>
        </CardHeader>
        <CardContent>
          <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
            https://field-app-production-d5c8.up.railway.app/api/voice/webhook
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            Telnyx Portal → My Numbers → Edit → Voice → set Inbound Webhook URL above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
