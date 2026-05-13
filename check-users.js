const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT id, email, role, \"tenantId\", \"isActive\" FROM users ORDER BY \"createdAt\"", (err, res) => {
  console.log(err || res.rows);
  pool.end();
});