const fs = require('fs');
const path = 'C:\\Users\\13212\\Desktop\\Field-app\\server\\routes.ts';
let content = fs.readFileSync(path, 'utf8');

const marker = '  // ── ERROR HANDLER (must be last)';

const routes = [
'',
'  // ── SUPER ADMIN ROUTES ──────────────────────────────────────────────────',
'  function requireSuperAdmin(req: any, res: any, next: any) {',
'    if (!req.user || req.user.role !== "superadmin") {',
'      return res.status(403).json({ message: "Superadmin access required" });',
'    }',
'    next();',
'  }',
'  app.get("/api/superadmin/stats", isAuthenticated, requireSuperAdmin, asyncHandler(async (req, res) => {',
'    const [t, u, j, tc] = await Promise.all([',
'      db.execute(sql`SELECT COUNT(*) as count FROM tenants`),',
'      db.execute(sql`SELECT COUNT(*) as count FROM users`),',
'      db.execute(sql`SELECT COUNT(*) as count FROM jobs`),',
'      db.execute(sql`SELECT COUNT(*) as count FROM technicians`),',
'    ]);',
'    const a = await db.execute(sql`SELECT COUNT(*) as count FROM tenants WHERE status = \'active\'`);',
'    res.json({ total_tenants: Number((t.rows[0] as any).count), active_tenants: Number((a.rows[0] as any).count), total_users: Number((u.rows[0] as any).count), total_jobs: Number((j.rows[0] as any).count), total_technicians: Number((tc.rows[0] as any).count) });',
'  }));',
'  app.get("/api/superadmin/tenants", isAuthenticated, requireSuperAdmin, asyncHandler(async (req, res) => {',
'    const result = await db.execute(sql`SELECT t.id, t.company_name, t.slug, t.plan_tier, t.status, t.created_at, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count, (SELECT COUNT(*) FROM jobs j WHERE j.tenant_id = t.id) AS job_count, (SELECT COUNT(*) FROM technicians tc WHERE tc.tenant_id = t.id) AS technician_count FROM tenants t ORDER BY t.created_at DESC`);',
'    res.json(result.rows);',
'  }));',
'  app.get("/api/superadmin/tenants/:id", isAuthenticated, requireSuperAdmin, asyncHandler(async (req, res) => {',
'    const { id } = req.params;',
'    const [tr, ur, tcr, jr, rjr] = await Promise.all([',
'      db.execute(sql`SELECT * FROM tenants WHERE id = ${id}`),',
'      db.execute(sql`SELECT id, email, role, is_active, created_at FROM users WHERE tenant_id = ${id}`),',
'      db.execute(sql`SELECT id, first_name, last_name, email, is_active FROM technicians WHERE tenant_id = ${id}`),',
'      db.execute(sql`SELECT COUNT(*) as count FROM jobs WHERE tenant_id = ${id}`),',
'      db.execute(sql`SELECT id, service_type, status, created_at FROM jobs WHERE tenant_id = ${id} ORDER BY created_at DESC LIMIT 5`),',
'    ]);',
'    if (!tr.rows[0]) return res.status(404).json({ message: "Tenant not found" });',
'    res.json({ tenant: tr.rows[0], users: ur.rows, technicians: tcr.rows, jobs: jr.rows, recentJobs: rjr.rows });',
'  }));',
'  app.post("/api/superadmin/tenants/:id/impersonate", isAuthenticated, requireSuperAdmin, asyncHandler(async (req, res) => {',
'    const { id } = req.params;',
'    const ur = await db.execute(sql`SELECT * FROM users WHERE tenant_id = ${id} AND role = \'owner\' LIMIT 1`);',
'    const user = ur.rows[0] as any;',
'    if (!user) return res.status(404).json({ message: "No owner found" });',
'    const { signToken } = await import("./auth/jwt");',
'    const token = signToken({ id: user.id, email: user.email, tenantId: user.tenant_id, role: user.role });',
'    res.json({ token, tenantId: id });',
'  }));',
'',
].join('\n');

content = content.replace(marker, routes + marker);
fs.writeFileSync(path, content, 'utf8');
console.log('Done — superadmin routes added to routes.ts');