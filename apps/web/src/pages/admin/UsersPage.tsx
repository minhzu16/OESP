import { FormEvent, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, Role, UserDto } from '@exam/shared';
import { get, patch, post } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert, Modal, PageHead, Spinner } from '../../components/ui';

export function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (role) params.set('role', role);
  if (search) params.set('search', search);
  const users = useQuery({
    queryKey: ['admin-users', params.toString()],
    queryFn: () => get<Paginated<UserDto>>(`/admin/users?${params}`),
    placeholderData: keepPreviousData,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<UserDto> }) => patch(`/admin/users/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const data = users.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <>
      <PageHead
        title="Users"
        subtitle="Role and status changes are written to the audit log; disabling a user revokes their sessions."
        actions={
          <button className="primary" onClick={() => setCreating(true)}>
            New user
          </button>
        }
      />
      <div className="card row">
        <input placeholder="Search name or email" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} style={{ maxWidth: 300 }} />
        <select value={role} onChange={(e) => (setRole(e.target.value), setPage(1))} style={{ maxWidth: 160 }}>
          <option value="">All roles</option>
          <option value="ADMIN">Admin</option>
          <option value="TEACHER">Teacher</option>
          <option value="STUDENT">Student</option>
        </select>
        <span className="spacer" />
        <span className="muted small">{data?.total ?? 0} users</span>
      </div>
      <div className="card">
        <ErrorAlert error={users.error ?? update.error} />
        {!data ? (
          <Spinner />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })}
                      style={{ width: 'auto' }}
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="TEACHER">TEACHER</option>
                      <option value="STUDENT">STUDENT</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className={`sm ${u.isActive ? '' : 'danger'}`}
                      disabled={u.id === me?.id}
                      onClick={() => update.mutate({ id: u.id, body: { isActive: !u.isActive } })}
                    >
                      {u.isActive ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <div className="row end mt">
            <button className="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← Prev
            </button>
            <span className="small muted">
              {page}/{pages}
            </span>
            <button className="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>
      {creating && <CreateUser onClose={() => setCreating(false)} onDone={() => void qc.invalidateQueries({ queryKey: ['admin-users'] })} />}
    </>
  );
}

function CreateUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ fullName: '', email: '', password: '', role: 'TEACHER' as Role });
  const m = useMutation({
    mutationFn: () => post('/admin/users', f),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal title="New user" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <ErrorAlert error={m.error} />
        <label className="field">
          Full name
          <input required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        </label>
        <label className="field">
          Email
          <input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <label className="field">
          Initial password
          <input type="password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </label>
        <label className="field">
          Role
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            <option value="TEACHER">Teacher</option>
            <option value="STUDENT">Student</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={m.isPending}>
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}
