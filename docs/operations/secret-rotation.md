# Xoay vòng bí mật Supabase

## Khi nào phải xoay vòng

Thực hiện ngay nếu database password, connection URI, service-role key hoặc token quản trị xuất hiện trong chat, email, log, ảnh chụp, shell history, file chia sẻ hoặc Git. Publishable key có thể công khai trong browser nhưng vẫn nên thay khi nghi ngờ cấu hình project bị lộ rộng.

## Trình tự

1. Tạm dừng migration và tác vụ nền dùng credential cũ.
2. Trong Supabase Dashboard, đổi database password và xoay service-role/JWT secret theo hướng dẫn hiện hành của project.
3. Cập nhật secret manager/CI và `.env.local` của người được phép. Không gửi giá trị mới qua chat.
4. Thu hồi session/token cũ nếu phạm vi sự cố có thể ảnh hưởng Auth.
5. Kiểm tra kết nối bằng dry-run migration, đăng nhập, một truy vấn RLS và một export.
6. Chạy `pnpm check:secrets`; nếu bí mật từng vào Git, vô hiệu hóa bí mật trước rồi làm sạch lịch sử theo quy trình quản trị repository.
7. Ghi audit: thời điểm, loại credential, người thực hiện, nơi đã cập nhật và bằng chứng kiểm tra—không ghi giá trị bí mật.

## Phân loại biến

- Browser: chỉ `NEXT_PUBLIC_SUPABASE_URL` và publishable key.
- Server/CI: service-role key chỉ khi một tác vụ thực sự cần; không dùng cho luồng người dùng thông thường.
- Migration: ưu tiên transaction pooler URL được inject tạm thời.
- Repository: chỉ giữ placeholder trong `.env.example`.

Sau sự cố, giả định credential đã bị sao chép và xoay vòng thay vì chỉ xóa tin nhắn/file chứa nó.
