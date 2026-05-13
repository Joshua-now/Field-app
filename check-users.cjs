const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT id, company_name, slug, plan_tier, status FROM tenants", (err, res) => {
  console.log(err || res.rows);
  pool.end();
});