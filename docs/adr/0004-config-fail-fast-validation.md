# 0004. Xác thực cấu hình Fail-fast tập trung khi khởi động ứng dụng

* Trạng thái: Đã chấp thuận
* Ngày: 2026-11-23

## Bối cảnh
Các ứng dụng backend thường đối mặt với các lỗi vận hành nghiêm trọng khi thiếu biến môi trường hoặc khi các khóa bí mật (JWT Secret, HMAC Secret) có độ dài quá ngắn, không đạt tiêu chuẩn mật mã học. Việc để các lỗi này phát sinh ngẫu nhiên khi người dùng thực hiện một thao tác nào đó là cực kỳ nguy hiểm và khó khắc phục.

## Quyết định
Xây dựng mô-đun nạp và kiểm tra tính hợp lệ của cấu hình tập trung theo nguyên tắc **Fail-fast** trong `config.ts`:
1. Hàm `getConfig()` đọc biến môi trường một lần duy nhất lúc khởi động và lưu vào bộ đệm bộ nhớ.
2. Kiểm tra chặt chẽ: các biến số nguyên phải là số dương hợp lệ; các biến bí mật mật mã học (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `RESULT_HMAC_SECRET`) bắt buộc phải có độ dài từ 32 ký tự trở lên.
3. Nếu bất kỳ cấu hình bắt buộc nào bị thiếu hoặc không thỏa mãn điều kiện an toàn, chương trình lập tức ném ngoại lệ dừng tiến trình ngay từ khi bootstrap.

## Hệ quả
### Tích cực
* Ngăn chặn hoàn toàn việc hệ thống khởi động trong trạng thái cấu hình không an toàn hoặc thiếu sót.
* Toàn bộ mã nguồn sử dụng giao diện cấu hình có định kiểu tĩnh `AppConfig`, loại bỏ các lệnh đọc `process.env` rải rác và rủi ro typo.
* Hỗ trợ nạp file `.env` tự động trong môi trường phát triển cục bộ mà vẫn ưu tiên biến môi trường thực tế.

### Tiêu cực
* Môi trường phát triển cục bộ và CI bắt buộc phải định nghĩa đầy đủ các biến bí mật đạt chuẩn độ dài tối thiểu, không thể bỏ trống.

## Bằng chứng trong code
* [config.ts](../../apps/api/src/config/config.ts#L36-L82) - Các hàm kiểm tra `str`, `int`, `secret` và hàm khởi tạo `getConfig`.
* [main.ts](../../apps/api/src/main.ts#L2-L11) - Gọi `loadDotEnv()` và `getConfig()` ngay tại điểm khởi động API.
* [worker.ts](../../apps/api/src/worker.ts#L2-L3) - Đảm bảo worker cũng fail-fast nếu thiếu biến môi trường.
