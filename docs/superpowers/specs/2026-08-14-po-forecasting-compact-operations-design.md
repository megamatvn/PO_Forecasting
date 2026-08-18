# Đặc tả thiết kế — Compact Operations

**Ngày:** 14/08/2026
**Trạng thái:** Đã duyệt ngày 14/08/2026; bổ sung nhận diện Sagen ngày 14/08/2026
**Phạm vi:** Typography, mật độ giao diện, app shell, dashboard, planning, PO & ETA, import, phiên bản và các màn hình quản trị
**Kế thừa:** `2026-08-12-po-forecasting-ux-redesign-design.md`

Khi hai tài liệu khác nhau về cỡ chữ, spacing, mật độ, card hoặc layout trực quan, tài liệu ngày 14/08/2026 này được ưu tiên. Các quyết định nghiệp vụ, dữ liệu, phân quyền, approval và import của tài liệu ngày 12/08/2026 vẫn giữ nguyên.

## 1. Mục tiêu

Đợt thiết kế này chuyển giao diện từ phong cách trình bày editorial sang một trung tâm vận hành gọn, dễ quét và phù hợp với công việc lặp lại hằng ngày.

Sản phẩm giữ tinh thần Sagen Group: thanh lịch, tối giản và đáng tin cậy. Nhận diện phải dựa trên logo thật của Sagen, không sử dụng nền đen–vàng hoặc ký hiệu chữ `S` thuộc hướng thiết kế trước đó.

### 1.1 Nguồn nhận diện chính thức

- Biểu tượng: `public/brand/sagen-symbol.png`, sao chép nguyên bản từ `Logo_sagen_01.png` của Sagen.
- Wordmark: `public/brand/sagen-wordmark.png`, sao chép nguyên bản từ `Logo_sagen_02.png` của Sagen.
- Màu chính: emerald `#0f9f6e`.
- Màu nhấn phụ: lime `#8dc63f`; chỉ dùng tiết chế cho điểm nhận diện, không thay màu cảnh báo.
- Nền ứng dụng: trắng và xanh-xám rất nhạt; chữ chính dùng xanh charcoal.
- Không dùng champagne gold, rose gold hoặc nền đen–vàng làm màu thương hiệu của ứng dụng này.
- Màu đỏ, hổ phách, xanh dương và xanh lá trạng thái tiếp tục mang đúng ý nghĩa nghiệp vụ; không dùng màu lime để biểu thị cảnh báo.

Người dùng cần nhìn thấy ngữ cảnh, tình trạng, rủi ro và hành động chính trong vòng ba giây.

## 2. Nguyên tắc bắt buộc

1. Chữ lớn chỉ dùng cho tiêu đề trang cấp cao và một số KPI trọng yếu.
2. Header, dialog, form và panel thao tác ưu tiên mật độ thông tin; không dùng cỡ chữ kiểu landing page.
3. Serif chỉ dùng tiết chế cho H1 cấp trang và số liệu nhấn mạnh. Heading trong form, bảng, dialog, card và sidebar dùng Be Vietnam Pro.
4. Không có màn hình desktop mà phần header chiếm quá 22% chiều cao viewport 900px.
5. Khoảng trắng phải phân nhóm thông tin, không tạo vùng trống lớn không có chức năng.
6. Mỗi vùng nhìn chỉ có một cấp nhấn thị giác chính.
7. Không hiển thị thuật ngữ triển khai, bảo mật hoặc kỹ thuật cho người dùng nghiệp vụ.
8. Không dùng màu là tín hiệu trạng thái duy nhất.

## 3. Typography

### 3.1 Thang chữ desktop

| Thành phần | Font | Cỡ chữ | Line-height | Giới hạn |
|---|---|---:|---:|---|
| H1 trang | Noto Serif Display | 32–40px | 1.08–1.15 | Tối đa 2 dòng |
| H1 workspace dài | Noto Serif Display | 30–36px | 1.12 | Ưu tiên tên nghiệp vụ ngắn |
| KPI chính | Noto Serif Display | 26–34px | 1.1 | Một dòng nếu có thể |
| H2 section | Be Vietnam Pro | 20–24px | 1.25 | Không dùng serif |
| H3/card title | Be Vietnam Pro | 16–18px | 1.3 | Không dùng serif |
| Body | Be Vietnam Pro | 14–16px | 1.45–1.6 | Mặc định 15px |
| Label/form | Be Vietnam Pro | 13–14px | 1.35 | Weight 600–700 |
| Table | Be Vietnam Pro | 13–14px | 1.35 | Dùng tabular numbers cho số |
| Eyebrow/meta | Be Vietnam Pro | 11–12px | 1.3 | Letter spacing vừa phải |

Không dùng `clamp()` có giá trị tối đa vượt 40px cho H1 trong app shell. Dialog title tối đa 24px. Section title trong form tối đa 22px.

### 3.2 Mobile

- H1: 26–32px.
- H2: 19–22px.
- Body và control: tối thiểu 14px.
- Không giảm chữ để nhét dữ liệu; ưu tiên đổi layout hoặc rút gọn có tooltip.

## 4. Mật độ và spacing

Hệ spacing chuẩn: `4, 8, 12, 16, 24, 32px`.

- Padding ngang page desktop: 24–32px; màn hình rất rộng tối đa 40px.
- Khoảng cách từ header đến nội dung chính: 16–24px.
- Card/panel padding: 16–20px.
- Table row: cao mục tiêu 44–52px.
- Input desktop: cao 40–44px.
- Button desktop: cao 40–44px; mobile tối thiểu 44px.
- KPI strip: cao 88–104px.
- Không dùng min-height lớn hơn 120px cho card chỉ chứa một nhãn và một giá trị.

## 5. Component nền tảng

### 5.1 PageHeader duy nhất

Tất cả route trong app shell sử dụng cùng một `PageHeader`:

- Breadcrumb hoặc eyebrow ngắn.
- H1 giới hạn theo thang chữ.
- Mô tả tối đa một dòng desktop, hai dòng mobile.
- Tối đa hai hành động bên phải.
- Badge trạng thái đặt gần ngữ cảnh liên quan, không đứng riêng như một vật trang trí.

Loại bỏ `page-heading` legacy sau khi mọi route đã chuyển đổi.

### 5.2 Context bar

Nhãn hàng, năm, phiên bản và trạng thái hiển thị thành một dòng compact. Không tạo bốn card đồng hạng nếu dữ liệu chỉ là metadata.

### 5.3 Panel và card

- Dùng border để phân tách khi thật sự cần.
- Ưu tiên divider hoặc background nhẹ cho các phần cùng một workflow.
- Card nghiệp vụ dùng radius 10–12px; input và button dùng 8–10px. Không dùng cạnh vuông hoặc bo tròn 16–20px hàng loạt.
- Các KPI cùng nhóm phải có khoảng cách nhìn thấy rõ, không ghép thành một dải có đường kẻ dọc như bảng tính.
- Không bọc card bên trong card nếu không có khác biệt về hành vi.

## 6. App shell và sidebar

- Sidebar desktop rộng khoảng 252–264px.
- Giảm chiều cao lockup và khoảng cách nhóm menu.
- Bỏ số thứ tự `01–08`; dùng icon/chấm nhỏ nếu cần định hướng.
- Active state tiếp tục dùng nền sáng, vạch vàng và `aria-current`.
- Bộ chọn nhãn hàng dùng `minmax(0, 1fr) auto`; nút `Áp dụng` không được xuống dòng và rộng tối thiểu 76px.
- Phương án ưu tiên là tự áp dụng khi đổi nhãn hàng, có trạng thái loading và thông báo thành công.
- Tên nhãn hàng dài được ellipsis; hover/focus hiển thị đầy đủ.

## 7. Dashboard

Vùng nhìn đầu tiên gồm header gọn, context bar một dòng và bốn KPI. Tổng chiều cao mục tiêu của ba phần này không vượt khoảng 280px trên desktop 1440×900.

- KPI: Ngân sách mục tiêu, Đã lên PO, Ngân sách còn lại, SKU cần xử lý.
- Ngân sách có tỷ lệ đã sử dụng hoặc progress nhỏ để tạo ngữ cảnh.
- Alert ưu tiên chỉ nêu số thiếu một lần.
- CTA không lặp lại số lượng nếu headline đã nêu.
- PO timeline dùng danh sách hoặc bảng compact; một PO không tạo card cao và rộng không cần thiết.

## 8. Planning workspace

### 8.1 Header và tổng quan

- Tiêu đề dùng `Kế hoạch mua hàng ETX · 2026` hoặc tên kế hoạch canonical; không dùng `ETX Forecast 2026`.
- `Khoảng trống` đổi thành `Ngân sách còn lại`.
- Giảm KPI từ năm ô đồng hạng nếu một chỉ số không hỗ trợ quyết định hiện tại.
- Alert Critical chỉ giữ SKU, mức thiếu, một câu giải thích và một CTA.

### 8.2 Master–detail desktop

Tỷ lệ mặc định: danh sách 58%, editor 42%. Tỷ lệ có thể điều chỉnh nhẹ theo viewport nhưng danh sách không được hẹp hơn editor khi vẫn hiển thị bảng nhiều cột.

Danh sách SKU:

- SKU: rộng 105–120px, `white-space: nowrap`.
- Tên sản phẩm: `minmax(180px, 1fr)`, một dòng, ellipsis.
- Tên đầy đủ xuất hiện bằng tooltip khi hover và khi focus bàn phím.
- Cột số: rộng 86–110px, canh phải, dùng tabular numbers.
- Trạng thái: rộng khoảng 96–112px.
- Header bảng sticky; row cao 48–52px.
- Nếu viewport không đủ, ưu tiên ẩn cột hỗ trợ theo breakpoint; không ép SKU hoặc tên thành nhiều dòng khó quét.

Editor:

- Nút `Quay lại danh sách` chỉ hiển thị ở chế độ danh sách–chi tiết trên mobile.
- Qty, FOC và Ex Price dùng grid hai cột khi đủ rộng.
- Amount là read-only, nổi bật vừa phải và hiển thị đúng định dạng tiền tệ.
- Số lượng khi đọc dùng định dạng `vi-VN`; khi nhập vẫn phải rõ và không gây nhầm dấu phân cách.
- CTA `Điền đề xuất` và `Lưu đề xuất` nằm gần trường nhập, không tạo thanh hành động quá lớn.

### 8.3 Tablet và mobile

- Dưới ngưỡng không đủ cho hai pane, chuyển sang một pane.
- Danh sách → chi tiết toàn màn hình; nút quay lại giữ filter, sort và scroll.
- Không cuộn ngang toàn trang.

## 9. Đợt PO & ETA

- Không lặp `Đợt PO & ETA` ở H1 và card title liền nhau.
- Có filter compact cho trạng thái và khoảng thời gian khi dữ liệu đủ nhiều.
- Mỗi PO là một row hoặc card thấp, thể hiện tên, trạng thái, ngày đặt, ETA, giá trị và số dòng hàng.
- Empty/sparse state không kéo card phủ toàn bộ chiều cao màn hình.

## 10. Import dữ liệu

- Header dùng cỡ chữ chuẩn và brand context dạng compact.
- Luồng hiển thị ba trạng thái: Chọn file → Kiểm tra → Xác nhận import.
- Dropzone cao vừa đủ, mục tiêu 180–240px desktop.
- Nêu định dạng file, giới hạn và điều gì xảy ra sau khi chọn.
- Tiến trình, lỗi và sheet được chọn nằm trong cùng workflow, không tạo các banner tách rời.

## 11. Lịch sử phiên bản

- Bộ lọc là toolbar compact và không nổi bật hơn dữ liệu.
- Dùng bảng hoặc list có header cột rõ ràng.
- Cột chính: Phiên bản, Nhãn hàng/Kế hoạch, Năm, Trạng thái, Ngày cập nhật và hành động.
- Row có hover/focus rõ và dấu hiệu có thể mở chi tiết.
- Khi chỉ có một phiên bản, layout vẫn giữ mật độ bình thường.

## 12. Chính sách duyệt

- Các bước dùng accordion có hướng dẫn.
- Chỉ section hiện tại mở đầy đủ; section hoàn thành thu gọn thành summary một dòng và nút `Chỉnh sửa`.
- Summary bên phải không dùng chữ lớn và không nhấn các giá trị `Chưa chọn` như dữ liệu hoàn chỉnh.
- CTA lưu nằm trong summary desktop hoặc sticky action bar nhỏ trên mobile.
- Dialog/confirmation title tối đa 24px.
- Việt hóa vai trò theo ngôn ngữ nghiệp vụ; không hiển thị `Manager → CFO/CEO` nếu hệ thống đã có tên vai trò tiếng Việt phù hợp.

## 13. Người dùng và quyền

- Bỏ `Administration · Access control` và `Atomic · RLS protected` khỏi giao diện người dùng.
- Danh sách người dùng rộng khoảng 30–34%; editor 66–70%.
- Role và brand dùng row/checkbox compact thay vì các card lớn đồng hạng.
- Trạng thái hoạt động đặt ngay trong header người dùng.
- Nút lưu sticky nhưng không che nội dung.
- Vai trò được Việt hóa; mã vai trò kỹ thuật chỉ dùng nội bộ hoặc tooltip quản trị khi thật sự cần.

## 14. Copy và thuật ngữ

- Tên chức năng: `Kế hoạch mua hàng`.
- `Forecast` chỉ xuất hiện trong metadata kỹ thuật hoặc tên nguồn khi audit yêu cầu.
- `Khoảng trống` → `Ngân sách còn lại`.
- `Draft` → `Bản nháp`.
- `Version control` → `Quản lý phiên bản`.
- `Access control` → `Phân quyền truy cập`.
- `Critical`, `Warning`, `Healthy` có thể giữ làm mã trạng thái nếu kèm nhãn hoặc giải thích tiếng Việt nhất quán.

## 15. Accessibility

- Tương phản tối thiểu WCAG 2.1 AA.
- Tooltip cho nội dung bị ellipsis phải mở bằng hover và focus, không chỉ dùng thuộc tính `title` làm cơ chế duy nhất nếu nội dung quan trọng.
- Focus visible rõ trên navigation, row, button, input và tooltip trigger.
- Touch target mobile tối thiểu 44×44px.
- Dialog có initial focus, focus trap, Escape và focus return.
- Không truyền đạt trạng thái chỉ bằng màu hoặc border.

## 16. Tiêu chí nghiệm thu trực quan

1. Không có H1 trong app shell vượt 40px desktop hoặc 32px mobile.
2. Không có title trong dialog/form section vượt 24px.
3. Mọi route chính dùng cùng PageHeader; không còn `page-heading` legacy.
4. Header + context + KPI của Dashboard nằm trong khoảng 280px đầu tiên ở viewport 1440×900.
5. Sidebar không có chữ hoặc button label xuống dòng ngoài ý muốn.
6. SKU trong Planning không xuống dòng ở desktop.
7. Tên sản phẩm dài ellipsis một dòng và có cách xem đầy đủ bằng chuột lẫn bàn phím.
8. Nút quay lại danh sách không xuất hiện trong split view desktop.
9. Planning không hiển thị `Forecast` hoặc `Khoảng trống` như tên nghiệp vụ.
10. Các trang Import, Phiên bản và Quản trị không còn vùng trống lớn do header hoặc card quá khổ.
11. Không còn copy `Atomic`, `RLS protected`, `Access control`, `Version control`, `Draft` hoặc vai trò tiếng Anh trên UI nghiệp vụ.
12. Viewport desktop 1440×900, tablet 1024×768 và mobile 390×844 không có cuộn ngang toàn trang.

## 17. Ngoài phạm vi

- Không thay đổi schema, RLS, approval engine hoặc logic tính Amount.
- Không đổi luồng import và versioning đã được duyệt.
- Không thay đổi quyền hạn của các vai trò.
- Không thiết kế lại nhận diện thương hiệu Sagen Groupe.
- Không thêm biểu đồ hoặc animation nếu không hỗ trợ quyết định vận hành.

## 18. Thứ tự triển khai đề xuất

1. Chuẩn hóa typography, spacing, PageHeader và sidebar.
2. Sửa Planning master–detail, bảng SKU, editor và alert.
3. Compact Dashboard và PO & ETA.
4. Chuyển Import, Phiên bản và Quản trị khỏi layout legacy.
5. Rà soát copy, responsive, accessibility và visual regression toàn hệ thống.
