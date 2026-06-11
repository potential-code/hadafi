import bcrypt from 'bcryptjs'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { users } from '../schema/index.ts'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const db = drizzle(client)

const passwordHash = await bcrypt.hash('password', 12)

await db.insert(users).values({
  fullName: 'Admin',
  email: 'admin@email.com',
  passwordHash,
  role: 'admin',
}).onConflictDoNothing()

console.log('Admin user seeded: admin@email.com')
await client.end()
