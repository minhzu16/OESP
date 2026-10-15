import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';

const LINKS = {
  STUDENT: [{ to: '/student', label: 'My exams' }],
  TEACHER: [
    { to: '/teacher/exams', label: 'Exams' },
    { to: '/teacher/banks', label: 'Question banks' },
    { to: '/teacher/classes', label: 'Classes' },
  ],
  ADMIN: [
    { to: '/teacher/exams', label: 'Exams' },
    { to: '/teacher/banks', label: 'Question banks' },
    { to: '/teacher/classes', label: 'Classes' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/audit', label: 'Audit log' },
  ],
} as const;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <>
      <header className="app-header">
        <span className="brand">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
            <rect width="32" height="32" rx="8" fill="var(--primary)" />
            <path d="M7 10L16 6L25 10L16 14L7 10Z" fill="white" fillOpacity="0.95" />
            <path d="M10 13.5V20.5C10 23 12.7 25 16 25C19.3 25 22 23 22 20.5V13.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <path d="M25 10.5V18" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>Online Exam System</span>
        </span>
        <nav>
          {LINKS[user.role].map((l) => (
            <NavLink key={l.to} to={l.to}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <div className="user-info">
            <span style={{ fontWeight: 600 }}>{user.fullName}</span>
            <span className={`badge ${user.role === 'ADMIN' ? 'red' : user.role === 'TEACHER' ? 'blue' : 'amber'}`}>
              {user.role}
            </span>
          </div>
          <button
            className="sm ghost"
            title="Sign out of system"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
