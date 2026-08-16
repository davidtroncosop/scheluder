const baseUrl = (process.env.SCHEDULER_BASE_URL || 'https://scheduler-pro.pages.dev').replace(/\/$/, '');
const timeoutMs = Number(process.env.SCHEDULER_MONITOR_TIMEOUT_MS || 10_000);

async function check(path, validate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { 'User-Agent': 'scheduler-pro-monitor/1.0' },
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok || !validate(body)) {
      throw new Error(`${path} respondió ${response.status}: ${body.slice(0, 200)}`);
    }
    return { path, status: response.status, latency_ms: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

const results = await Promise.all([
  check('/', (body) => body.includes('id="root"')),
  check('/api/health', (body) => {
    try {
      return JSON.parse(body).status === 'ok';
    } catch {
      return false;
    }
  }),
]);

console.log(JSON.stringify({ checked_at: new Date().toISOString(), base_url: baseUrl, results }, null, 2));
