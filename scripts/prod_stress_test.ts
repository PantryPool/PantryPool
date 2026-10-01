/**
 * 🛡️ PantryPool — Production-Safe Multi-Stage API Load & Stress Runner
 *
 * Designed to safely benchmark live edge/production deployments without
 * corrupting business ledgers, triggering expensive third-party APIs (Stripe / Gemini OCR),
 * or flooding external webhooks.
 *
 * Usage:
 *   TARGET_URL=https://pantrypool.com npm run test:stress:prod
 *   TARGET_URL=http://localhost:3000 AUTH_TOKEN=test_token npm run test:stress:prod
 */

interface StageConfig {
  name: string;
  vus: number;
  durationMs: number;
}

interface RequestMetric {
  status: number;
  latencyMs: number;
  error?: string;
  endpoint: string;
}

interface StageReport {
  stageName: string;
  targetVus: number;
  durationSec: number;
  totalRequests: number;
  successfulRequests: number;
  clientErrors: number; // 4xx
  serverErrors: number; // 5xx
  networkErrors: number;
  rps: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
}

// Blocked endpoints on production to protect credits and webhook channels
const BLOCKED_PROD_PATTERNS = [
  '/api/parse-receipt', // Uses Gemini AI API tokens
  '/api/stripe/create-checkout-session', // Triggers Stripe session creation
  '/api/webhooks/test-dispatch', // Triggers live Slack/Teams spam
];

function isEndpointSafeForProd(path: string): boolean {
  return !BLOCKED_PROD_PATTERNS.some((pattern) => path.includes(pattern));
}

async function executeRequest(
  baseUrl: string,
  path: string,
  token?: string
): Promise<RequestMetric> {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const t0 = performance.now();

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'PantryPool-LoadTest-Runner/1.0',
      Accept: 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s SLA timeout

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = performance.now() - t0;
    return {
      status: res.status,
      latencyMs,
      endpoint: path,
    };
  } catch (err: any) {
    const latencyMs = performance.now() - t0;
    return {
      status: 0,
      latencyMs,
      error: err.name === 'AbortError' ? 'Timeout (10s)' : err.message || 'Network Failure',
      endpoint: path,
    };
  }
}

async function runStage(
  baseUrl: string,
  stage: StageConfig,
  endpoints: string[],
  token?: string
): Promise<StageReport> {
  const metrics: RequestMetric[] = [];
  const startTime = performance.now();
  const endTime = startTime + stage.durationMs;

  console.log(`⏳ Running Stage: [${stage.name}] — Target: ${stage.vus} Virtual Users for ${(stage.durationMs / 1000).toFixed(0)}s...`);

  // Run continuous VU workers until stage duration finishes
  const vuWorkers = Array.from({ length: stage.vus }, async () => {
    while (performance.now() < endTime) {
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      const metric = await executeRequest(baseUrl, endpoint, token);
      metrics.push(metric);
      // Small randomized jitter between requests (5ms - 25ms)
      await new Promise((r) => setTimeout(r, Math.random() * 20 + 5));
    }
  });

  await Promise.all(vuWorkers);
  const totalDurationMs = performance.now() - startTime;

  const latencies = metrics.map((m) => m.latencyMs).sort((a, b) => a - b);
  const successful = metrics.filter((m) => m.status >= 200 && m.status < 400).length;
  const clientErrors = metrics.filter((m) => m.status >= 400 && m.status < 500).length;
  const serverErrors = metrics.filter((m) => m.status >= 500).length;
  const networkErrors = metrics.filter((m) => m.status === 0).length;

  const p50Ms = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p90Ms = latencies[Math.floor(latencies.length * 0.90)] || 0;
  const p95Ms = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99Ms = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const minMs = latencies[0] || 0;
  const maxMs = latencies[latencies.length - 1] || 0;
  const rps = metrics.length / (totalDurationMs / 1000);

  return {
    stageName: stage.name,
    targetVus: stage.vus,
    durationSec: Number((totalDurationMs / 1000).toFixed(1)),
    totalRequests: metrics.length,
    successfulRequests: successful,
    clientErrors,
    serverErrors,
    networkErrors,
    rps: Number(rps.toFixed(1)),
    p50Ms: Number(p50Ms.toFixed(1)),
    p90Ms: Number(p90Ms.toFixed(1)),
    p95Ms: Number(p95Ms.toFixed(1)),
    p99Ms: Number(p99Ms.toFixed(1)),
    minMs: Number(minMs.toFixed(1)),
    maxMs: Number(maxMs.toFixed(1)),
  };
}

async function main() {
  const targetUrl = process.env.TARGET_URL || 'https://pantrypool.com';
  const token = process.env.AUTH_TOKEN || undefined;
  const poolId = process.env.TEST_POOL_ID || 'pool_production_demo';
  const fastMode = process.env.FAST_MODE === 'true' || process.env.CI === 'true';

  console.log('======================================================================');
  console.log('   🛡️ PantryPool — Production-Safe Multi-Stage Load & Stress Runner');
  console.log('======================================================================');
  console.log(`🌐 Target Base URL : ${targetUrl}`);
  console.log(`🔑 Auth Token      : ${token ? 'Configured (Bearer)' : 'None (Public Endpoints Only)'}`);
  console.log(`🎯 Test Pool ID    : ${poolId}`);
  console.log(`⚡ Mode            : ${fastMode ? 'Fast Benchmark (5s stages)' : 'Full Multi-Stage Load (10s stages)'}`);
  console.log('----------------------------------------------------------------------\n');

  // Candidate production-safe endpoints
  const endpoints = [
    '/api/health',
    `/api/items?poolId=${encodeURIComponent(poolId)}`,
    '/api/pools',
  ];

  // Verify all endpoints are production-safe
  endpoints.forEach((ep) => {
    if (!isEndpointSafeForProd(ep)) {
      throw new Error(`Unsafe endpoint detected for production stress test: ${ep}`);
    }
  });

  // Pre-flight probe
  console.log('🔍 Executing Pre-Flight Health Probe on target...');
  const probe = await executeRequest(targetUrl, '/api/health');
  if (probe.status !== 200 && probe.status !== 404) {
    console.warn(`⚠️ Warning: Pre-flight probe returned HTTP status ${probe.status} (${probe.error || 'Check connectivity'})`);
  } else {
    console.log(`✅ Pre-flight probe successful (${probe.latencyMs.toFixed(1)}ms latency)\n`);
  }

  const stageDuration = fastMode ? 5000 : 10000;

  // 4-Stage Ramp Profile: Warmup -> Steady -> Peak Rush -> Cooldown
  const stages: StageConfig[] = [
    { name: '1. Warm-Up Stage', vus: 10, durationMs: stageDuration },
    { name: '2. Nominal Load', vus: 30, durationMs: stageDuration },
    { name: '3. Rush-Hour Peak', vus: 75, durationMs: stageDuration },
    { name: '4. Recovery & Cooldown', vus: 10, durationMs: stageDuration },
  ];

  const reports: StageReport[] = [];

  for (const stage of stages) {
    const report = await runStage(targetUrl, stage, endpoints, token);
    reports.push(report);
  }

  console.log('\n=========================================================================================================');
  console.log('📊 Production Load & Stress Test Performance Matrix');
  console.log('=========================================================================================================');
  console.table(
    reports.map((r) => ({
      Stage: r.stageName,
      'VUs': r.targetVus,
      'Total Req': r.totalRequests,
      'Throughput (req/s)': r.rps,
      '2xx/3xx': r.successfulRequests,
      '4xx': r.clientErrors,
      '5xx': r.serverErrors,
      'Net Err': r.networkErrors,
      'P50 Latency': `${r.p50Ms}ms`,
      'P95 Latency': `${r.p95Ms}ms`,
      'P99 Latency': `${r.p99Ms}ms`,
      'Max Latency': `${r.maxMs}ms`,
    }))
  );

  const totalServerErrors = reports.reduce((acc, r) => acc + r.serverErrors, 0);
  const totalNetworkErrors = reports.reduce((acc, r) => acc + r.networkErrors, 0);

  if (totalServerErrors === 0 && totalNetworkErrors === 0) {
    console.log('✅ SLA Budget Met: 0 server 5xx drops and 0 connection timeouts under load.\n');
    process.exit(0);
  } else {
    console.error(`❌ Load Test Failure: Detected ${totalServerErrors} 5xx server errors and ${totalNetworkErrors} network timeouts.\n`);
    process.exit(1);
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('prod_stress_test')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
