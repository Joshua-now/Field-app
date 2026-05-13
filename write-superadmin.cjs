const fs = require('fs');

const content = `import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { getToken } from "@/hooks/use-auth";
import { Users, Building2, Briefcase, MessageSquare, RefreshCw, ChevronRight, CheckCircle, XCircle, LogOut, Shield } from "lucide-react";

function authH() {
  return { "Content-Type": "application/json", Authorization: \`Bearer \${getToken()}\` };
}

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="rounded-xl p-5 flex items-center gap-4 bg-slate-900 border border-slate-800">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: color + "22" }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value ?? "—"}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default function SuperAdmin() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [statsRes, tenantsRes] = await Promise.all([
        fetch("/api/superadmin/stats", { headers: authH() }),
        fetch("/api/superadmin/tenants", { headers: authH() }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (tenantsRes.ok) setTenants(await tenantsRes.json());
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const fetchDetail = async (id: string) => {
    setSelected(id);
    setDetail(null);
    try {
      const res = await fetch(\`/api/superadmin/tenants/\${id}\`, { headers: authH() });
      if (res.ok) setDetail(await res.json());
    } catch {}
  };

  const impersonate = async (tenantId: string, companyName: string) => {
    setImpersonating(tenantId);
    try {
      const res = await fetch(\`/api/superadmin/tenants/\${tenantId}/impersonate\`, { method: "POST", headers: authH() });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("impersonate_token", data.token);
        localStorage.setItem("impersonate_company", companyName);
        window.location.href = "/";
      }
    } catch {}
    setImpersonating(null);
  };

  useEffect(() => { fetchAll(); }, []);

  const planColor: Record<string, string> = { free: "#6b7280", starter: "#34d399", pro: "#60a5fa", enterprise: "#a78bfa" };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Super Admin</h1>
            <p className="text-sm text-slate-500">Fluid Productions — Platform Overview</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchAll} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-slate-900 border border-slate-800 text-slate-400 hover:text-white">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => navigate("/")} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-slate-900 border border-slate-800 text-slate-400 hover:text-white">
            <LogOut className="w-4 h-4" /> Back to App
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Building2}     label="Total Tenants"   value={stats.total_tenants}     color="#7c3aed" />
          <StatCard icon={CheckCircle}   label="Active Tenants"  value={stats.active_tenants}    color="#10b981" />
          <StatCard icon={Users}         label="Total Users"     value={stats.total_users}       color="#3b82f6" />
          <StatCard icon={Briefcase}     label="Total Jobs"      value={stats.total_jobs}        color="#f59e0b" />
          <StatCard icon={MessageSquare} label="Technicians"     value={stats.total_technicians} color="#ec4899" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
          <div className="px-5 py-4 text-sm font-semibold text-white border-b border-slate-800">
            Contractor Accounts ({tenants.length})
          </div>
          <div className="divide-y divide-slate-800">
            {loading ? (
              <div className="p-6 text-sm text-slate-500">Loading...</div>
            ) : tenants.length === 0 ? (
              <div className="p-6 text-sm text-center text-slate-500">No tenants yet</div>
            ) : tenants.map((t: any) => (
              <div key={t.id} onClick={() => fetchDetail(t.id)}
                className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-800/50"
                style={{ background: selected === t.id ? "rgba(79,70,229,0.1)" : "transparent" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold bg-indigo-900/40 text-indigo-400">
                  {(t.company_name || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{t.company_name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: (planColor[t.plan_tier] || "#6b7280") + "22", color: planColor[t.plan_tier] || "#6b7280" }}>
                      {t.plan_tier}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {t.user_count ?? 0} users · {t.job_count ?? 0} jobs · {t.technician_count ?? 0} techs
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {t.status === "active" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                  <ChevronRight className="w-4 h-4 text-slate-700" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 min-h-72">
          {!selected ? (
            <div className="flex items-center justify-center h-full p-12 text-center">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-800" />
              <div className="text-sm text-slate-600">Select a tenant to view details</div>
            </div>
          ) : !detail ? (
            <div className="p-6 text-sm text-slate-500">Loading...</div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-white">{detail.tenant.company_name}</div>
                  <div className="text-xs text-slate-500 mt-1">/{detail.tenant.slug} · {detail.tenant.plan_tier} · {detail.tenant.status}</div>
                </div>
                <button onClick={() => impersonate(detail.tenant.id, detail.tenant.company_name)}
                  disabled={impersonating === detail.tenant.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                  style={{ background: "rgba(79,70,229,0.2)", color: "#818cf8", border: "1px solid rgba(79,70,229,0.3)" }}>
                  {impersonating === detail.tenant.id ? "Loading..." : "→ Log In As"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[{ label: "Users", value: detail.users.length }, { label: "Technicians", value: detail.technicians.length }, { label: "Jobs", value: detail.jobs.length }].map(s => (
                  <div key={s.label} className="rounded-lg p-3 text-center bg-slate-800">
                    <div className="text-lg font-bold text-white">{s.value}</div>
                    <div className="text-xs text-slate-500">{s.label}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-slate-500">Users</div>
                {detail.users.length === 0 ? <div className="text-sm text-slate-600">None</div> : detail.users.map((u: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-800 text-sm mb-1.5">
                    <span className="text-white flex-1 truncate">{u.email}</span>
                    <span className="text-xs text-indigo-400 font-medium">{u.role}</span>
                  </div>
                ))}
              </div>
              {detail.recentJobs?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-slate-500">Recent Jobs</div>
                  {detail.recentJobs.slice(0, 4).map((j: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-800 text-sm mb-1.5">
                      <span className="text-white flex-1 truncate">{j.service_type}</span>
                      <span className="text-slate-500 text-xs">{j.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('C:\\Users\\13212\\Desktop\\Field-app\\client\\src\\pages\\SuperAdmin.tsx', content, 'utf8');
console.log('Done — SuperAdmin.tsx written');