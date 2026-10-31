const VERCEL_URL = process.env.VERCEL_URL || 'https://exam-pern.vercel.app';

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function runVercelLoad(vuCount = 71) {
  console.log(`\n======================================================`);
  console.log(`🌐 Starting Vercel Frontend Load Test: ${vuCount} VUs`);
  console.log(`Target: ${VERCEL_URL}`);
  console.log(`======================================================\n`);

  const t0 = Date.now();
  const vus = Array.from({ length: vuCount }, (_, i) => i + 1);

  const results = await Promise.all(
    vus.map(async (id) => {
      const start = Date.now();
      try {
        const res = await fetch(`${VERCEL_URL}/student/login`, {
          method: 'GET',
          headers: { 'User-Agent': `LoadTest-VU-${id}` },
        });
        const duration = Date.now() - start;
        return { id, status: res.status, duration, error: res.ok ? null : `HTTP ${res.status}` };
      } catch (err) {
        return { id, status: 0, duration: Date.now() - start, error: err.message };
      }
    })
  );

  const totalTime = Date.now() - t0;
  const durations = results.map((r) => r.duration);
  const status200 = results.filter((r) => r.status === 200).length;
  const errors = results.filter((r) => r.status !== 200).length;

  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const p99 = percentile(durations, 99);

  console.log(`--- Vercel Frontend Performance Results ---`);
  console.log(`Total Requests:  ${results.length}`);
  console.log(`200 OK:          ${status200} / ${results.length} (${Math.round((status200 / results.length) * 100)}%)`);
  console.log(`Errors:          ${errors}`);
  console.log(`Latency min:     ${min}ms`);
  console.log(`Latency p50:     ${p50}ms`);
  console.log(`Latency p95:     ${p95}ms`);
  console.log(`Latency p99:     ${p99}ms`);
  console.log(`Latency max:     ${max}ms`);
  console.log(`Total Wall Time: ${totalTime}ms\n`);

  return {
    vus: vuCount,
    status200,
    errors,
    min,
    p50,
    p95,
    p99,
    max,
  };
}

module.exports = { runVercelLoad };

if (require.main === module) {
  const vus = parseInt(process.argv[2], 10) || 71;
  runVercelLoad(vus);
}

