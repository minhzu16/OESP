// k6 load test for the exam-day "thundering herd" (plan §13):
// N students start within a few seconds, autosave every ~5 s, then submit.
//
//   k6 run -e BASE_URL=http://localhost:5173 -e STUDENTS=500 load/exam-load.js
//
// Requires the seeded teacher account and "Math basics" bank. Creates a dedicated exam and
// N students in setup(), so do NOT run against production data.
// All virtual users share one IP, so start the API with AUTH_THROTTLE_LIMIT_PER_MINUTE above
// 2×STUDENTS (register + login) for the run; other routes are throttled per user.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = `${__ENV.BASE_URL || 'http://localhost:5173'}/api/v1`;
const STUDENTS = Number(__ENV.STUDENTS || 200);
const EXAM_MINUTES = Number(__ENV.EXAM_MINUTES || 3);
const PASSWORD = 'Password123!';
const json = { headers: { 'Content-Type': 'application/json' } };

const startLatency = new Trend('attempt_start_ms', true);
const saveLatency = new Trend('autosave_ms', true);
const submitLatency = new Trend('submit_ms', true);
const duplicateResults = new Counter('duplicate_submit_side_effects');

export const options = {
  setupTimeout: '10m',
  scenarios: {
    exam: {
      executor: 'per-vu-iterations',
      vus: STUDENTS,
      iterations: 1,
      maxDuration: `${EXAM_MINUTES + 5}m`,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    attempt_start_ms: ['p(95)<300'],
    autosave_ms: ['p(95)<300'],
    submit_ms: ['p(95)<500'],
    duplicate_submit_side_effects: ['count==0'],
  },
};

const auth = (token) => ({ headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });

export function setup() {
  const teacher = http.post(`${BASE}/auth/login`, JSON.stringify({ email: 'teacher@exam.local', password: PASSWORD }), json).json();
  const t = auth(teacher.accessToken);
  const bank = http.get(`${BASE}/banks`, t).json().find((b) => b.name === 'Math basics');
  const now = Date.now();
  const exam = http
    .post(
      `${BASE}/exams`,
      JSON.stringify({
        title: `Load test ${now}`,
        durationSeconds: EXAM_MINUTES * 60,
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + 3 * 3_600_000).toISOString(),
      }),
      t,
    )
    .json();
  http.put(`${BASE}/exams/${exam.id}/sections`, JSON.stringify({ sections: [{ bankId: bank.id, pickCount: 10 }] }), t);
  http.post(`${BASE}/exams/${exam.id}/publish`, '{}', t);

  const studentIds = [];
  for (let i = 0; i < STUDENTS; i++) {
    const email = `load-${now}-${i}@exam.local`;
    const res = http.post(`${BASE}/auth/register`, JSON.stringify({ email, password: PASSWORD, fullName: `Load ${i}` }), json);
    studentIds.push(res.json().user.id);
  }
  for (let i = 0; i < studentIds.length; i += 500) {
    http.post(`${BASE}/exams/${exam.id}/assignments`, JSON.stringify({ studentIds: studentIds.slice(i, i + 500) }), t);
  }
  return { examId: exam.id, prefix: `load-${now}` };
}

export default function (data) {
  const email = `${data.prefix}-${__VU - 1}@exam.local`;
  const login = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password: PASSWORD }), json);
  check(login, { 'login 200': (r) => r.status === 200 });
  const h = auth(login.json().accessToken);

  // Everyone clicks "Start" within ~5 seconds.
  sleep(Math.random() * 5);
  const started = http.post(`${BASE}/exams/${data.examId}/attempts`, '{}', h);
  startLatency.add(started.timings.duration);
  check(started, { 'start 201': (r) => r.status === 201 });
  const attempt = started.json();

  // Answer one question every ~5 s until ~10 s before the deadline.
  const stopAt = Date.parse(attempt.deadlineAt) - 10_000;
  let seq = 0;
  for (const q of attempt.questions) {
    if (Date.now() > stopAt) break;
    sleep(3 + Math.random() * 4);
    const option = q.options[Math.floor(Math.random() * q.options.length)];
    const res = http.put(
      `${BASE}/attempts/${attempt.id}/answers/${q.questionVersionId}`,
      JSON.stringify({ selectedOptionIds: [option.id], seq: ++seq }),
      h,
    );
    saveLatency.add(res.timings.duration);
    check(res, { 'autosave 200': (r) => r.status === 200 });
  }

  // Double-click submit: both must succeed, exactly one may have side effects.
  const headers = { headers: { ...h.headers, 'Idempotency-Key': `submit:${attempt.id}` } };
  const responses = http.batch([
    ['POST', `${BASE}/attempts/${attempt.id}/submit`, '{}', headers],
    ['POST', `${BASE}/attempts/${attempt.id}/submit`, '{}', headers],
  ]);
  for (const r of responses) {
    submitLatency.add(r.timings.duration);
    check(r, { 'submit 200': (x) => x.status === 200 });
  }
  const winners = responses.filter((r) => r.status === 200 && r.json().alreadySubmitted === false).length;
  if (winners > 1) duplicateResults.add(winners - 1);
}
