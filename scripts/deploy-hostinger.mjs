// Deploys the built frontend (dist/, a static Vite build) to Hostinger static/shared hosting over
// FTP/FTPS. The backend (server/) is a separate deployment — see server/package.json — typically
// on its own VPS; it is NOT touched by this script.
//
//   1. Connects using FTP_HOST / FTP_USER / FTP_PASSWORD.
//   2. Wipes the contents of FTP_REMOTE_PATH on the server (keeping anything
//      listed in FTP_KEEP — by default .htaccess, .well-known and .env).
//   3. Uploads everything in the local dist/ folder in its place.
//
// Run `npm run build` first — this script does not build for you.
//
// Usage:
//   node scripts/deploy-hostinger.mjs                    interactive, asks to confirm the wipe
//   node scripts/deploy-hostinger.mjs --yes               skips the confirmation (used in CI)
//   node scripts/deploy-hostinger.mjs --test-connection   just connects and lists FTP_REMOTE_PATH,
//                                                          no wipe, no upload — use this to check
//                                                          reachability/credentials before deploying
//
// Credentials come from .env.deploy locally (gitignored — copy
// .env.deploy.example and fill it in) or from real environment variables in CI.

import { Client } from 'basic-ftp';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env.deploy') });

// Plain destructuring defaults only apply to `undefined` — CI providers (GitHub
// Actions included) inject an unset secret as an empty string, not undefined,
// which would silently skip these defaults. `||` catches both cases.
// const FTP_HOST = process.env.FTP_HOST || '';
// const FTP_USER = process.env.FTP_USER || '';
const FTP_PASSWORD = process.env.FTP_PASSWORD || '';
// const FTP_PORT = process.env.FTP_PORT || '';
// const FTP_REMOTE_PATH = (process.env.FTP_REMOTE_PATH || 'public_html')
//   .trim()
//   .replace(/^\/+|\/+$/g, '');
// const FTP_SECURE = process.env.FTP_SECURE || 'true';
const FTP_KEEP = process.env.FTP_KEEP || '.well-known,.htaccess,.env';
// If you must connect via a raw IP but the server's TLS cert is issued for a
// domain (common on shared hosting), set this to that domain so cert
// validation checks the right name instead of the IP you dialed.
// const FTP_TLS_SERVERNAME = process.env.FTP_TLS_SERVERNAME || '';
// Last resort only: disables TLS certificate validation entirely. Prefer
// FTP_TLS_SERVERNAME above — this opens the door to man-in-the-middle attacks.
const FTP_TLS_INSECURE = process.env.FTP_TLS_INSECURE === 'true';

const FTP_HOST = (process.env.FTP_HOST || '').trim();
const FTP_USER = (process.env.FTP_USER || '').trim();
const FTP_PORT = (process.env.FTP_PORT || '').trim();
const FTP_REMOTE_PATH = (process.env.FTP_REMOTE_PATH || 'public_html')
  .trim()
  .replace(/^\/+|\/+$/g, '');
const FTP_SECURE = (process.env.FTP_SECURE || 'true').trim();
const FTP_TLS_SERVERNAME = (process.env.FTP_TLS_SERVERNAME || '').trim();

const distDir = path.join(projectRoot, 'dist');
const testConnectionOnly = process.argv.includes('--test-connection');
const skipConfirm = process.argv.includes('--yes') || process.env.CI === 'true';
const keepList = FTP_KEEP.split(',').map((s) => s.trim()).filter(Boolean);

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function confirm(question) {
  if (skipConfirm) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function clearRemoteDir(client) {
  const entries = await client.list();
  for (const entry of entries) {
    if (keepList.includes(entry.name)) {
      console.log(`  keeping   ${entry.name}`);
      continue;
    }
    if (entry.isDirectory) {
      console.log(`  removing  ${entry.name}/`);
      await client.removeDir(entry.name);
    } else {
      console.log(`  removing  ${entry.name}`);
      await client.remove(entry.name);
    }
  }
}

function cleanHost(rawHost) {
  const trimmed = rawHost.trim();
  // Common copy-paste mistakes from hPanel: a protocol prefix or trailing slash.
  const cleaned = trimmed.replace(/^ftps?:\/\//i, '').replace(/\/+$/, '');
  if (cleaned !== trimmed) {
    console.warn(`  note: FTP_HOST had "${trimmed}" — using "${cleaned}" instead (no protocol/trailing slash).`);
  }
  return cleaned;
}

async function main() {
  if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
    fail(
      'Missing FTP credentials.\n' +
      'Copy .env.deploy.example to .env.deploy and fill in FTP_HOST, FTP_USER, FTP_PASSWORD\n' +
      '(or set them as real environment variables / CI secrets).'
    );
  }

  const host = cleanHost(FTP_HOST);

  if (!testConnectionOnly) {
    if (!fs.existsSync(distDir) || fs.readdirSync(distDir).length === 0) {
      fail(`dist/ is missing or empty. Run "npm run build" first.`);
    }

    console.log(`\nDeploying dist/ -> ${host}:${FTP_REMOTE_PATH}\n`);
    console.log(`This will DELETE everything currently in ${FTP_REMOTE_PATH} on the server`);
    console.log(`(except: ${keepList.join(', ') || '(nothing)'}), then upload the new build.\n`);

    const proceed = await confirm('Type "yes" to continue: ');
    if (!proceed) {
      console.log('\nAborted — nothing was changed.\n');
      process.exit(0);
    }
  } else {
    console.log(`\nTesting connection -> ${host}:${FTP_REMOTE_PATH} (no changes will be made)\n`);
  }

  const client = new Client();
  client.ftp.verbose = false;

  const secureOptions = {};
  if (FTP_TLS_SERVERNAME) {
    console.log(`  note: validating TLS cert against "${FTP_TLS_SERVERNAME}" instead of "${host}".`);
    secureOptions.servername = FTP_TLS_SERVERNAME;
  }
  if (FTP_TLS_INSECURE) {
    console.warn('  ⚠ FTP_TLS_INSECURE is set — TLS certificate validation is DISABLED for this connection.');
    secureOptions.rejectUnauthorized = false;
  }

  try {
    await client.access({
      host,
      user: FTP_USER,
      password: FTP_PASSWORD,
      port: FTP_PORT ? Number(FTP_PORT) : undefined,
      secure: FTP_SECURE !== 'false',
      secureOptions,
    });

    console.log('✔ Connected and authenticated.');

    await client.ensureDir(FTP_REMOTE_PATH);
    console.log(`✔ Reached ${FTP_REMOTE_PATH}.\n`);

    if (testConnectionOnly) {
      const entries = await client.list();
      if (entries.length === 0) {
        console.log('(directory is empty)');
      } else {
        for (const entry of entries) {
          console.log(`  ${entry.isDirectory ? 'dir ' : 'file'}  ${entry.name}`);
        }
      }
      console.log('\n✔ Connection test passed — no files were changed.\n');
      return;
    }

    console.log('Clearing remote directory...');
    await clearRemoteDir(client);

    console.log('\nUploading dist/ ...');
    await client.uploadFromDir(distDir);

    console.log('\n✔ Deploy complete.\n');
  } catch (error) {
    // error.message is sometimes empty for low-level socket/TLS failures — the
    // real detail lives in .code or the stack instead, so dump everything
    // rather than risk a blank, undebuggable log line.
    console.error('\nRaw error (for debugging):');
    console.error(error);
    const summary = error.message || error.code || 'unknown error — see raw error above';
    fail(`Deploy failed: ${summary}`);
  } finally {
    client.close();
  }
}

main();
