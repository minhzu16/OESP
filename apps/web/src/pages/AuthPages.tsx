import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { homeFor, useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? homeFor(user), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ display: 'inline-flex', padding: 10, background: 'var(--primary-soft)', borderRadius: '12px', marginBottom: 12 }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
              <rect width="32" height="32" rx="8" fill="var(--primary)" />
              <path d="M7 10L16 6L25 10L16 14L7 10Z" fill="white" fillOpacity="0.95" />
              <path d="M10 13.5V20.5C10 23 12.7 25 16 25C19.3 25 22 23 22 20.5V13.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <path d="M25 10.5V18" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1>Online Examination Portal</h1>
          <p className="muted small">Enter your institutional credentials to access your exam dashboard</p>
        </div>
        <ErrorAlert error={error} />
        <label className="field">
          Email address
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@exam.local" />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <button className="primary" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Verifying credentials…' : 'Sign in to portal'}
        </button>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 8 }}>
          Need a student account? <Link to="/register">Register here</Link>
        </p>
      </form>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await register(form.email, form.password, form.fullName);
      navigate(homeFor(user), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ display: 'inline-flex', padding: 10, background: 'var(--primary-soft)', borderRadius: '12px', marginBottom: 12 }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
              <rect width="32" height="32" rx="8" fill="var(--primary)" />
              <path d="M7 10L16 6L25 10L16 14L7 10Z" fill="white" fillOpacity="0.95" />
              <path d="M10 13.5V20.5C10 23 12.7 25 16 25C19.3 25 22 23 22 20.5V13.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <path d="M25 10.5V18" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1>Create student account</h1>
          <p className="muted small">Enroll to participate in scheduled examinations</p>
        </div>
        <ErrorAlert error={error} />
        <label className="field">
          Full legal name
          <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="John Doe" />
        </label>
        <label className="field">
          Institutional email
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="student@exam.local" />
        </label>
        <label className="field">
          Password <span className="hint">Minimum 8 characters with letters & numbers</span>
          <input
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
          />
        </label>
        <button className="primary" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Creating account…' : 'Complete registration'}
        </button>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 8 }}>
          Already registered? <Link to="/login">Sign in here</Link>
        </p>
      </form>
    </div>
  );
}
