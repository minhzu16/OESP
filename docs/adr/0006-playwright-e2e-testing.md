# 0006. Kiểm thử E2E toàn diện với Playwright trên môi trường thật

* Trạng thái: Đã chấp thuận
* Ngày: 2026-11-23

## Bối cảnh
Quy trình làm bài thi trực tuyến của sinh viên chứa nhiều tình huống phức tạp mà unit test hay API integration test riêng lẻ không thể bao quát: đồng hồ đếm ngược trên giao diện phải đồng bộ với server, câu trả lời phải tự động lưu định kỳ (autosave), bài thi phải duy trì trạng thái khi người dùng tải lại trang (reload/resume), và đặc biệt phải lưu tạm vào bộ nhớ cục bộ khi rớt mạng rồi tự động gửi bù khi có mạng lại.

## Quyết định
Sử dụng **Playwright** (`@playwright/test`) để xây dựng kịch bản kiểm thử luồng người dùng toàn diện (End-to-End) trên toàn bộ stack chạy thật (NestJS API, Worker, Redis, PostgreSQL và React SPA):
1. Thiết lập kịch bản "Golden path" cho sinh viên: đăng nhập, nhận đề thi ngẫu nhiên, làm câu hỏi đầu tiên có autosave.
2. Mô phỏng tải lại trang giữa chừng và kiểm tra việc phục hồi lựa chọn cùng đồng hồ đếm ngược.
3. Kích hoạt chế độ ngoại tuyến (`context.setOffline(true)`), làm câu tiếp theo để xác minh hàng đợi lưu tạm và giao diện cảnh báo mất kết nối, sau đó bật lại mạng để kiểm tra việc đồng bộ tự động.
4. Nộp bài, kiểm tra việc giáo viên công bố điểm và sinh viên xem lại chi tiết bài làm.

## Hệ quả
### Tích cực
* Xác thực toàn bộ chu trình hoạt động của hệ thống từ giao diện người dùng đến database dưới điều kiện mạng thực tế.
* Đảm bảo tính năng cốt lõi chịu lỗi mạng (offline resilience) hoạt động đúng như cam kết thiết kế.
* Tự động hóa phát hiện hồi quy trước khi đóng gói và phát hành ứng dụng.

### Tiêu cực
* Chi phí khởi động và thời gian chạy lâu hơn đáng kể so với unit test.
* Yêu cầu toàn bộ hệ thống (gồm cả frontend dev server) phải sẵn sàng trước khi chạy test.

## Bằng chứng trong code
* [playwright.config.ts](../../playwright.config.ts) - Cấu hình Playwright trỏ đến thư mục `./e2e` và cấu hình trình duyệt Chromium.
* [student-flow.spec.ts](../../e2e/student-flow.spec.ts) - Toàn bộ kịch bản E2E kiểm tra reload, offline autosave và công bố điểm.
* [ci.yml](../../.github/workflows/ci.yml#L49-L98) - Tự động chạy toàn bộ stack và thực thi `pnpm test:e2e` trên GitHub Actions.
