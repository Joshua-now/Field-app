import { useState } from "react";
import { getToken } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Circle, Loader2, Building2, Plug, UserPlus, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";

const SERVICE_TYPES = [
  "HVAC", "Plumbing", "Electrical", "Roofing", "Landscaping",
  "Pest Control", "Pool Service", "Cleaning", "Painting", "General Contracting",
];

const TIMEZONES = [
  { label: "Eastern (ET)", value: "America/New_York" },
  { label: "Central (CT)", value: "America/Chicago" },
  { label: "Mountain (MT)", value: "America/Denver" },
  { label: "Pacific (PT)", value: "America/Los_Angeles" },
  { label: "Arizona (no DST)", value: "America/Phoenix" },
  { label: "Hawaii (HT)", value: "Pacific/Honolulu" },
  { label: "Alaska (AKT)", value: "America/Anchorage" },
];

const CRM_OPTIONS = [
  { value: "ghl", label: "GoHighLevel", description: "Paste your GHL Private Integration Token + Location ID" },
  { value: "jobber", label: "Jobber", description: "Paste your Jobber API access token" },
  { value: "servicetitan", label: "ServiceTitan", description: "Paste your Client ID, Client Secret, and Tenant ID" },
  { value: "none", label: "Skip for now", description: "You can connect a CRM later in Settings" },
];

type Step = "company" | "tools" | "technician" | "demo";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "company",    label: "Company Setup",    icon: <Building2 className="h-4 w-4" /> },
  { key: "tools",      label: "Connect Tools",    icon: <Plug className="h-4 w-4" /> },
  { key: "technician", label: "First Technician", icon: <UserPlus className="h-4 w-4" /> },
  { key: "demo",       label: "You're Ready",     icon: <Sparkles className="h-4 w-4" /> },
];

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<Step>("company");
  const [loading, setLoading] = useState(false);

  // Step 1 — Company
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  // Step 2 — CRM
  const [crmType, setCrmType] = useState("none");
  const [crmApiKey, setCrmApiKey] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [stClientId, setStClientId] = useState("");
  const [stClientSecret, setStClientSecret] = useState("");
  const [stTenantId, setStTenantId] = useState("");
  const [crmTestResult, setCrmTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [testingCrm, setTestingCrm] = useState(false);

  // Step 3 — Technician
  const [techFirstName, setTechFirstName] = useState("");
  const [techLastName, setTechLastName] = useState("");
  const [techEmail, setTechEmail] = useState("");
  const [techPhone, setTechPhone] = useState("");
  const [techPin, setTechPin] = useState("");

  // Step 4 — Done
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const stepIndex = STEPS.findIndex(s => s.key === currentStep);

  function toggleService(s: string) {
    setSelectedServices(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  async function saveCompany() {
    if (!companyName.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      await fetch("/api/tenant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          companyName: companyName.trim(),
          phone: phone.trim() || undefined,
          settings: { timezone, serviceTypes: selectedServices },
        }),
      });
      setCurrentStep("tools");
    } catch {
      toast({ title: "Failed to save company info", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function saveCrm() {
    if (crmType !== "none" && !crmApiKey.trim()) {
      toast({ title: "API key is required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      const body: Record<string, string> = { crmType };
      if (crmType !== "none") {
        if (crmType === "servicetitan") {
          body.crmApiKey = `${stClientId}::${stClientSecret}::${stTenantId}`;
        } else {
          body.crmApiKey = crmApiKey.trim();
        }
        if (crmType === "ghl") body.ghlLocationId = ghlLocationId.trim();
      }
      await fetch("/api/tenant/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      setCurrentStep("technician");
    } catch {
      toast({ title: "Failed to save CRM config", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function testCrm() {
    setTestingCrm(true);
    setCrmTestResult(null);
    try {
      const token = getToken();
      // Save first, then test
      const body: Record<string, string> = { crmType };
      if (crmType === "servicetitan") {
        body.crmApiKey = `${stClientId}::${stClientSecret}::${stTenantId}`;
      } else {
        body.crmApiKey = crmApiKey.trim();
      }
      if (crmType === "ghl") body.ghlLocationId = ghlLocationId.trim();

      await fetch("/api/tenant/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const res = await fetch("/api/tenant/crm/test", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCrmTestResult(data);
    } catch {
      setCrmTestResult({ ok: false, error: "Connection test failed" });
    } finally {
      setTestingCrm(false);
    }
  }

  async function createTechnician() {
    if (!techFirstName.trim() || !techLastName.trim() || !techEmail.trim() || !techPhone.trim()) {
      toast({ title: "First name, last name, email, and phone are required", variant: "destructive" });
      return;
    }
    if (techPin && (techPin.length < 4 || techPin.length > 8)) {
      toast({ title: "PIN must be 4–8 digits", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch("/api/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: techFirstName.trim(),
          lastName: techLastName.trim(),
          email: techEmail.trim(),
          phone: techPhone.trim(),
          password: techPin || "demo1234",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create technician");
      }
      setCurrentStep("demo");
    } catch (e: any) {
      toast({ title: e.message || "Failed to create technician", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function seedDemo() {
    setSeeding(true);
    try {
      const token = getToken();
      await fetch("/api/admin/seed-demo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSeeded(true);
    } catch {
      // Non-fatal — they can still proceed
    } finally {
      setSeeding(false);
    }
  }

  async function finish() {
    setLoading(true);
    try {
      const token = getToken();
      await fetch("/api/tenant/onboarding/complete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      navigate("/");
    } catch {
      navigate("/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Welcome to the Field App</h1>
          <p className="text-muted-foreground mt-2">Let's get your account set up in 4 quick steps.</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center mb-8 gap-2">
          {STEPS.map((step, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={step.key} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                  ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/10 text-primary border border-primary" : "bg-muted text-muted-foreground"}`}>
                  {done ? <CheckCircle className="h-3.5 w-3.5" /> : step.icon}
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="inline sm:hidden">{i + 1}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            );
          })}
        </div>

        {/* ── STEP 1: Company Setup ── */}
        {currentStep === "company" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Company Setup</CardTitle>
              <CardDescription>Tell us about your business so Lexi can introduce herself correctly to your team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label>Company Name *</Label>
                <Input placeholder="Acme HVAC & Plumbing" value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Business Phone</Label>
                <Input placeholder="(813) 555-0100" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Your Timezone</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Services You Offer</Label>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_TYPES.map(s => (
                    <Badge
                      key={s}
                      variant={selectedServices.includes(s) ? "default" : "outline"}
                      className="cursor-pointer select-none"
                      onClick={() => toggleService(s)}
                    >
                      {selectedServices.includes(s) && <CheckCircle className="h-3 w-3 mr-1" />}
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={saveCompany} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Continue <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: Connect Tools ── */}
        {currentStep === "tools" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5" /> Connect Your CRM</CardTitle>
              <CardDescription>Lexi can search your CRM contacts, check lead status, and add notes — right from the chat.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {CRM_OPTIONS.map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => { setCrmType(opt.value); setCrmTestResult(null); }}
                    className={`border rounded-lg p-3 cursor-pointer transition-all ${crmType === opt.value ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                  </div>
                ))}
              </div>

              {crmType === "ghl" && (
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label>GHL Private Integration Token</Label>
                    <Input type="password" placeholder="pit_..." value={crmApiKey} onChange={e => setCrmApiKey(e.target.value)} />
                    <p className="text-xs text-muted-foreground">GHL → Settings → Integrations → Private Integrations → Create</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Location ID</Label>
                    <Input placeholder="abc123xyz..." value={ghlLocationId} onChange={e => setGhlLocationId(e.target.value)} />
                    <p className="text-xs text-muted-foreground">GHL → Settings → Business Profile → Location ID</p>
                  </div>
                </div>
              )}

              {crmType === "jobber" && (
                <div className="space-y-1.5 pt-2">
                  <Label>Jobber API Access Token</Label>
                  <Input type="password" placeholder="Bearer token from Jobber Developer Portal" value={crmApiKey} onChange={e => setCrmApiKey(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Jobber → Settings → Developer Tools → API Access</p>
                </div>
              )}

              {crmType === "servicetitan" && (
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label>Client ID</Label>
                    <Input placeholder="app-..." value={stClientId} onChange={e => setStClientId(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Client Secret</Label>
                    <Input type="password" placeholder="secret..." value={stClientSecret} onChange={e => setStClientSecret(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ServiceTitan Tenant ID</Label>
                    <Input placeholder="12345678" value={stTenantId} onChange={e => setStTenantId(e.target.value)} />
                  </div>
                  <p className="text-xs text-muted-foreground">Find these in ServiceTitan Developer Portal → My Apps</p>
                </div>
              )}

              {crmType !== "none" && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={testCrm} disabled={testingCrm} className="flex-1">
                    {testingCrm ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Test Connection
                  </Button>
                </div>
              )}

              {crmTestResult && (
                <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${crmTestResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {crmTestResult.ok ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <Circle className="h-4 w-4 flex-shrink-0" />}
                  {crmTestResult.ok ? "Connected successfully!" : crmTestResult.error}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setCurrentStep("company")}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button className="flex-1" onClick={saveCrm} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {crmType === "none" ? "Skip for Now" : "Save & Continue"}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 3: First Technician ── */}
        {currentStep === "technician" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Add Your First Technician <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span></CardTitle>
              <CardDescription>Your techs log in with their email and PIN to access the field app. Skip this if you want to add techs later from Settings — or load sample data to see how it looks first.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>First Name *</Label>
                  <Input placeholder="Marcus" value={techFirstName} onChange={e => setTechFirstName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Last Name *</Label>
                  <Input placeholder="Hayes" value={techLastName} onChange={e => setTechLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" placeholder="marcus@yourbusiness.com" value={techEmail} onChange={e => setTechEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone *</Label>
                <Input placeholder="(813) 555-0142" value={techPhone} onChange={e => setTechPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Login PIN (4–8 digits)</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  placeholder="Leave blank for 'demo1234'"
                  value={techPin}
                  onChange={e => setTechPin(e.target.value.replace(/\D/g, ""))}
                  maxLength={8}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setCurrentStep("tools")}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button variant="ghost" onClick={() => setCurrentStep("demo")} disabled={loading}>
                  Skip for Now
                </Button>
                <Button className="flex-1" onClick={createTechnician} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Add Technician <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 4: Done + Seed Demo ── */}
        {currentStep === "demo" && (
          <Card>
            <CardHeader>
              <div className="flex justify-center mb-3">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-center">You're all set!</CardTitle>
              <CardDescription className="text-center">
                Your field app is ready. Want us to load some sample jobs so you can see how it looks with real data?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="font-medium">What's waiting for you:</div>
                <ul className="space-y-1 text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" /> Lexi AI is on and ready to take questions</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" /> Your technician can log in from the field</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" /> Add jobs, customers, and inventory from the dashboard</li>
                  {crmType !== "none" && (
                    <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" /> CRM connected — Lexi can search your contacts</li>
                  )}
                </ul>
              </div>

              {!seeded ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={seedDemo}
                  disabled={seeding}
                >
                  {seeding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Load Sample Jobs & Customers
                </Button>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-green-50 text-green-700 border border-green-200">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  Sample data loaded — you'll see 3 techs, 5 customers, and jobs on the schedule.
                </div>
              )}

              <Button className="w-full" onClick={finish} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Go to Dashboard <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
