// One-time script: promote a user to superadmin by email
// Usage: node scripts/make-superadmin.mjs <email>
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const email = process.argv[2];
if (!email) { console.error("Usage: node scripts/make-superadmin.mjs <email>"); process.exit(1); }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const result = await client.query(
  "UPDATE users SET role = 'superadmin' WHERE email = $1 RETURNING id, email, role",
  [email]
);
if (result.rowCount === 0) {
  console.error(`No user found with email: ${email}`);
} else {
  console.log(`✓ Promoted to superadmin:`, result.rows[0]);
}
await client.end();
