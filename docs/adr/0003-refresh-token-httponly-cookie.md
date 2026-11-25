# 0003. Lưu trữ Refresh Token trong httpOnly Cookie và cơ chế Rotation

* Trạng thái: Đã chấp thuận
* Ngày: 2026-11-23

## Bối cảnh
Ứng dụng web cần duy trì phiên đăng nhập của người dùng một cách tiện lợi nhưng phải ngăn ngừa tối đa nguy cơ bị chiếm đoạt tài khoản. Nếu lưu trữ cả Access Token và Refresh Token trong `localStorage`, mã độc XSS có thể dễ dàng đánh cắp cả hai. Ngược lại, nếu chỉ dùng session ngắn hạn, người dùng sẽ liên tục bị đăng xuất.

## Quyết định
Áp dụng mô hình kết hợp token kép (Dual Token) với cơ chế phòng vệ chuyên sâu:
1. **Access Token**: Cấp thời gian sống ngắn (mặc định 15 phút), lưu trữ trong bộ nhớ RAM của ứng dụng web.
2. **Refresh Token**: Cấp thời gian sống dài (7 ngày), lưu trữ trong cookie với cờ `httpOnly: true`, `sameSite: 'strict'`, `secure: true` (trên production) và giới hạn phạm vi tại đường dẫn `/api/v1/auth`.
3. **Token Rotation & Reuse Detection**: Mỗi lần làm mới cấp một Refresh Token mới và đánh dấu token cũ là revoked. Nếu một token đã bị thu hồi được gửi lên, hệ thống sẽ thu hồi toàn bộ nhóm token (`familyId`) của phiên đó để ngăn chặn hành vi giả mạo.

## Hệ quả
### Tích cực
* Chống tấn công XSS đánh cắp Refresh Token vì JavaScript trên trình duyệt không thể đọc cookie `httpOnly`.
* Tự động phát hiện và ngăn chặn kẻ gian tái sử dụng token bị rò rỉ nhờ cơ chế token family.
* Access token ngắn hạn giúp giảm thiểu thiệt hại nếu chẳng may bị lộ trong bộ nhớ.

### Tiêu cực
* Phải cấu hình CORS chính xác (`credentials: true`, domain cụ thể) giữa frontend và backend.
* Tăng thêm một lượng ghi vào database trên bảng `refresh_tokens` mỗi khi người dùng làm mới phiên.

## Bằng chứng trong code
* [auth.controller.ts](../../apps/api/src/modules/auth/auth.controller.ts#L63-L72) - Thiết lập cookie `httpOnly` cho refresh token với scope đường dẫn `/api/v1/auth`.
* [auth.service.ts](../../apps/api/src/modules/auth/auth.service.ts#L95-L127) - Triển khai cơ chế xoay vòng token và phát hiện tái sử dụng theo `familyId`.
* [schema.prisma](../../apps/api/prisma/schema.prisma#L82-L95) - Mô hình dữ liệu bảng `refresh_tokens`.
