import dotenv from 'dotenv';
import { execute, query } from '../db';

dotenv.config();

async function makeSuperAdmin() {
  const targetEmail = (process.argv[2] || process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();

  if (!targetEmail) {
    console.error(`\n❌ Error: No target email provided.`);
    console.error(`Usage: npx tsx scripts/make_superadmin.ts <email>`);
    console.error(`Or set INITIAL_ADMIN_EMAIL in your environment.\n`);
    process.exit(1);
  }

  console.log(`\n👑 PantryPool Superadmin Provisioning Utility`);
  console.log(`-----------------------------------------------`);
  console.log(`Target Email: ${targetEmail}`);

  try {
    const existingUsers = await query("SELECT id, email, name, system_role FROM users WHERE email = ?", [targetEmail]);

    if (existingUsers.length > 0) {
      const user = existingUsers[0];
      await execute("UPDATE users SET system_role = 'superadmin' WHERE id = ?", [user.id]);
      console.log(`✅ Success! Updated user "${user.name}" (${user.email}) to role: superadmin.`);
    } else {
      console.log(`ℹ️ User with email "${targetEmail}" has not registered in the database yet.`);
      console.log(`✅ Set in environment: INITIAL_ADMIN_EMAIL="${targetEmail}".`);
      console.log(`Upon their first login (Google / Apple / Password), they will automatically be granted superadmin privileges.`);
    }
  } catch (err: any) {
    console.error(`❌ Error updating user role:`, err.message || err);
  }

  process.exit(0);
}

makeSuperAdmin();
