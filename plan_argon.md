> ⚠️ **Tài liệu do AI tạo, chưa được đo hay kiểm chứng.** Các số liệu, điểm số và benchmark dưới đây không có test
> hay phép đo nào chứng minh. Đánh giá hiện hành: `../scorecard_and_upgrade_plan.md` (thư mục gốc self_project).

# KẾ HOẠCH TRIỂN KHAI TỔNG THỂ (MASTER IMPLEMENTATION PLAN) - PJ4
## Nâng Cấp Hệ Thống Thi Trực Tuyến & Chấm Điểm Tự Động (Online Examination and Result System) Theo Chuẩn Mực 12 Agent / Skill

**Kiến trúc sư trưởng:** Gemini 4 Argon (Chế độ Tư duy Cao)  
**Kỹ sư thực thi:** Antigravity  
**Tech Stack:** NestJS 11 · PostgreSQL 16 · Prisma 6 · Redis 7 + BullMQ · React 19 + Vite 7 + TanStack Query 5 · Docker Compose · Caddy

---

### 1. Đánh Giá Hiện Trạng & Thách Thức Nghiệp Vụ Cốt Lõi

Hệ thống **PJ4 (Online Examination and Result System)** là một nền tảng thi trực tuyến đa người dùng quy mô lớn, quản lý ngân hàng câu hỏi, tổ chức kỳ thi giới hạn thời gian nghiêm ngặt, tráo đề và tùy biến đề ngẫu nhiên theo từng thí sinh, tự động lưu bài (autosave) kèm cơ chế phục hồi offline, chấm điểm tức thì và công bố kết quả minh bạch.

Hệ thống đối mặt với **3 bài toán kỹ thuật hóc búa (The Three Hard Problems)**:
1. **Chống nộp bài trùng lặp & Race Conditions (Duplicate Submissions & Starts):**
   - Hàng nghìn thí sinh cùng bấm bắt đầu làm bài hoặc nộp bài cùng một giây khi hết giờ thi.
   - Rủi ro mở nhiều phiên làm bài đồng thời (multiple active attempts), nộp bài 2 lần (double submit), hoặc xung đột tranh chấp giữa luồng thí sinh bấm nộp và luồng background sweeper tự động thu bài khi hết hạn.
2. **Thời gian máy chủ là Chân lý Duy nhất (Server-Authoritative Timing):**
   - Tuyệt đối không tin tưởng đồng hồ trên trình duyệt client (người dùng có thể sửa giờ hệ điều hành, can thiệp JavaScript hoặc mạng chập chờn).
   - Thời điểm bắt đầu `started_at` lấy trực tiếp từ đồng hồ CSDL (`dbNow`); thời hạn chót `deadline_at = LEAST(started_at + duration, exam.end_at)` được chốt cứng ngay khi khởi tạo bài thi.
   - Luồng lưu bài định kỳ (autosave) phải xác thực điều kiện `now() <= deadline_at + grace` ngay tại câu lệnh SQL với khóa hàng `FOR SHARE`.
3. **Bảo vệ Kết quả & Chống Gian lận Tuyệt đối (Anti-Tampering & Anti-Cheating):**
   - Điểm số chỉ được tính toán tại backend dựa trên ID lựa chọn nội bộ (không dựa trên vị trí hiển thị A/B/C/D đã bị tráo). Payload gửi xuống cho sinh viên tuyệt đối không bao gồm `is_correct` hoặc giải thích.
   - Toàn bộ kết quả mang chữ ký mã hóa `HMAC_SHA256(secret, attemptId|score|maxScore|sha256(answers))`.
   - CSDL PostgreSQL thiết lập Trigger khóa cứng tầng dữ liệu: Bảng `results` cấm hoàn toàn hành vi DELETE, mọi thao tác UPDATE bắt buộc phải có biến phiên giao dịch `app.audit_reason` (quy trình chấm phúc khảo); bảng `audit_logs` chỉ cho phép INSERT (append-only); bảng `attempt_answers` bị đóng băng vĩnh viễn khi bài thi rời trạng thái `IN_PROGRESS`.

---

### 2. Ma Trận Ứng Dụng 12 Agent / Skill Chuẩn Mực Vào PJ4

| STT | Tên Agent / Skill | Trọng tâm Áp dụng trong PJ4 | Mục tiêu Kỹ thuật Cụ thể |
|:---:|---|---|---|
| **01** | **Domain Modeling** | DDD Bounded Contexts: Question Bank, Exam Scheduling, Attempt Engine, Scoring & Results | Chuẩn hóa OpenAPI contract, schema bất biến (immutable QuestionVersion), quan hệ khóa ngoại bảo đảm toàn vẹn tham chiếu. |
| **02** | **Security & Hardening** | Phòng thủ IDOR, Server-Authoritative Time, HMAC Result Signature | Kiểm tra quyền sở hữu tại từng câu truy vấn (404 thay vì 403 để chống ID enumeration), `forbidNonWhitelisted: true`, argon2 password hashing, rotate refresh token family. |
| **03** | **Concurrency Control** | Advisory Transaction Locks, Optimistic Locking, Monotonic Sequence Upsert | Dùng `pg_advisory_xact_lock(hashtext(examId), hashtext(userId))` khi bắt đầu; `ON CONFLICT DO UPDATE WHERE attempt_answers.seq < EXCLUDED.seq` khi autosave; `UPDATE ... WHERE status='IN_PROGRESS' RETURNING id` khi submit. |
| **04** | **Performance & Latency** | PostgreSQL Indexing, Partial Unique Indexes, Redis Caching | Chỉ mục một phần `uq_one_active_attempt` trên attempts đang thi; chỉ mục GIN `questions_tags_gin` phục vụ bốc đề ngẫu nhiên; Redis lưu session và queue sweeper BullMQ. |
| **05** | **Node Optimization** | NestJS 11 Engine, Fastify/Express Tuning, Pino Structured Logging | Tích hợp `nestjs-pino` logging zero-overhead; tối ưu hóa kích thước worker image; xử lý background sweeper batching qua BullMQ job schedulers. |
| **06** | **UI/UX Pro Max** | React 19, Client Clock Anchor, Autosave Queue, Accessibility WCAG AA | Đồng bộ đồng hồ server qua `performance.now()` chống gian lận chỉnh giờ local; queue offline lưu LocalStorage tự retry exponential backoff khi mất mạng; bàn phím điều hướng câu hỏi. |
| **07** | **Karpathy Guidelines** | First-Principles Code Design, Đơn giản hóa trạng thái | Mã nguồn tinh gọn, triệt tiêu logic rườm rà; chỉ duy trì trạng thái máy hữu hạn: `IN_PROGRESS` ➔ `SUBMITTED`/`EXPIRED` ➔ `GRADED`. |
| **08** | **Verification & Observability** | OpenTelemetry Tracing, Prometheus `/api/metrics`, Health Probes | Đo lường chính xác p95/p99 latency của API autosave và submit; cảnh báo tức thì khi xuất hiện sai lệch checksum kết quả (`HMAC verification failure`). |
| **09** | **Resilience & Circuit Breaker** | BullMQ Fallback, Sweeper Auto-Recovery, Grace Period Handling | Tự động quét và thu bài các bài thi quá hạn (`expireIfOverdue`) ngay khi có bất kỳ thao tác đọc/ghi nào hoặc qua cron sweeper chạy mỗi phút. |
| **10** | **Documentation & OpenAPI** | Swagger UI (`/api/docs`), Data Flow Diagrams, Security Matrix | Tự động đồng bộ hóa DTO giữa `@exam/shared`, NestJS Controllers và React Query Hooks; ghi nhận chi tiết cơ chế bảo vệ CSDL. |
| **11** | **CI/CD & Deployment** | Multi-stage Dockerfile, Caddy Reverse Proxy, Non-root containers | Chạy kiểm thử tự động trên PostgreSQL thật bằng Testcontainers trong CI; zero-downtime rolling update với script health check tự động rollback. |
| **12** | **Code Quality & Clean Arch** | Strict TypeScript (no `any`), ESLint 9, Monorepo Architecture | Cấu trúc Monorepo phân tách rõ rệt: `apps/api`, `apps/web`, `packages/shared`, `e2e/`, `load/`; tỷ lệ che phủ kiểm thử đạt 100% cho luồng tranh chấp đồng thời. |

---

### 3. Kế Hoạch Triển Khai Chi Tiết Từng Bước (Phased Master Plan)

#### Giai đoạn 1: Chuẩn Hóa Schema & Bảo Vệ CSDL Tầng Sâu (Database Guardrails)
- **Cơ chế Khóa Lạc quan & Phân đoạn Đề thi:**
  - Đóng băng phiên bản câu hỏi `question_versions` (immutable). Khi giáo viên chỉnh sửa câu hỏi sau khi kỳ thi đã xuất bản, hệ thống tự động tạo phiên bản mới, không ảnh hưởng đến các đề thi đã phát cho thí sinh.
  - Thiết lập Trigger PostgreSQL:
    1. `results_guard`: Chặn xóa kết quả (`DELETE`), chỉ cho phép cập nhật (`UPDATE`) khi có biến môi trường giao dịch `app.audit_reason` được thiết lập từ chức năng phúc khảo của giảng viên.
    2. `audit_logs_append_only`: Cấm tuyệt đối `UPDATE` hoặc `DELETE` trên bảng lịch sử kiểm toán.
    3. `attempt_answers_frozen`: Khóa cứng việc ghi hoặc sửa câu trả lời nếu trạng thái bài thi không phải `IN_PROGRESS`.
- **Ràng buộc Tính duy nhất (Partial Unique Index):**
  - Thực thi chỉ mục `CREATE UNIQUE INDEX "uq_one_active_attempt" ON "attempts" ("exam_id", "student_id") WHERE "status" = 'IN_PROGRESS';` ngăn chặn triệt để tình trạng 1 sinh viên có 2 bài thi đồng thời.

#### Giai đoạn 2: Cường Hóa Concurrency Control & Thuật Toán Chấm Điểm
- **Khởi tạo Bài thi Đồng thời (Start Concurrency):**
  - Tích hợp hàm băm khóa giao dịch: `SELECT 1 FROM pg_advisory_xact_lock(hashtext(examId), hashtext(userId))`.
  - Nếu xảy ra xung đột tranh chấp do nhiều request gửi đồng thời, câu lệnh rơi vào ngoại lệ vi phạm tính duy nhất (`P2002`), khối bắt lỗi tự động tìm và trả về bản ghi `IN_PROGRESS` của người thắng cuộc mà không làm lỗi ứng dụng.
- **Tự động Lưu Bài Đơn điệu (Monotonic Sequence Autosave):**
  - Sinh viên gửi câu trả lời kèm số thứ tự tăng dần `seq`.
  - Câu lệnh UPSERT xử lý tranh chấp mạng bằng điều kiện:
    ```sql
    ON CONFLICT (attempt_id, question_version_id) DO UPDATE
       SET selected_option_ids = EXCLUDED.selected_option_ids,
           seq = EXCLUDED.seq,
           saved_at = EXCLUDED.saved_at
     WHERE attempt_answers.seq < EXCLUDED.seq
    ```
  - Khóa hàng `FOR SHARE` trên `attempts` bảo đảm câu trả lời chỉ được lưu khi bài thi chưa bị đóng.
- **Nộp Bài Nguyên Tử (Atomic Submit) & Chấm Điểm Đơn Lượt:**
  - Dùng câu lệnh cập nhật có điều kiện `UPDATE attempts SET status='SUBMITTED' ... WHERE status='IN_PROGRESS' RETURNING id`. Chỉ 1 request duy nhất kích hoạt hàm `gradeAttempt()`.
  - Kết quả được tính toán và ký số `HMAC_SHA256` ngay trong cùng transaction CSDL.

#### Giai đoạn 3: Tối Ưu Hóa Trải Nghiệm Frontend (React 19 + TanStack Query)
- **Đồng Hồ Máy Chủ Độc Lập Thiết Bị (Server Clock Synchronization):**
  - Khi tải bài thi, client nhận thời gian máy chủ `serverTime`, tính độ trễ mạng (RTT) và neo đồng hồ đếm ngược vào `performance.now()`. Bất kỳ hành vi chỉnh sửa giờ trên máy tính cá nhân đều vô hiệu.
- **Hàng Đợi Lưu Tự Động Phục Hồi Ngoại Tuyến (Offline Autosave Queue):**
  - Mọi thao tác chọn đáp án được đẩy vào hàng đợi cục bộ trong `localStorage` với số `seq` đơn điệu.
  - Khi mất kết nối internet, timer vẫn tiếp tục chạy, giao diện hiển thị trạng thái offline cảnh báo trực quan. Ngay khi có mạng trở lại, worker nền tự động re-sync toàn bộ đáp án lên máy chủ với thuật toán retry exponential backoff.

#### Giai đoạn 4: Kiểm Thử Toàn Diện & Đánh Giá Độ Chịu Tải (Load & Stress Testing)
- **Kiểm thử Đơn vị & Tích hợp (TDD):**
  - Chạy toàn bộ 37 bài test unit (thuật toán tính điểm, tráo đề, phân tích độ phân cách câu hỏi) và 41 bài test tích hợp trên PostgreSQL Testcontainers.
  - Đảm bảo 100% kịch bản tranh chấp: 10 thí sinh cùng nộp bài cùng lúc ➔ chính xác 1 lần chấm điểm và 1 bản ghi kết quả duy nhất.
- **Kịch bản Kiểm thử Tải k6 (Load Testing):**
  - Mô phỏng 500 sinh viên đồng loạt bắt đầu làm bài, gửi autosave mỗi 10 giây và ồ ạt nộp bài trong 30 giây cuối cùng; chỉ số p95 latency của API autosave phải duy trì dưới 120ms.

---

### 4. Tiêu Chí Nghiệm Thu Định Lượng (Acceptance Criteria)

1. **Toàn vẹn Dữ liệu & Chống Bán Kép / Đặt Chỗ Ảo:** 100 request đồng thời yêu cầu bắt đầu hoặc nộp bài cho cùng 1 thí sinh trả về chính xác 1 bản ghi hợp lệ, 0 deadlock.
2. **Tuân thủ Thời gian Tuyệt đối:** 100% bài thi quá hạn (`now() > deadline_at + grace`) bị từ chối lưu bài mới và tự động chuyển sang trạng thái nộp bài với điểm số của các câu đã lưu hợp lệ trước đó.
3. **Bảo vệ Kết quả:** Mọi thay đổi điểm trực tiếp trên bảng `results` mà không thông qua biến session `app.audit_reason` đều bị PostgreSQL Trigger chặn đứng với lỗi `insufficient_privilege`.
4. **Chỉ số Chất lượng Mã nguồn:** `pnpm -r build` hoàn tất với mã thoát 0; `pnpm -r test` đạt 100% tỷ lệ pass không có bất kỳ cảnh báo deprecation nghiêm trọng nào.
