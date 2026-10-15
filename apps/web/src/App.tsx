import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import type { Role } from '@exam/shared';
import { homeFor, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { AttemptPage } from './features/attempt/AttemptPage';
import { ResultPage } from './pages/student/ResultPage';
import { BanksPage } from './pages/teacher/BanksPage';
import { BankDetailPage } from './pages/teacher/BankDetailPage';
import { ExamsPage } from './pages/teacher/ExamsPage';
import { ExamEditorPage } from './pages/teacher/ExamEditorPage';
import { ExamResultsPage } from './pages/teacher/ExamResultsPage';
import { AttemptReviewPage } from './pages/teacher/AttemptReviewPage';
import { ClassesPage } from './pages/teacher/ClassesPage';
import { UsersPage } from './pages/admin/UsersPage';
import { AuditLogPage } from './pages/admin/AuditLogPage';

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return <>{children}</>;
}

const STAFF: Role[] = ['TEACHER', 'ADMIN'];

export function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeFor(user)} replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to={homeFor(user)} replace /> : <RegisterPage />} />

      {/* Full-screen exam page without the app chrome. */}
      <Route
        path="/attempts/:id"
        element={
          <RequireRole roles={['STUDENT']}>
            <AttemptPage />
          </RequireRole>
        }
      />

      <Route element={<Layout />}>
        <Route path="/student" element={<RequireRole roles={['STUDENT']}><StudentDashboard /></RequireRole>} />
        <Route path="/attempts/:id/result" element={<RequireRole roles={['STUDENT']}><ResultPage /></RequireRole>} />

        <Route path="/teacher/banks" element={<RequireRole roles={STAFF}><BanksPage /></RequireRole>} />
        <Route path="/teacher/banks/:id" element={<RequireRole roles={STAFF}><BankDetailPage /></RequireRole>} />
        <Route path="/teacher/exams" element={<RequireRole roles={STAFF}><ExamsPage /></RequireRole>} />
        <Route path="/teacher/exams/:id" element={<RequireRole roles={STAFF}><ExamEditorPage /></RequireRole>} />
        <Route path="/teacher/exams/:id/results" element={<RequireRole roles={STAFF}><ExamResultsPage /></RequireRole>} />
        <Route path="/teacher/attempts/:id" element={<RequireRole roles={STAFF}><AttemptReviewPage /></RequireRole>} />
        <Route path="/teacher/classes" element={<RequireRole roles={STAFF}><ClassesPage /></RequireRole>} />

        <Route path="/admin/users" element={<RequireRole roles={['ADMIN']}><UsersPage /></RequireRole>} />
        <Route path="/admin/audit" element={<RequireRole roles={['ADMIN']}><AuditLogPage /></RequireRole>} />
      </Route>

      <Route path="*" element={<Navigate to={homeFor(user)} replace />} />
    </Routes>
  );
}
