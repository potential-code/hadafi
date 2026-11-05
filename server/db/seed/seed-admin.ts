import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { authAccounts, users } from '../schema/index.ts'
import { hashPassword } from '../../auth/password.ts'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const db = drizzle(client)

const [admin] = await db.insert(users).values({
  fullName: 'Admin',
  email: 'admin@email.com',
  emailVerified: true,
  role: 'admin',
}).onConflictDoNothing().returning({ id: users.id })

// A Better Auth credential account is what makes the password work.
if (admin) {
  await db.insert(authAccounts).values({
    accountId: admin.id,
    providerId: 'credential',
    userId: admin.id,
    password: await hashPassword('password'),
  })
}

console.log('Admin user seeded: admin@email.com')
await client.end()
