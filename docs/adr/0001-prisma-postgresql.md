# 0001. Sử dụng PostgreSQL và Prisma ORM kết hợp DB Triggers

* Trạng thái: Đã chấp thuận
* Ngày: 2026-11-23

## Bối cảnh
Hệ thống thi trực tuyến đòi hỏi tính toàn vẹn dữ liệu nghiêm ngặt: chống nộp bài trùng lặp, ngăn chặn gian lận sửa điểm trực tiếp, khóa an toàn giữa các tiến trình đọc/ghi đồng thời và đồng bộ thời gian tuyệt đối dựa trên đồng hồ server. Cần một giải pháp lưu trữ quan hệ mạnh mẽ kèm tầng truy cập dữ liệu type-safe trong Node.js.

## Quyết định
Sử dụng **PostgreSQL 16** kết hợp với **Prisma 6 ORM**. Bổ sung các ràng buộc nâng cao mà Prisma schema chưa hỗ trợ bằng SQL thuần trong migration khởi tạo:
1. Sử dụng đồng hồ cơ sở dữ liệu (`now()`) làm nguồn chân lý duy nhất cho toàn bộ mốc thời gian thi cử (`dbNow`).
2. Khai báo các Database Triggers để kết quả thi (`results`) chỉ có thể thay đổi qua quy trình phúc khảo (`app.audit_reason`), nhật ký kiểm toán (`audit_logs`) là append-only, và đáp án (`attempt_answers`) bị đóng băng ngay khi lượt thi kết thúc.
3. Sử dụng partial unique index và câu lệnh cập nhật có điều kiện (`RETURNING id`) để bảo vệ chuyển trạng thái bài thi.

## Hệ quả
### Tích cực
* Đảm bảo tính nhất quán và bảo vệ dữ liệu ở tầng thấp nhất (DB engine), ngăn chặn hoàn toàn việc can thiệp trái phép ngoài ứng dụng.
* Prisma Client cung cấp trải nghiệm lập trình type-safe cao, tự động sinh kiểu dữ liệu tương thích TypeScript.
* Đồng bộ thời gian hoàn hảo giữa nhiều instance backend.

### Tiêu cực
* Không thể định nghĩa trigger hay partial index hoàn toàn trong file `schema.prisma`; phải bảo trì bổ sung đoạn script SQL thủ công trong file migration.
* Prisma transaction có overhead nhỏ khi cần chạy các raw query phức tạp như `SKIP LOCKED`.

## Bằng chứng trong code
* [schema.prisma](../../apps/api/prisma/schema.prisma) - Khai báo các mô hình dữ liệu chính, quan hệ và enum.
* [migration.sql](../../apps/api/prisma/migrations/0001_init/migration.sql#L466-L513) - Các hàm trigger `guard_results_change`, `guard_append_only`, `guard_answers_after_close`.
* [prisma.service.ts](../../apps/api/src/prisma/prisma.service.ts#L21-L29) - Hàm `dbNow` lấy thời gian chuẩn từ PostgreSQL.
