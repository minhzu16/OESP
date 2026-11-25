# 0002. Sử dụng BullMQ Worker cho các tác vụ nền và quét bài thi

* Trạng thái: Đã chấp thuận
* Ngày: 2026-11-23

## Bối cảnh
Hệ thống cần thực thi các công việc định kỳ: tự động thu bài khi hết giờ (sweep expired attempts), chấm điểm các bài thi đang chờ (grade pending), kiểm tra tính toàn vẹn của kết quả thi (verify HMAC checksums) và dọn dẹp các bản ghi idempotency cũ. Khi ứng dụng chạy đa tiến trình hoặc triển khai nhiều replica, các tác vụ này cần chạy chính xác một lần trên mỗi chu kỳ để tránh lãng phí tài nguyên và tranh chấp.

## Quyết định
Sử dụng **BullMQ** kết hợp **Redis** (`MaintenanceRunner`) làm hàng đợi và lập lịch tác vụ nền:
1. Đăng ký các job định kỳ thông qua `upsertJobScheduler` của BullMQ với tùy chọn loại bỏ dữ liệu job hoàn thành.
2. Thiết kế cơ chế dự phòng: nếu biến môi trường `REDIS_URL` không được cung cấp, hệ thống tự động fallback sang `setInterval` trong tiến trình.
3. Kết hợp cú pháp SQL `FOR UPDATE SKIP LOCKED` và cập nhật trạng thái có điều kiện trong service để ngay cả khi có xung đột, dữ liệu vẫn luôn an toàn và không bị khóa chờ (blocking).

## Hệ quả
### Tích cực
* Đảm bảo phân phối công việc độc quyền: mỗi tick chỉ chạy trên một worker duy nhất trong cụm.
* Cho phép tách biệt tiến trình worker (`worker.ts`) độc lập với tiến trình nhận request API (`main.ts`).
* Cơ chế tự bảo vệ nhờ `SKIP LOCKED` giúp việc xử lý bài thi quá hạn diễn ra mượt mà dưới tải lớn.

### Tiêu cực
* Đòi hỏi thêm dịch vụ Redis trong hạ tầng vận hành chính thức.
* Cần quản lý cấu hình kết nối Redis và lifecycle tắt mở (shutdown hooks) của queue/worker.

## Bằng chứng trong code
* [maintenance.runner.ts](../../apps/api/src/worker/maintenance.runner.ts) - Lập lịch tác vụ với BullMQ và fallback in-process timer.
* [worker.ts](../../apps/api/src/worker.ts) - Điểm khởi động riêng biệt cho tiến trình background worker.
* [expiry.service.ts](../../apps/api/src/modules/core/expiry.service.ts#L43-L73) - Truy vấn quét bài thi hết hạn sử dụng `SKIP LOCKED`.
* [grading.service.ts](../../apps/api/src/modules/core/grading.service.ts#L25-L48) - Chấm điểm bài thi an toàn với điều kiện cập nhật trạng thái.
