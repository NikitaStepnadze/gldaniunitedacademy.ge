/**
 * Creates the admin account used to sign in to the admin panel.
 *
 * Run once. It prints the new user's id, which goes into .env as
 * ADMIN_USER_ID -- that single value is the whole admin check: the login route
 * creates a session, and admin pages verify the session belongs to that id.
 *
 *   node scripts/appwrite-create-admin.mjs <email> [name]
 *
 * The password is generated here rather than passed on the command line, so it
 * never lands in shell history. It is printed once; save it immediately.
 */
import { randomBytes } from 'node:crypto';

import { config } from 'dotenv';
import { Client, Users, Query, ID } from 'node-appwrite';

config({ quiet: true });

const [, , email, ...nameParts] = process.argv;
const name = nameParts.join(' ') || 'Administrator';

if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/appwrite-create-admin.mjs <email> [name]');
  process.exit(1);
}

const endpoint =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!projectId || !apiKey) {
  console.error('Missing config. Set NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_API_KEY');
  process.exit(1);
}

const users = new Users(
  new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
);

/** Base58-ish alphabet: no look-alike characters to mistype when copying. */
function generatePassword(length = 20) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const existing = await users.list({ queries: [Query.equal('email', email), Query.limit(1)] });

if (existing.total > 0) {
  const user = existing.users[0];
  console.log(`\nA user with that email already exists.`);
  console.log(`  ADMIN_USER_ID=${user.$id}\n`);
  console.log('Put that line in .env. To reset its password, do so in the Appwrite console.\n');
  process.exit(0);
}

const password = generatePassword();
const user = await users.create({ userId: ID.unique(), email, password, name });

console.log('\nAdmin user created.\n');
console.log(`  email:    ${user.email}`);
console.log(`  password: ${password}`);
console.log(`\nAdd this line to .env:\n\n  ADMIN_USER_ID=${user.$id}\n`);
console.log('Save the password now -- it is not stored anywhere and cannot be shown again.\n');
