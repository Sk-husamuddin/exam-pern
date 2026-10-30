/*
 * Purge leftover Supabase auth users from previous E2E runs.
 *
 * Lists auth users whose email matches /^e2e_.*@example\.com$/ and, with
 * --yes, deletes them plus their public.profiles rows (via the service role).
 *
 * Prerequisites: env vars SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SUPABASE_ANON_KEY, DATABASE_URL (see backend/.env.example).
 *
 * Usage:
 *   node scripts/purge-e2e-users.js          # dry run: list only
 *   npm run purge-e2e                        # dry run
 *   node scripts/purge-e2e-users.js --yes    # actually delete
 *   npm run purge-e2e -- --yes               # actually delete
 */
const config = require('../src/config');

const EMAIL_REGEX = /^e2e_.*@example\.com$/;

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: config.SUPABASE_ANON_KEY,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase Admin API ${res.status}: ${text}`);
  }
  return res.json();
}

async function listE2eUsers() {
  const users = [];
  let page = 1;
  const perPage = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const body = await fetchPage(
      `${config.SUPABASE_URL}/auth/v1/admin/users?per_page=${perPage}&page=${page}`
    );
    const batch = Array.isArray(body.users) ? body.users : [];
    batch.forEach((u) => {
      if (u.email && EMAIL_REGEX.test(u.email)) users.push(u);
    });
    if (batch.length < perPage) break;
    page += 1;
  }
  return users;
}

async function deleteAuthUser(id) {
  const res = await fetch(`${config.SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: config.SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`delete user ${id}: ${res.status} ${text}`);
  }
}

async function main() {
  const yes = process.argv.includes('--yes');
  const { query } = require('../src/db');

  const users = await listE2eUsers();
  console.log(`Found ${users.length} auth user(s) matching /^e2e_.*@example\\.com$/`);
  users.forEach((u) => {
    console.log(
      `  ${u.id}  ${u.email}  created_at=${u.created_at || '-'}  last_sign_in=${u.last_sign_in_at || '-'}`
    );
  });

  if (!yes) {
    console.log('Dry run: no users were deleted. Re-run with --yes to delete them and their profile rows.');
    return;
  }

  if (users.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  let deleted = 0;
  for (const u of users) {
    try {
      await deleteAuthUser(u.id);
      try {
        await query('DELETE FROM profiles WHERE auth_user_id = $1', [u.id]);
      } catch (dbErr) {
        console.error(`  Profiles cleanup for ${u.email} failed: ${dbErr.message}`);
      }
      deleted += 1;
      console.log(`  Deleted ${u.email}`);
    } catch (err) {
      console.error(`  Failed to delete ${u.email}: ${err.message}`);
    }
  }
  console.log(`Deleted ${deleted} of ${users.length} user(s).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
