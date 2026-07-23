import http from "k6/http";
import { check, sleep } from "k6";

const targetUrl = __ENV.TARGET_URL;
const p95Limit = Number(__ENV.K6_P95_MS || 2000);
const failureRateLimit = Number(__ENV.K6_MAX_FAILURE_RATE || 0.05);

export const options = {
  vus: Number(__ENV.K6_VUS || 3),
  duration: __ENV.K6_DURATION || "10s",
  thresholds: {
    http_req_duration: [`p(95)<${p95Limit}`],
    http_req_failed: [`rate<${failureRateLimit}`],
  },
};

export default function () {
  const response = http.get(targetUrl, {
    tags: { name: "target" },
    timeout: "30s",
  });
  check(response, {
    "status entre 200 e 399": result =>
      result.status >= 200 && result.status < 400,
  });
  sleep(1);
}
