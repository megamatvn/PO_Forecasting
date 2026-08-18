# Đặc tả thiết kế — Dashboard Trung tâm điều hành

**Ngày:** 14/08/2026
**Trạng thái:** Đã được người dùng chọn phương án A và ủy quyền triển khai sau kiểm định chuyên môn
**Kế thừa:** `2026-08-14-po-forecasting-compact-operations-design.md`

## 1. Phán đoán sản phẩm

Dashboard hiện tại có số liệu đúng nhưng chưa tạo đủ giá trị điều hành: bốn KPI là các con số rời rạc, cảnh báo chỉ nêu một SKU và lịch cung ứng không giải thích quan hệ giữa thiếu hàng, ngân sách và tiến độ mua.

Dashboard mới phải được định nghĩa bằng một câu:

> Trong ba giây, người dùng biết kế hoạch đang ở trạng thái nào, nguyên nhân chính và việc cần làm tiếp theo.

Ba trục quyết định có trọng số ngang nhau:

1. Rủi ro hàng hóa.
2. Sức khỏe ngân sách.
3. Tiến độ cung ứng.

## 2. Những gì phải cắt bỏ

- Bốn thẻ KPI chỉ chứa số liệu trần và lặp lại ngân sách ở ba thẻ.
- Banner cảnh báo khổ lớn chỉ hiển thị một SKU.
- Timeline một đợt mua chiếm toàn bộ chiều rộng nhưng không tạo insight.
- Biểu đồ, trend hoặc so sánh kỳ trước khi chưa có dữ liệu lịch sử đủ tin cậy.
- Nội dung cố định suy đoán sản phẩm active hoặc chưa có PO nếu dữ liệu không chứng minh được.

## 3. Cấu trúc thông tin

Toàn bộ phần sau `PageHeader` dùng một luồng lưới với `row-gap: 24px`. Các khối không được chạm viền; khoảng trắng là ranh giới nhóm chính.

### 3.1 Ngữ cảnh kế hoạch

Giữ context bar compact gồm nhãn hàng, kỳ kế hoạch, phiên bản và trạng thái. Dòng tóm tắt điều hành phải hiển thị thời điểm cập nhật gần nhất từ `plan.version.updatedAt` để người dùng đánh giá độ mới dữ liệu.

### 3.2 Tóm tắt điều hành

Một panel đầu trang trả lời ba câu hỏi:

- Tình trạng hiện tại là gì?
- Nguyên nhân nào đáng chú ý nhất?
- Hành động tiếp theo là gì?

Copy được sinh từ dữ liệu theo thứ tự ưu tiên:

1. Vượt ngân sách.
2. Còn SKU cần xử lý.
3. Không có đợt mua.
4. Kế hoạch không còn SKU thiếu và vẫn trong ngân sách.

Panel hiển thị trạng thái bằng icon, nhãn chữ và màu; không dùng màu làm tín hiệu duy nhất. CTA chính dẫn tới kế hoạch mua hàng.

### 3.3 Ba thẻ sức khỏe

Ba thẻ độc lập, cùng chiều cao, cách nhau `16px` desktop và không ghép thành dải bảng.

**Hàng hóa**

- Giá trị chính: số SKU cần xử lý.
- Ngữ cảnh: số SKU khẩn cấp và tổng lượng cần bổ sung.
- Chi tiết: SKU thiếu nhiều nhất.

**Ngân sách**

- Giá trị chính: ngân sách còn lại hoặc số vượt ngân sách.
- Ngữ cảnh: số đã lên đợt mua trên ngân sách mục tiêu.
- Thanh tiến độ: tỷ lệ sử dụng, giới hạn hiển thị trực quan 100% nhưng giá trị chữ giữ tỷ lệ thực tế.

**Cung ứng**

- Giá trị chính: tổng số đợt mua đang hoạt động.
- Ngữ cảnh: phân bổ trạng thái dự kiến/đã gửi/đã xác nhận/đã nhận.
- Chi tiết: ngày hàng về gần nhất; nếu không có thì nêu rõ chưa lập đợt mua.

### 3.4 Vùng quyết định 60/40

Desktop dùng hai cột `minmax(0, 3fr) minmax(18rem, 2fr)` với khoảng cách `24px`. Tablet và mobile xếp một cột.

**Việc cần làm trước — cột 60%**

- Tối đa năm SKU.
- Sắp xếp: Khẩn cấp trước Cần chú ý, sau đó lượng cần bổ sung giảm dần.
- Mỗi dòng: SKU, tên sản phẩm, lượng cần bổ sung, trạng thái và liên kết `Xử lý`.
- Liên kết mở đúng SKU trong Planning bằng query `lineId`, đồng thời giữ `brandId` và `cycleId`.
- Tên dài được rút gọn có tooltip hỗ trợ hover và focus.

**Mốc cung ứng gần nhất — cột 40%**

- Tối đa ba đợt mua gần nhất theo ngày hàng về.
- Mỗi dòng: tên đợt, trạng thái, ngày hàng về, giá trị và số dòng hàng.
- Có liên kết xem toàn bộ lịch cung ứng.
- Khi trống, empty state giải thích đợt mua chưa được lập và dẫn tới kế hoạch.

### 3.5 Tình trạng quy trình

Một footer panel thấp hiển thị:

- Phiên bản và trạng thái hiện tại.
- Thời điểm cập nhật gần nhất.
- Bước tiếp theo theo trạng thái: tiếp tục chỉnh sửa, chờ duyệt, xử lý yêu cầu chỉnh sửa hoặc xem bản đã duyệt.

Panel này không được cạnh tranh thị giác với ba thẻ sức khỏe và không thêm CTA trùng lặp.

## 4. Dữ liệu và quy tắc tính

Không thay đổi schema hoặc ghi dữ liệu mới. `loadDashboard` dẫn xuất thêm:

- `totalRecommendedQty`: tổng `recommendedQty` của các dòng lớn hơn 0.
- `topPriorityRows`: tối đa năm dòng theo severity và `recommendedQty`.
- `batchStatusCounts`: số đợt mua theo trạng thái.
- `nextEtaDate`: ngày hàng về gần nhất trong các đợt chưa bị hủy.
- `budgetUtilization`: `committedAmount / targetAmount × 100`; target bằng 0 trả về 0.

Mọi số tiền dùng currency của cycle. Số lượng dùng `vi-VN`. Ngày dùng múi giờ `Asia/Ho_Chi_Minh`.

## 5. Thành phần

- `DashboardExecutiveSummary`: câu kết luận, độ mới và CTA chính.
- `DashboardHealthCards`: ba thẻ hàng hóa, ngân sách, cung ứng.
- `DashboardPriorityList`: top năm SKU và drill-down.
- `DashboardSupplyPreview`: tối đa ba đợt mua.
- `DashboardWorkflowStatus`: trạng thái phiên bản và bước tiếp theo.

Các component nhận view model đã tính sẵn, không tự truy vấn dữ liệu. `DashboardPage` chỉ ghép bố cục và URL theo scope nhãn hàng hiện tại.

## 6. Responsive và accessibility

- Desktop: ba health card một hàng, quyết định 60/40.
- Tablet: health card có thể 2+1; quyết định một cột khi chiều rộng không đủ.
- Mobile: mọi khối một cột, khoảng cách dọc tối thiểu 16px.
- Không cuộn ngang ở 1280×800, 1024×768 và 390×844.
- Link/nút mobile tối thiểu 44px.
- Heading theo thứ bậc H1 → H2 → H3; mỗi panel có accessible name.
- Trạng thái có text label; progress có accessible label và giá trị.
- Tooltip tên sản phẩm hoạt động bằng hover và focus.
- Focus visible rõ trên từng row/link.

## 7. Empty và edge states

- Không có plan: giữ empty state được phân quyền hiện tại.
- Không có SKU cần xử lý: health card và summary chuyển sang trạng thái tích cực; priority list nêu không còn việc khẩn cấp.
- Không có đợt mua: supply card và preview giải thích rõ, không hiển thị số 0 thiếu ngữ cảnh.
- Vượt ngân sách: giá trị còn lại hiển thị `Vượt …`, tone critical và summary ưu tiên cảnh báo này.
- Target bằng 0: không chia cho 0; nêu chưa thiết lập ngân sách mục tiêu.
- Ngày hoặc tên đợt thiếu: dùng copy trung tính, không suy đoán.

## 8. Tiêu chí nghiệm thu

1. Bốn vùng chính sau header cách nhau tối thiểu 24px trên desktop.
2. Trong viewport đầu tiên, người dùng thấy tóm tắt và ba trục hàng hóa/ngân sách/cung ứng.
3. Không còn bốn KPI cũ `Ngân sách mục tiêu / Đã lên PO / Ngân sách còn lại / SKU cần xử lý` dưới dạng bốn card ngang hàng.
4. Summary đúng thứ tự ưu tiên vượt ngân sách → thiếu hàng → thiếu đợt mua → ổn định.
5. Top priority hiển thị tối đa năm SKU và mở đúng `lineId` trong Planning.
6. Supply preview hiển thị tối đa ba đợt và có link xem toàn bộ.
7. Hiển thị thời gian cập nhật phiên bản.
8. Không có biểu đồ hoặc trend giả khi không có dữ liệu lịch sử.
9. Không cuộn ngang tại ba viewport nghiệm thu.
10. Các test unit/component, lint, typecheck và production build đạt.

## 9. Ngoài phạm vi

- Không thay schema Supabase, RLS, approval engine hoặc import pipeline.
- Không tạo dự báo mới hay chấm điểm AI.
- Không bổ sung time-series hoặc so sánh phiên bản trong đợt này.
- Không thay đổi logic Amount hoặc quyền người dùng.
