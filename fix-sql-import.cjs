const fs = require('fs');
const path = 'C:\\Users\\13212\\Desktop\\Field-app\\server\\routes.ts';
let content = fs.readFileSync(path, 'utf8');

// Find the existing sql import and make sure it's there
if (!content.includes('sql }') && !content.includes('{ sql')) {
  // Add sql to the drizzle import
  content = content.replace(
    'from "drizzle-orm";',
    'from "drizzle-orm";'
  );
}

// Replace the superadmin routes to use raw db pool instead of sql template
const oldStats = `db.execute(sql\`SELECT COUNT(*) as count FROM tenants\`)`;
console.log('sql present:', content.includes('sql`'));

// Just add sql import at top of file if missing
if (!content.match(/import.*\bsql\b.*from/)) {
  content = content.replace(
    'import { eq',
    'import { eq, sql'
  );
  fs.writeFileSync(path, content, 'utf8');
  console.log('Added sql to imports');
} else {
  console.log('sql already imported');
}