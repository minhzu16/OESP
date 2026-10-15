-- Optional least-privilege setup (plan §11.3 "phòng thủ ở tầng DB").
-- Run once as the database owner after migrations; then point the API's DATABASE_URL at exam_app
-- and keep the owner account for migrations only.
--
-- The triggers created by the migration already block UPDATE/DELETE on audit_logs and unaudited
-- changes to results for every role; this additionally removes the privileges themselves.

CREATE ROLE exam_app LOGIN PASSWORD 'CHANGE_ME';
GRANT CONNECT ON DATABASE exam TO exam_app;
GRANT USAGE ON SCHEMA public TO exam_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO exam_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO exam_app;

-- Results: never deleted. Audit log: append-only.
REVOKE DELETE ON results FROM exam_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM exam_app;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM exam_app;

-- Schema changes are reserved for the migration role.
REVOKE CREATE ON SCHEMA public FROM exam_app;
