# Kiến trúc & Quyết định thiết kế (ADRs)

Tài liệu ghi nhận các quyết định kiến trúc (Architecture Decision Records) quan trọng trong hệ thống Online Examination and Result System (`pj4`).

| Mã | Tiêu đề | Trạng thái | Ngày ghi nhận |
|---|---|---|---|
| [ADR-0001](0001-prisma-postgresql.md) | Sử dụng PostgreSQL và Prisma ORM kết hợp DB Triggers | Đã chấp thuận | 2026-11-23 |
| [ADR-0002](0002-bullmq-worker-async-jobs.md) | Sử dụng BullMQ Worker cho các tác vụ nền và quét bài thi | Đã chấp thuận | 2026-11-23 |
| [ADR-0003](0003-refresh-token-httponly-cookie.md) | Lưu trữ Refresh Token trong httpOnly Cookie và cơ chế Rotation | Đã chấp thuận | 2026-11-23 |
| [ADR-0004](0004-config-fail-fast-validation.md) | Xác thực cấu hình Fail-fast tập trung khi khởi động ứng dụng | Đã chấp thuận | 2026-11-23 |
| [ADR-0005](0005-testcontainers-integration-tests.md) | Kiểm thử tích hợp API với PostgreSQL thật qua Testcontainers | Đã chấp thuận | 2026-11-23 |
| [ADR-0006](0006-playwright-e2e-testing.md) | Kiểm thử E2E toàn diện với Playwright trên môi trường thật | Đã chấp thuận | 2026-11-23 |
