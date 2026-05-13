const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("UPDATE users SET role = 'superadmin' WHERE email = 'jbb09now@gmail.com'", (err, res) => {
  console.log(err || 'Done — role updated to superadmin');
  pool.end();
});