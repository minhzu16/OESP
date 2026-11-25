# 0005. Kiểm thử tích hợp API với PostgreSQL thật qua Testcontainers

* Trạng thái: Đã chấp thuận
* Ngày: 2026-11-23

## Bối cảnh
Hệ thống thi cử dựa vào các tính năng nâng cao và đặc thù của PostgreSQL: partial unique index (`uq_one_active_attempt`), trigger plpgsql kiểm soát quyền sửa bảng kết quả và nhật ký, khóa hàng `FOR UPDATE SKIP LOCKED`, cùng hàm `now()` đồng bộ thời gian. Các cơ chế giả lập (mocking) hoặc database thay thế (như SQLite, In-Memory DB) không thể tái hiện chính xác các ràng buộc và hiện tượng tương tranh này.

## Quyết định
Sử dụng **Testcontainers** (`@testcontainers/postgresql`) để chạy kiểm thử tích hợp trên phiên bản **PostgreSQL 16 thật**:
1. Trong file Jest `globalSetup`, nếu không có biến `TEST_DATABASE_URL` (như khi chạy trên CI với service container), hệ thống sẽ tự động khởi động một container Docker `postgres:16-alpine`.
2. Tự động áp dụng toàn bộ migration qua `prisma migrate deploy` vào cơ sở dữ liệu kiểm thử trước khi chạy các suite.
3. Các test suite chia sẻ container và làm sạch dữ liệu bằng lệnh `TRUNCATE ... RESTART IDENTITY CASCADE` trong hàm `beforeEach` để đảm bảo tính độc lập giữa các ca kiểm thử.

## Hệ quả
### Tích cực
* Đảm bảo tính trung thực tuyệt đối của kết quả kiểm thử: phát hiện ngay các lỗi xung đột transaction, vi phạm trigger hoặc sai lệch cú pháp SQL trước khi deploy.
* Lập trình viên không cần cài đặt hoặc cấu hình Postgres cục bộ phức tạp, chỉ cần có Docker.
* Kiểm thử được các ca tương tranh thực tế (ví dụ: 10 request bắt đầu thi hoặc nộp bài cùng lúc).

### Tiêu cực
* Quá trình chạy test tốn nhiều thời gian hơn do chi phí tải image và khởi động Docker container.
* Máy của lập trình viên bắt buộc phải có Docker daemon đang chạy.

## Bằng chứng trong code
* [global-setup.ts](../../apps/api/test/global-setup.ts) - Tự động bật container Postgres bằng `Testcontainers` và chạy migrate.
* [helpers.ts](../../apps/api/test/helpers.ts#L34-L40) - Hàm `resetDb` thực hiện `TRUNCATE` dọn sạch dữ liệu giữa các test.
* [jest.config.js](../../apps/api/jest.config.js#L16-L23) - Cấu hình project `integration` chạy tuần tự với `globalSetup`.
* [attempts.int-spec.ts](../../apps/api/test/attempts.int-spec.ts#L58-L60) - Kiểm thử 10 request bắt đầu thi đồng thời trên database thật.
