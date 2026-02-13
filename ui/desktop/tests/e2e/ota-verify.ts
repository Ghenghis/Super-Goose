#!/usr/bin/env npx tsx
/**
 * OTA Verification Script
 *
 * Standalone script that checks whether the goosed backend is running
 * a correctly fingerprinted binary after an OTA self-improvement cycle.
 *
 * Usage:
 *   npx tsx tests/e2e/ota-verify.ts
 *   npx tsx tests/e2e/ota-verify.ts --url=http://localhost:3284
 *   npx tsx tests/e2e/ota-verify.ts --expected-hash=abc1234
 *   npx tsx tests/e2e/ota-verify.ts --min-timestamp=1739475600
 */

const args = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found?.split('=')[1];
};

const BACKEND_URL = getArg('url') || process.env.GOOSE_BACKEND_URL || 'http://localhost:3284';
const EXPECTED_HASH = getArg('expected-hash');
const MIN_TIMESTAMP = getArg('min-timestamp');

interface VersionInfo {
  version: string;
  build_timestamp: string;
  git_hash: string;
  binary_path: string | null;
}

interface OtaStatus {
  state: string;
  current_version: string;
  pending_improvements: number;
  last_build_time: string | null;
  last_build_result: string | null;
}

async function verify() {
  console.log(`\n=== OTA Verification ===`);
  console.log(`Backend URL: ${BACKEND_URL}\n`);

  // Check version endpoint
  let version: VersionInfo;
  try {
    const res = await fetch(`${BACKEND_URL}/api/version`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`FAIL: /api/version returned HTTP ${res.status}`);
      process.exit(1);
    }
    version = await res.json();
  } catch (err) {
    console.error(`FAIL: Cannot reach ${BACKEND_URL}/api/version`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  console.log(`Version:    ${version.version}`);
  console.log(`Timestamp:  ${version.build_timestamp} (${new Date(parseInt(version.build_timestamp, 10) * 1000).toISOString()})`);
  console.log(`Git Hash:   ${version.git_hash}`);
  console.log(`Binary:     ${version.binary_path || 'N/A'}`);

  let failures = 0;

  // Validate timestamp is a reasonable unix epoch
  const ts = parseInt(version.build_timestamp, 10);
  if (isNaN(ts) || ts < 1735689600 || ts > 1893456000) {
    console.error(`FAIL: build_timestamp "${version.build_timestamp}" is not a valid recent epoch`);
    failures++;
  }

  // Check expected hash if provided
  if (EXPECTED_HASH) {
    if (version.git_hash !== EXPECTED_HASH) {
      console.error(`FAIL: git_hash "${version.git_hash}" !== expected "${EXPECTED_HASH}"`);
      failures++;
    } else {
      console.log(`PASS: git_hash matches expected "${EXPECTED_HASH}"`);
    }
  }

  // Check minimum timestamp if provided
  if (MIN_TIMESTAMP) {
    const minTs = parseInt(MIN_TIMESTAMP, 10);
    if (ts < minTs) {
      console.error(`FAIL: build_timestamp ${ts} < minimum ${minTs}`);
      failures++;
    } else {
      console.log(`PASS: build_timestamp ${ts} >= minimum ${minTs}`);
    }
  }

  // Check OTA status
  console.log(`\n--- OTA Status ---`);
  try {
    const res = await fetch(`${BACKEND_URL}/api/ota/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const status: OtaStatus = await res.json();
      console.log(`State:       ${status.state}`);
      console.log(`Version:     ${status.current_version}`);
      console.log(`Pending:     ${status.pending_improvements}`);
      console.log(`Last Build:  ${status.last_build_time || 'never'}`);
      console.log(`Last Result: ${status.last_build_result || 'none'}`);

      if (status.current_version !== version.version) {
        console.error(`WARN: OTA version "${status.current_version}" !== api version "${version.version}"`);
      }
    } else {
      console.error(`WARN: /api/ota/status returned HTTP ${res.status}`);
    }
  } catch {
    console.error(`WARN: Cannot reach /api/ota/status`);
  }

  // Check OTA history
  console.log(`\n--- OTA History ---`);
  try {
    const res = await fetch(`${BACKEND_URL}/api/ota/history`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const history = await res.json();
      console.log(`Total cycles: ${history.length}`);
      if (history.length > 0) {
        const latest = history[history.length - 1];
        console.log(`Latest: ${latest.status} at ${latest.started_at}`);
      }
    }
  } catch {
    console.error(`WARN: Cannot reach /api/ota/history`);
  }

  // Check autonomous status
  console.log(`\n--- Autonomous Daemon ---`);
  try {
    const res = await fetch(`${BACKEND_URL}/api/autonomous/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const auto = await res.json();
      console.log(`Running:     ${auto.running}`);
      console.log(`Tasks:       ${auto.tasks_completed} OK / ${auto.tasks_failed} failed`);
      console.log(`Breaker:     ${auto.circuit_breaker?.state}`);
    }
  } catch {
    console.error(`WARN: Cannot reach /api/autonomous/status`);
  }

  console.log(`\n=== Result: ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`} ===\n`);
  process.exit(failures > 0 ? 1 : 0);
}

verify();
