// Deploys the built web app + server (dist/) to Hostinger over FTP/FTPS.
//
// FTP_REMOTE_PATH is also the root of Hostinger's Node.js app (hPanel > Node.js):
// dist/server.cjs is its startup file, and it requires express/@google/genai/etc.
// from node_modules at runtime (esbuild bundled it with --packages=external, see
// package.json's "build" script) rather than inlining them. So this script:
//
//   1. Connects using FTP_HOST / FTP_USER / FTP_PASSWORD.
//   2. Wipes the contents of FTP_REMOTE_PATH on the server (keeping anything
//      listed in FTP_KEEP — by default node_modules, package.json,
//      package-lock.json, .htaccess, .well-known and tmp, so the Node app's
//      dependencies and Passenger restart hook survive the wipe).
//   3. Uploads everything in the local dist/ folder in its place.
//   4. Uploads package.json (and package-lock.json if present) to
//      FTP_REMOTE_PATH so the manifest node_modules was installed from stays
//      current. This does NOT run `npm install` for you — if dependencies
//      changed, run it from hPanel's Node.js terminal after this deploy.
//   5. Best-effort: touches tmp/restart.txt in FTP_REMOTE_PATH. Hostinger's
//      Node.js hosting is Passenger-based on most plans, where this makes the
//      app reload on its next request. Harmless no-op if your plan doesn't
//      use Passenger — verify the app actually picked up the new code after
//      your first deploy, and restart manually from hPanel if it didn't.
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
import { Readable } from 'stream';
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
const FTP_KEEP = process.env.FTP_KEEP || 'node_modules,package.json,package-lock.json,tmp,.well-known,.htaccess,.env';
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

    console.log('\nUploading dependency manifest...');
    for (const file of ['package.json', 'package-lock.json']) {
      const localPath = path.join(projectRoot, file);
      if (fs.existsSync(localPath)) {
        console.log(`  uploading ${file}`);
        await client.uploadFrom(localPath, file);
      }
    }

    console.log('\nTriggering app restart (best-effort)...');
    try {
      // cwd is still FTP_REMOTE_PATH here (nothing above this point changed
      // directory), so this creates/enters FTP_REMOTE_PATH/tmp.
      await client.ensureDir('tmp');
      await client.uploadFrom(Readable.from(Buffer.from(new Date().toISOString())), 'restart.txt');
      await client.cdup();
      console.log('  touched tmp/restart.txt — if your plan uses Passenger, the app reloads on its next request.');
    } catch (restartError) {
      console.warn(`  could not touch tmp/restart.txt (${restartError.message || restartError.code || restartError}) — restart the app manually from hPanel if needed.`);
    }

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
