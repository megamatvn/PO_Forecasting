# Đặc tả thiết kế UX — PO Forecasting Operations Center

**Ngày:** 12/08/2026
**Trạng thái:** Đã duyệt ngày 12/08/2026
**Phạm vi:** App shell, dashboard, planning workspace, import, approval policy và ngôn ngữ giao diện
**Thiết kế trực quan:** `.superpowers/brainstorm/63213-1786501362/content/final-integrated-design.html`

## 1. Bối cảnh và vấn đề

Phiên bản hiện tại đáp ứng luồng nghiệp vụ chính nhưng giao diện còn thiên về trình diễn, làm giảm hiệu quả vận hành:

- Tiêu đề và khoảng trắng chiếm quá nhiều vùng nhìn đầu tiên.
- Sidebar không thể hiện menu đang active.
- Menu chưa chia nhóm theo công việc; đổi nhãn hàng luôn đẩy người dùng về Dashboard.
- Planning Grid rộng, khó quét và dễ nhập nhầm.
- Cảnh báo Critical lặp lại cùng một thông tin ở nhiều vị trí.
- CTA gửi duyệt xuất hiện trước khi người dùng xử lý thiếu hàng và kiểm tra ngân sách.
- Form chính sách duyệt chia ba cột đồng hạng, không phản ánh thứ tự ra quyết định.
- Giao diện trộn tiếng Việt và tiếng Anh không có chủ đích.
- Cụm `Forecast 5M` được dùng như tên tính năng dù `5M` thực chất là ngân sách mục tiêu 5 triệu EUR.
- Importer đang phụ thuộc vào tên sheet `Forecast 5M`, nên một workbook có ngân sách 4M hoặc 10M có thể không tương thích dù cùng cấu trúc nghiệp vụ.

## 2. Quyết định nghiệp vụ đã chốt

### 2.1 Ý nghĩa của 5M

`5M` có nghĩa là **5 triệu EUR**, không phải kỳ forecast năm tháng.

Ứng dụng không tạo khái niệm Forecast 4M, 5M hoặc 10M. Thay vào đó:

- Mỗi nhãn hàng có một kế hoạch mua hàng theo năm, ví dụ `ETX · 2026`.
- Ngân sách mục tiêu là thuộc tính tiền tệ độc lập của kế hoạch.
- Giá trị ngân sách có thể là 4M, 5M, 10M hoặc một số tiền bất kỳ.
- Tên tính năng, menu và tiêu đề không chứa giá trị ngân sách.
- Schema hiện tại `planning_cycles.target_purchase_amount` và `currency_code` tiếp tục là nguồn dữ liệu canonical cho ngân sách; không cần tạo loại forecast mới.

### 2.2 Tên sản phẩm

Tên sản phẩm trong giao diện là **Kế hoạch mua hàng**. `PO Forecasting` chỉ được giữ ở brand/product lockup khi cần nhận diện hệ thống; các tác vụ dùng ngôn ngữ nghiệp vụ tiếng Việt.

### 2.3 Nguồn Excel

Tên sheet Excel là metadata của nguồn import, không phải tên miền nghiệp vụ. Tên sheet gốc vẫn được lưu để audit, nhưng UI và database không suy ra loại kế hoạch từ `4M`, `5M` hoặc `10M` trong tên sheet.

## 3. Mục tiêu thiết kế

1. Trong ba giây, người dùng nhận ra nhãn hàng, năm kế hoạch, ngân sách, rủi ro chính và hành động kế tiếp.
2. Mọi route chính và route con luôn cho biết menu hiện tại.
3. Luồng Planner theo đúng thứ tự: nhận diện rủi ro → xử lý SKU → cấu hình đợt PO/ETA → kiểm tra ngân sách → gửi duyệt.
4. Giảm cuộn ngang và giảm khả năng nhập nhầm bằng workspace master–detail.
5. Luồng Administrator theo đúng thứ tự: phạm vi → tuyến duyệt → ngoại lệ/hiệu lực → xác nhận.
6. Copy tiếng Việt nhất quán, ngắn và giải thích hậu quả của hành động.
7. Desktop ưu tiên hiệu suất; tablet và mobile vẫn có điều hướng, đọc dữ liệu và hoàn thành tác vụ chính.
8. Đạt WCAG 2.1 AA cho độ tương phản, focus, keyboard flow, semantic structure và trạng thái không chỉ truyền đạt bằng màu.

## 4. Hướng thẩm mỹ

Hướng được duyệt là **Trung tâm vận hành**:

- Giữ nền off-white, charcoal và champagne gold của Sagen.
- Be Vietnam Pro dùng cho body và controls; Noto Serif Display chỉ dùng cho tiêu đề cấp cao và con số nhấn mạnh.
- Serif không dùng cho bảng, form label hoặc đoạn văn vận hành.
- Tiêu đề trang desktop giới hạn khoảng 36–44px, không chiếm quá một phần tư vùng nhìn đầu tiên.
- Border mảnh, radius vừa phải 4–10px; tránh dãy card bo tròn đồng hạng.
- Màu chỉ mang nghĩa: đỏ Critical, vàng Warning/chú ý, xanh trạng thái tốt/đã lưu.
- Khoảng trắng dùng để phân nhóm, không đẩy công việc chính xuống dưới fold.

## 5. App shell và điều hướng

### 5.1 Nhóm menu

Sidebar chia thành ba nhóm:

**Lập kế hoạch**

- Tổng quan
- Kế hoạch mua
- Đợt PO & ETA

**Dữ liệu**

- Import dữ liệu
- Phiên bản

**Quản trị**

- Hồ sơ chờ duyệt
- Chính sách duyệt
- Người dùng & quyền

Menu vẫn lọc theo quyền hiện có. RLS tiếp tục là lớp bảo vệ dữ liệu bắt buộc; ẩn menu không thay thế authorization.

### 5.2 Active state

Mỗi route có đúng một menu active:

- Nền sáng hơn sidebar.
- Vạch vàng bên trái.
- Chấm trạng thái vàng.
- Chữ trắng, weight 600–700.
- `aria-current="page"` trên link active.
- Route con kế thừa menu cha, ví dụ `/planning/[cycleId]` active `Kế hoạch mua` và `/versions/[versionId]` active `Phiên bản`.

Hover, focus và active phải khác nhau nhưng cùng hệ màu. `:focus-visible` có outline rõ ít nhất 2px.

### 5.3 Chọn nhãn hàng

- Selector hiển thị nhãn hàng active ở phần trên sidebar.
- Thay nhãn hàng giữ nguyên module hiện tại khi module hỗ trợ brand scope.
- Nếu route hiện tại không hợp lệ với nhãn hàng mới, điều hướng đến màn hình gần nhất có quyền và hiển thị thông báo ngắn.
- Nút ký hiệu `↗` được thay bằng label/icon có nghĩa rõ như `Áp dụng` hoặc selector tự áp dụng có trạng thái loading.

### 5.4 Mobile và tablet

- Dưới 900px, sidebar chuyển thành app header và drawer đóng/mở được.
- Header luôn hiển thị logo rút gọn, nhãn hàng active, tên module và nút menu tối thiểu 44×44px.
- Drawer tự đóng sau khi chọn route; focus được giữ đúng và Escape đóng drawer.
- Không render toàn bộ sidebar thành một khối dài phía trên nội dung.

## 6. Dashboard — Tổng quan vận hành

### 6.1 Vùng nhìn đầu tiên

Header gọn gồm:

- Breadcrumb: `Tổng quan / ETX`.
- H1: `Kế hoạch mua hàng 2026`.
- Mô tả một dòng.
- CTA phụ: `Xuất báo cáo`.
- Context bar: nhãn hàng, năm, version/status.

Không hiển thị `Executive workspace` hoặc `Forecast 5M`.

### 6.2 KPI

Bốn KPI chính:

1. Ngân sách mục tiêu.
2. Đã lên PO.
3. Ngân sách còn lại.
4. SKU cần xử lý.

`Ngân sách còn lại` thay cho `Khoảng trống` để tránh mơ hồ. Dashboard và Planning dùng cùng thuật ngữ `Đã lên PO`.

KPI cần có ngữ cảnh khi phù hợp, ví dụ tỷ lệ ngân sách đã sử dụng. Không dùng màu là tín hiệu duy nhất.

### 6.3 Ưu tiên và lịch cung ứng

- Chỉ có một alert ưu tiên cho SKU có shortage cao nhất.
- Alert nêu SKU, số thiếu, lý do/ngữ cảnh và một CTA `Mở kế hoạch`.
- Không lặp số thiếu trong headline, mô tả và CTA.
- PO Timeline đổi nhãn thành `Đợt PO & ETA`; trạng thái được Việt hóa nhất quán.

## 7. Workspace — Kế hoạch mua hàng

### 7.1 Trình tự tác vụ

Workspace có bốn bước điều hướng:

1. Sản phẩm.
2. Đợt PO & ETA.
3. Ngân sách.
4. Gửi duyệt.

Đây là navigation theo bước trong cùng workflow, không giả làm ARIA tabs nếu mỗi mục dẫn tới route/page khác. Thành phần dùng `<nav>` và link; trạng thái hiện tại dùng `aria-current="step"` hoặc `aria-current="page"` phù hợp.

CTA `Kiểm tra & gửi duyệt` chỉ xuất hiện ở bước Gửi duyệt hoặc summary cuối, sau khi dữ liệu cần thiết hợp lệ.

### 7.2 Master–detail được duyệt

Layout desktop:

- Trái: danh sách SKU gọn, tìm kiếm/lọc/sắp xếp.
- Phải: panel chi tiết của SKU đang chọn.

Danh sách mặc định hiển thị:

- SKU.
- Tên sản phẩm.
- Tồn hiện tại.
- Nhu cầu năm.
- Thiếu dự kiến.
- Trạng thái xử lý.

Toolbar hỗ trợ:

- Tìm theo SKU hoặc tên sản phẩm.
- Lọc Critical, Warning, Healthy và chưa xử lý.
- Sắp xếp thiếu nhiều nhất, SKU, tên sản phẩm.

Panel chi tiết hiển thị:

- SKU và tên sản phẩm.
- Tồn hiện tại.
- Nhu cầu năm.
- Shortage và ngữ cảnh thiếu.
- Qty đặt.
- FOC.
- Ex Price và tiền tệ.
- Amount tự động theo `Qty × Ex Price`.
- CTA `Lưu đề xuất`.

### 7.3 Hành vi nhập liệu

- Qty và FOC là số nguyên không âm.
- Ex Price là số không âm với precision hiện có.
- Amount là read-only và luôn do hệ thống tính.
- Autosave hiển thị `Đang lưu`, `Đã lưu`, `Lỗi lưu` hoặc `Có xung đột` bằng text và `aria-live`.
- Chuyển SKU khi có thay đổi đang lưu không làm mất dữ liệu; UI báo trạng thái rõ.
- Nút `Điền đề xuất` đặt Qty bằng recommended quantity nhưng người dùng vẫn phải thấy giá trị và Amount trước khi chuyển bước.

### 7.4 Tablet và mobile

- Tablet có thể giữ split view nếu mỗi pane đạt kích thước đọc được.
- Mobile chuyển thành danh sách → trang/panel chi tiết toàn màn hình; có nút quay lại danh sách giữ nguyên filter và scroll position.
- Không có cuộn ngang toàn trang.

## 8. Chính sách duyệt

Hướng được duyệt là **form dọc có hướng dẫn và summary cố định**.

### 8.1 Trình tự

1. Phạm vi nhãn hàng.
2. Tuyến duyệt.
3. Ngoại lệ và hiệu lực.
4. Xác nhận.

Các section đã hoàn thành thu gọn thành summary có nút `Chỉnh sửa`. Section hiện tại mở đầy đủ.

### 8.2 Summary cố định

Desktop hiển thị rail bên phải:

- Nhãn hàng áp dụng.
- Chế độ duyệt.
- Cấp 1.
- Cấp 2 nếu có.
- Hạn mức và tiền tệ nếu dùng threshold.
- Ngoại lệ tăng cấp.
- Ngày hiệu lực.
- Ghi chú: cấu hình mới không thay đổi hồ sơ đang duyệt.
- CTA `Lưu chính sách`.

Tablet/mobile đưa summary xuống cuối và có thanh hành động sticky không che nội dung.

### 8.3 Copy

- `Điều kiện escalated` → `Điều kiện tăng cấp duyệt`.
- `Có SKU Critical` có thể giữ `Critical` như trạng thái nghiệp vụ, nhưng phải có mô tả tiếng Việt.
- Validation hiển thị cạnh trường lỗi và có summary lỗi ở đầu form sau submit.

## 9. Import dữ liệu

### 9.1 Copy và bố cục

- `Dữ liệu nguồn · Forecast 5M` → `Dữ liệu nguồn`.
- `Import Excel` → `Import dữ liệu kế hoạch`.
- `Đưa Forecast 5M vào vùng kiểm tra` → `Chọn file kế hoạch để kiểm tra`.
- Preview nêu tên file, sheet nguồn được nhận diện, nhãn hàng và năm dữ liệu.

### 9.2 Nhận diện sheet không phụ thuộc tên

Importer không dùng một hằng số tên sheet làm điều kiện duy nhất. Luồng nhận diện:

1. Quét các worksheet có dữ liệu.
2. Chấm điểm theo cấu trúc bắt buộc: header SKU/Code, Product Name, Ex Price, tồn kho và các cột PO liên quan.
3. Nếu có đúng một sheet đạt ngưỡng, dùng sheet đó và hiển thị tên trong preview.
4. Nếu không có sheet phù hợp, trả lỗi nêu các header còn thiếu.
5. Nếu nhiều sheet cùng đạt ngưỡng, không tự đoán; yêu cầu người dùng chọn sheet trước khi stage batch.

Tên sheet gốc được lưu trong import metadata/snapshot để audit. Chuỗi `Forecast 5M` có thể tồn tại trong fixture, parser compatibility test và diagnostic message về tên sheet nguồn, nhưng không được dùng làm product copy hoặc business discriminator.

### 9.3 Forecast theo tháng

Parser đọc các tháng từ header thực tế thay vì giả định dựa trên tên sheet hoặc ngân sách. Kế hoạch năm tiếp tục hỗ trợ 12 tháng; các tháng thiếu trong nguồn phải được biểu diễn rõ là 0 hoặc lỗi theo contract import hiện có, không suy ra từ `4M/5M/10M`.

## 10. Các màn hình còn lại

### 10.1 Hồ sơ chờ duyệt

- Giữ master–detail nhưng tăng active state của hồ sơ đang chọn.
- Header tập trung vào số hồ sơ, cấp duyệt hiện tại và ngoại lệ.
- Việt hóa status và bỏ các badge kỹ thuật như `Snapshot policy bất biến` khỏi vị trí nổi bật; đưa giải thích vào contextual note.

### 10.2 Phiên bản

- Danh sách có filter theo nhãn hàng, năm và trạng thái.
- Status được Việt hóa.
- Dùng label `Phiên bản 1`, không trộn `Version 1` trong nội dung chính.

### 10.3 Người dùng & quyền

- Giữ master–detail.
- Danh sách người dùng có active state rõ, tìm kiếm và trạng thái hoạt động.
- Editor nhóm vai trò và nhãn hàng; CTA sticky trong pane thay vì nằm xa dưới fold.

## 11. Ngôn ngữ giao diện

| Hiện tại | Chuẩn mới |
|---|---|
| Forecast Planning | Kế hoạch mua hàng |
| Forecast 5M | Không dùng trong product copy |
| Planning Grid | Sản phẩm |
| PO Timeline | Đợt PO & ETA |
| Cash Summary | Ngân sách |
| Version History | Phiên bản |
| Executive workspace | Bỏ |
| Administration · Approval | Quản trị / Phê duyệt |
| Điều kiện escalated | Điều kiện tăng cấp duyệt |
| Forecast năm | Nhu cầu năm |
| Amount | Thành tiền |
| Qty | Số lượng đặt hoặc Qty kèm giải thích |
| Ex Price | Đơn giá EX |
| Khoảng trống | Ngân sách còn lại |

Các thuật ngữ viết tắt nghiệp vụ như SKU, PO, ETA, FOC và EX có thể giữ nhưng lần xuất hiện đầu tiên trong màn hình cấu hình hoặc help text phải đủ rõ.

## 12. Accessibility

- Cấu trúc semantic: `<aside>`, `<nav>`, `<main>`, `<section>`, heading level tuần tự.
- Mỗi route có `aria-current` đúng.
- Không dùng `role="tab"` nếu không triển khai đầy đủ tab pattern và keyboard behavior.
- Tap target tối thiểu 44×44px trên mobile.
- Contrast body text tối thiểu 4.5:1; large text và non-text UI tối thiểu 3:1.
- Focus visible rõ trên link, button, select, input, drawer và dialog.
- Dialog có focus trap, Escape và focus return.
- Loading/save/error/status dùng text và live region, không chỉ màu hoặc icon.
- Bảng/danh sách có accessible name; sort state dùng `aria-sort`.
- Reduced motion được tôn trọng.

## 13. Kiến trúc component dự kiến

Các boundary chính:

- `AppSidebar` + client route-aware `NavigationLink`.
- `MobileAppHeader` và `NavigationDrawer` dùng chung navigation model.
- `PageHeader` gọn dùng lại cho các module.
- `PlanContextBar` cho brand/year/version/status.
- `MetricStrip` dùng cùng vocabulary giữa Dashboard và Planning.
- `PlanningProductList` quản lý search/filter/sort/selection.
- `PlanningProductEditor` chỉ quản lý chi tiết SKU và validation.
- `PlanningWorkflowNav` quản lý bốn bước, không giả lập tabs.
- `ApprovalPolicySections` và `ApprovalPolicySummary` tách biệt.
- `WorkbookSheetDetector` trả về candidate + confidence + missing headers; parser nhận worksheet đã chọn thay vì tự khóa tên.

Component mới phải nhỏ, có một trách nhiệm rõ và được kiểm thử độc lập. Không gom toàn bộ hành vi vào `globals.css` hoặc một component monolithic.

## 14. Data flow và compatibility

- Không thay đổi invariant `Amount = Qty × Ex Price`.
- Không thay đổi RLS, role hoặc approval snapshot semantics.
- Không thay đổi ý nghĩa `planning_year` và ngân sách kế hoạch.
- Brand switching phải giữ module nhưng vẫn tôn trọng brand scope từ server/RLS.
- URL hiện có được giữ hoặc redirect tương thích; việc đổi label không bắt buộc đổi route.
- Parser mới phải đọc được workbook `ETX_PO_Forecasting_2026_28_Jul_5M.xlsx` hiện tại và workbook cùng cấu trúc có tên sheet khác.
- Tên sheet được thêm vào metadata mà không làm mất checksum, idempotency hoặc audit trail hiện có.

## 15. Error handling

- Brand không có dữ liệu: empty state nêu hành động tiếp theo.
- Sheet không nhận diện được: nêu header thiếu và không stage batch.
- Nhiều sheet phù hợp: yêu cầu chọn; không tự commit.
- Lỗi autosave: giữ draft local trong UI, báo lỗi và cho retry an toàn.
- Conflict: modal hiện version mới nhất và lựa chọn tải lại/đối chiếu.
- Policy validation: lỗi tại field, focus vào lỗi đầu tiên sau submit.
- Route không còn quyền sau brand switch: điều hướng an toàn và thông báo nguyên nhân.

## 16. Tiêu chí nghiệm thu

1. Tại mọi route chính và route con, đúng một navigation item có `aria-current` và active state nhìn rõ.
2. Product copy không chứa chuỗi cố định `Forecast 5M`; nếu tên này xuất hiện trong preview/diagnostic thì đó phải là tên sheet thực tế được đọc động từ file nguồn. Giá trị 5 triệu EUR chỉ xuất hiện như ngân sách mục tiêu.
3. Workbook hiện tại và một fixture đổi tên sheet vẫn preview/validate đúng 13 SKU; trường hợp nhiều sheet phù hợp yêu cầu lựa chọn.
4. Dashboard hiển thị trong vùng nhìn đầu tiên: brand, year, ngân sách, đã lên PO, ngân sách còn lại, SKU cần xử lý và hành động ưu tiên ở viewport 1366×768.
5. Planning Product List tìm được theo SKU/tên, lọc được severity và sắp xếp được shortage.
6. Chọn SKU cập nhật panel chi tiết; Qty, FOC và Ex Price có validation; Amount là read-only và tự tính.
7. Planner không thấy CTA gửi duyệt trước bước Gửi duyệt; submission vẫn preview đúng route approval trước khi confirm.
8. Policy editor hoàn thành theo phạm vi → tuyến → ngoại lệ/hiệu lực → xác nhận và summary luôn phản ánh draft hiện tại.
9. Mobile dùng drawer; không có cuộn ngang toàn trang; nút và controls đạt 44×44px.
10. Keyboard-only hoàn thành được navigation, chọn SKU, chỉnh PO, policy form và dialog.
11. Unit/component tests kiểm tra copy mới, active states, search/filter/sort, sheet detection và policy summary.
12. E2E thực kiểm tra Dashboard → Planning master–detail → tạo đề xuất → kiểm tra ngân sách → gửi duyệt trên Supabase test/local phù hợp; production reset route vẫn không khả dụng.

## 17. Ngoài phạm vi

- Thay đổi thuật toán shortage hoặc recommendation.
- Thay đổi approval engine, role model hoặc RLS.
- Tạo loại forecast 4M/5M/10M.
- Tự động tạo PO từ receipt lịch sử.
- Thay đổi dữ liệu production trong đợt redesign UI.
- Thiết kế biểu đồ tài chính nâng cao ngoài KPI và summary hiện có.

## 18. Trình tự triển khai đề xuất

1. Chuẩn hóa copy và navigation model.
2. App shell route-aware + mobile drawer.
3. Shared page header/context/KPI components.
4. Dashboard operations layout.
5. Planning workflow navigation và master–detail.
6. Policy editor guided layout.
7. Import sheet detection và metadata.
8. Các màn hình approval/version/user còn lại.
9. Responsive, accessibility và visual regression QA.

Mỗi bước phải có test trước hoặc đồng thời với behavior mới, verification fresh và không commit/push khi chưa có chỉ đạo Git cụ thể.
