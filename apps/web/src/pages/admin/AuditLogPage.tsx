import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { Paginated } from '@exam/shared';
import { get } from '../../api/client';
import { Empty, ErrorAlert, PageHead, Spinner } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';

interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
  actor: { email: string; fullName: string } | null;
}

interface Integrity {
  checked: number;
  mismatches: { attemptId: string; examId: string; storedScore: number }[];
}

export function AuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (entityType) params.set('entityType', entityType);
  const logs = useQuery({
    queryKey: ['audit', params.toString()],
    queryFn: () => get<Paginated<AuditEntry>>(`/admin/audit-logs?${params}`),
    placeholderData: keepPreviousData,
  });
  const integrity = useQuery({ queryKey: ['integrity'], queryFn: () => get<Integrity>('/integrity/results'), enabled: false });

  const data = logs.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <>
      <PageHead
        title="Audit log"
        subtitle="Append-only: the database rejects any UPDATE or DELETE on this table."
        actions={
          <button onClick={() => integrity.refetch()} disabled={integrity.isFetching}>
            {integrity.isFetching ? 'Verifying…' : 'Verify all result checksums'}
          </button>
        }
      />
      <ErrorAlert error={integrity.error} />
      {integrity.data && (
        <div className={`alert ${integrity.data.mismatches.length ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
          Checked {integrity.data.checked} results.{' '}
          {integrity.data.mismatches.length === 0
            ? 'All checksums match.'
            : `${integrity.data.mismatches.length} result(s) were modified outside the application: `}
          {integrity.data.mismatches.map((m) => (
            <Link key={m.attemptId} to={`/teacher/attempts/${m.attemptId}`} style={{ marginRight: 8 }}>
              {m.attemptId.slice(0, 8)}
            </Link>
          ))}
        </div>
      )}
      <div className="card row">
        <select value={entityType} onChange={(e) => (setEntityType(e.target.value), setPage(1))} style={{ maxWidth: 200 }}>
          <option value="">All entities</option>
          <option value="result">Results</option>
          <option value="attempt">Attempts</option>
          <option value="exam">Exams</option>
          <option value="user">Users</option>
        </select>
      </div>
      <div className="card">
        <ErrorAlert error={logs.error} />
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Empty>No entries.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Reason</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{fmtDateTime(e.createdAt)}</td>
                    <td className="small">{e.actor?.fullName ?? 'system'}</td>
                    <td>
                      <span className="badge">{e.action}</span>
                    </td>
                    <td className="small">
                      {e.entityType === 'result' || e.entityType === 'attempt' ? (
                        <Link to={`/teacher/attempts/${e.entityId}`}>
                          {e.entityType} {e.entityId.slice(0, 8)}
                        </Link>
                      ) : (
                        `${e.entityType} ${e.entityId.slice(0, 8)}`
                      )}
                    </td>
                    <td className="small">{e.reason}</td>
                    <td className="small muted" style={{ maxWidth: 360, wordBreak: 'break-word' }}>
                      {e.oldValue ? JSON.stringify(e.oldValue) : ''} → {e.newValue ? JSON.stringify(e.newValue) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </>
  );
}
