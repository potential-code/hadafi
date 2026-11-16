#!/usr/bin/env node
// Generates a new operator key (Maya, the AI operator). See docs/operator-access.md.
//
//   node scripts/generate-operator-key.mjs --label maya-staging-2026-11
//
// Prints the raw key ONCE, for the operator's secret store, and the
// `label:sha256` entry for OPERATOR_API_KEYS. The server only ever gets the
// entry; the raw key is not stored anywhere by this script. Needs no database
// or env, so run it on your own machine, not on a server.
//
// It refuses to print into a pipe or a log (stdout not a terminal) unless
// --allow-non-tty is given, so a key does not end up in CI or shell logs.
import { createHash, randomBytes } from 'node:crypto'

const args = process.argv.slice(2)
const argValue = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

const label = argValue('--label')
// Same rule the server applies when it reads OPERATOR_API_KEYS (auth/operatorKeys.ts).
if (!label || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(label)) {
  console.error('Usage: node scripts/generate-operator-key.mjs --label <label>')
  console.error('  <label>: letters, digits, ".", "_" or "-", up to 64 characters, e.g. maya-staging-2026-11')
  process.exit(1)
}

if (!process.stdout.isTTY && !args.includes('--allow-non-tty')) {
  console.error('Refusing to print a new key: stdout is not a terminal (it would land in a pipe or log).')
  console.error('Run it in a terminal, or pass --allow-non-tty if you really mean to capture it.')
  process.exit(1)
}

const key = `hadafi_op_${randomBytes(32).toString('base64url')}`
const hash = createHash('sha256').update(key, 'utf8').digest('hex')

console.log(`New operator key "${label}". It is shown once: put it in the operator's secret store now.`)
console.log('')
console.log(`  ${key}`)
console.log('')
console.log('Add this entry to OPERATOR_API_KEYS on the server (comma-separate several entries):')
console.log('')
console.log(`  ${label}:${hash}`)
