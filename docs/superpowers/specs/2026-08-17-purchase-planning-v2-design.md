# Thiết kế V2 — Lập và vận hành kế hoạch mua hàng năm

**Ngày:** 2026-08-17

**Trạng thái:** Đã được người dùng duyệt ngày 2026-08-17

**Sản phẩm:** Ứng dụng nội bộ Sagen Groupe

**Nền tảng:** Next.js + Supabase

## 1. Tuyên bố sản phẩm

> Hệ thống lập, phê duyệt và vận hành kế hoạch mua hàng năm theo từng nhãn hàng.

Ứng dụng là nguồn dữ liệu chính cho kế hoạch mua hàng. Excel chỉ là lựa chọn nhập nhanh bằng mẫu chuẩn do hệ thống phát hành; Excel không phải một hệ dữ liệu hoặc quy trình nghiệp vụ riêng.

## 2. Mục tiêu

1. Cho phép người có quyền tạo kế hoạch mua hàng cho một nhãn hàng trong năm hiện tại hoặc tương lai.
2. Dẫn người dùng qua một quy trình tuần tự, có autosave và không thể bỏ qua bước chưa hợp lệ.
3. Tách kế hoạch năm đã duyệt khỏi đề xuất nhập hàng phát sinh trong vận hành.
4. Định tuyến phê duyệt theo đúng quan hệ Leader → Manager → CEO/BOD.
5. Giữ kế hoạch đã duyệt làm baseline bất biến, đồng thời cho phép theo dõi phần thực hiện và vượt kế hoạch.
6. Cung cấp dashboard theo vai trò, ưu tiên quyết định và ngoại lệ cần xử lý.
7. Bảo vệ dữ liệu từ database bằng RLS, transaction, idempotency và audit.
8. Sử dụng đúng nhận diện Sagen, tiếng Việt và trải nghiệm responsive/accessibility.

## 3. Phạm vi

### 3.1 Trong phạm vi V2

- Tài khoản, cấp tổ chức, quan hệ quản lý, capability và quyền theo nhãn hàng.
- Dữ liệu nền nhãn hàng, SKU và SKU alias/canonical.
- Trình hướng dẫn tạo kế hoạch năm bằng nhập tay hoặc Excel mẫu.
- Phiên bản kế hoạch, phê duyệt kế hoạch và baseline đã duyệt.
- Đợt mua kế hoạch, phân bổ Qty/FOC và trạng thái vận hành.
- Đề xuất nhập hàng, ghép PO, phê duyệt một/hai cấp và hủy có duyệt.
- Notification Center trong ứng dụng.
- Dashboard theo vai trò.
- Audit, lịch sử phiên bản, export và kiểm soát truy cập.
- Làm sạch dữ liệu nghiệp vụ/demo cũ theo phạm vi đã duyệt.

### 3.2 Ngoài phạm vi giai đoạn này

- Thay thế hệ thống ERP hoặc phát hành PO chính thức cho nhà cung cấp.
- Đồng bộ ERP hai chiều.
- Email, Teams hoặc push notification ngoài ứng dụng.
- Dự báo nhu cầu, safety stock và shortage forecasting tự động làm đầu vào bắt buộc.
- Quản lý nhà cung cấp, vận chuyển, hóa đơn hoặc thanh toán.
- Kế hoạch cho năm quá khứ.

Phân tích nhu cầu/thiếu hàng có thể được bổ sung sau như một lớp phân tích tùy chọn. Nó không quyết định số lượng mua năm trong V2.

## 4. Nguyên tắc thiết kế

1. **Kế hoạch do người quản lý chủ động xác lập.** Hệ thống kiểm tra và hỗ trợ, không tự quyết định số lượng mua.
2. **Một nguồn sự thật.** Baseline đã duyệt là nguồn chính thức cho dashboard và đề xuất.
3. **Bản nháp riêng tư.** Chỉ chủ sở hữu được đọc nội dung bản nháp.
4. **Không sửa lịch sử.** Phiên bản đã duyệt, quyết định và người duyệt cũ không bị ghi đè.
5. **Tách kế hoạch khỏi vận hành.** Đề xuất nhập hàng không thay đổi baseline.
6. **Không tin client.** Quyền và invariants được thực thi lại tại database.
7. **Tiếng Việt trước.** Thuật ngữ kỹ thuật chỉ giữ khi cần và phải được giải thích.
8. **Tập trung vào hành động.** Dashboard trả lời trong vài giây: cần làm gì, kế hoạch đang ở đâu, rủi ro nào đáng chú ý.

## 5. Kiến trúc đích

V2 là một modular monolith trong cùng dự án Next.js và Supabase. Không tách microservice.

### 5.1 Các phân hệ

1. **Tổ chức và phân quyền**
   - Tài khoản, cấp tổ chức, Administrator, quan hệ quản lý, capability và quyền nhãn hàng.
2. **Dữ liệu nền**
   - Nhãn hàng, SKU, alias/canonical và trạng thái hoạt động.
3. **Kế hoạch mua hàng năm**
   - Chu kỳ Nhãn hàng × Năm, bản nháp, phiên bản và dòng SKU năm.
4. **Đợt mua kế hoạch**
   - PO có định danh ổn định, dữ liệu theo phiên bản và phân bổ SKU.
5. **Đề xuất nhập hàng**
   - Bản nháp đề xuất, dòng SKU, tháng cần hàng, ghép PO và độ lệch.
6. **Phê duyệt và thông báo**
   - Snapshot tuyến duyệt, bước duyệt, quyết định, outbox và Notification Center.
7. **Theo dõi và báo cáo**
   - Baseline, mức sử dụng PO, phần còn lại/vượt và dashboard theo vai trò.
8. **Excel adapter**
   - Sinh template, parse, staging, validation, preview và áp dụng vào bản nháp.

### 5.2 Ranh giới kỹ thuật

- React Server Components phục vụ các truy vấn đọc phù hợp.
- Client Components chỉ dùng cho biểu mẫu, bảng tương tác, autosave và modal.
- Các thao tác nghiệp vụ quan trọng đi qua command/API có contract rõ.
- Các thay đổi nhiều bảng chạy trong Postgres transaction/RPC.
- UI không được tự cập nhật rời rạc nhiều bảng để mô phỏng một giao dịch.
- Các phần đọc độc lập được khởi chạy song song; không tạo data-fetch waterfall không cần thiết.
- Module công khai type/command/query contract; không để component phụ thuộc trực tiếp cấu trúc bảng nội bộ.

## 6. Người dùng, cấp tổ chức và quyền

### 6.1 Cấp tổ chức chính

Mỗi tài khoản có đúng một cấp tổ chức:

- `employee_viewer`
- `leader`
- `manager`
- `executive` — CEO/BOD

Một tài khoản không thể đồng thời là Leader và Manager.

### 6.2 Administrator

Administrator là capability hệ thống độc lập với cấp tổ chức. Ví dụ CEO/BOD có thể đồng thời là Administrator.

Administrator được quản lý:

- Tài khoản và trạng thái hoạt động.
- Cấp tổ chức và quan hệ báo cáo.
- Capability và quyền nhãn hàng.
- Chính sách duyệt.
- Dữ liệu nền.
- Audit và metadata phục vụ chuyển ownership.

Administrator không mặc nhiên đọc nội dung bản nháp riêng tư. Admin chỉ thấy metadata tối thiểu để thực hiện chuyển chủ sở hữu khi cần.

### 6.3 Capability nghiệp vụ

Capability được cấp riêng và có thể giới hạn theo nhãn hàng:

- `create_annual_plan`
- `view_approved_plan`
- `create_purchase_proposal`
- `manage_master_data`
- `administer_system`

Mặc định:

- Manager và CEO/BOD có `create_annual_plan`.
- Leader có `create_purchase_proposal`.
- Quyền xem kế hoạch của Leader do Admin quyết định.
- Mọi quyền phải được kiểm tra ở UI, API và RLS.

### 6.4 Quan hệ quản lý

- Leader đang hoạt động bắt buộc có một Manager đang hoạt động.
- Manager đang hoạt động bắt buộc có một CEO/BOD đang hoạt động.
- Không cho phép tự quản lý hoặc tạo vòng lặp.
- Leader gửi đề xuất đến đúng Manager trực tiếp.
- Manager gửi kế hoạch/đề xuất cấp 2 đến đúng CEO/BOD trực tiếp.
- Thay người quản lý sẽ chuyển hồ sơ đang chờ đến người mới.
- Lịch sử đã hoàn tất giữ nguyên người được giao/người quyết định tại thời điểm đó.
- Trước khi vô hiệu hóa Manager hoặc CEO/BOD, Admin phải chọn người thay thế.
- Việc chuyển cấp dưới, quyền kế thừa và hồ sơ đang chờ phải nguyên tử.

### 6.5 Kế thừa quyền nhãn hàng

- Phạm vi cần xem/phê duyệt được kế thừa hướng lên: Leader → Manager → CEO/BOD.
- Kế thừa chỉ cấp quyền xem/phê duyệt cần thiết, không tự cấp quyền sửa hoặc tạo thay người khác.
- Không kế thừa hướng xuống.
- UI quản trị hiển thị quyền trực tiếp, quyền kế thừa và nguồn kế thừa.

### 6.6 Tài khoản và đăng nhập

- Admin tạo tài khoản nhân sự và gán cấp tổ chức, người quản lý, capability, nhãn hàng.
- Email nội bộ mặc định thuộc `@sagen-groupe.com`.
- Màn hình đăng nhập cho phép nhập phần tiền tố; hệ thống bổ sung domain trước khi xác thực.
- Không cho người dùng tự thay đổi trạng thái active, cấp tổ chức hoặc quyền của chính mình.

## 7. Dữ liệu nền

### 7.1 Nhãn hàng

Nhãn hàng gồm:

- Mã, ví dụ `ET`.
- Tên, ví dụ `Etiaxil`.
- Trạng thái hoạt động.

Quy tắc:

- Mã được normalize uppercase và duy nhất.
- Người có `create_annual_plan` có thể tạo nhãn hàng ngay trong bước 1.
- Nhãn hàng mới active ngay.
- Người tạo nhận phạm vi phù hợp.
- CEO/BOD phụ trách và Administrator nhận metadata/phạm vi cần thiết.
- Mọi lần tạo, sửa, deactivate đều được audit.

### 7.2 SKU

SKU gồm:

- Mã SKU.
- Tên sản phẩm.
- `brand_id` bắt buộc.
- Trạng thái hoạt động.

Quy tắc:

- SKU gắn với nhãn hàng bằng `brand_id`, không suy luận bằng prefix chuỗi.
- Mã normalize uppercase và duy nhất toàn hệ thống.
- Prefix không giống mã nhãn hàng chỉ tạo cảnh báo, không chặn.
- SKU mới tạo trong wizard mặc nhiên gắn với nhãn hàng đang chọn.
- SKU alias/canonical là cấu hình dữ liệu nền, không hardcode trong Excel parser.
- Quy tắc nghiệp vụ đã xác nhận được giữ: `ET-015026` và `ET-015027` quy về canonical `ET-015025` khi các mã liên quan được khai báo.

## 8. Kế hoạch mua hàng năm

### 8.1 Chu kỳ

- Một chu kỳ duy nhất cho mỗi Nhãn hàng × Năm.
- Năm mới chỉ có thể là năm hiện tại hoặc tương lai tại thời điểm tạo.
- Kế hoạch quá khứ đã tồn tại vẫn xem được; không tạo mới cho quá khứ.
- Tại một thời điểm chỉ có một workflow phiên bản đang hoạt động cho chu kỳ.
- Nếu có bản nháp riêng của người dùng, mở lại bản nháp đó.
- Nếu có bản nháp của người khác, không tiết lộ nội dung hoặc owner; hệ thống báo chung rằng chu kỳ đang được chuẩn bị.

### 8.2 Trình hướng dẫn bốn bước

Wizard dùng tiến trình ngang toàn trang trên desktop. Mobile hiển thị `Bước X/4`, tên bước và thanh tiến độ ngắn.

#### Bước 1 — Phạm vi kế hoạch

- Chọn năm hiện tại/tương lai.
- Chọn nhãn hàng được phép.
- Có thể mở modal tạo nhãn hàng.
- Khôi phục bản nháp của chính người dùng nếu tồn tại.

#### Bước 2 — Kế hoạch SKU cả năm

Mỗi dòng gồm:

- SKU.
- Tên sản phẩm.
- Đơn giá xuất khẩu — Ex Price.
- Số lượng mua trả tiền — Annual Paid Qty.
- FOC dự kiến — Annual Expected FOC.
- Tổng lượng nhận — tự tính bằng Paid Qty + FOC.
- Tồn kho đầu kỳ của năm kế hoạch.
- Giá trị kế hoạch — tự tính bằng Paid Qty × Ex Price.

Người dùng được thêm nhiều dòng, chọn SKU theo nhãn hàng hoặc tạo SKU mới tại chỗ.

#### Bước 3 — Phân bổ theo đợt mua

- Người dùng thêm số PO cần thiết; không đặt giới hạn cứng.
- Mỗi PO có tên/số thứ tự, tháng đặt và tháng hàng về.
- Ma trận có SKU theo dòng, PO theo nhóm cột; mỗi PO chứa Qty và FOC.
- Giá trị dòng PO = Qty trả tiền × Ex Price.
- Với từng SKU:
  - Tổng Qty mọi PO phải bằng Annual Paid Qty.
  - Tổng FOC mọi PO phải bằng Annual Expected FOC.
  - Tổng Qty + FOC mọi PO phải bằng Annual Total Receipts.
- Không cho chuyển bước nếu thiếu hoặc thừa phân bổ.

#### Bước 4 — Kiểm tra và xác nhận

Hiển thị:

- Phạm vi và người lập.
- Tổng ngân sách.
- Danh sách SKU.
- Tổng phân bổ theo PO.
- Lịch dự kiến.
- Lỗi bắt buộc sửa.
- Cảnh báo có thể chấp nhận.

Hành động cuối:

- Manager: `Hoàn tất & gửi CEO/BOD duyệt`.
- CEO/BOD: `Hoàn tất & phê duyệt`.
- Tất cả: `Lưu nháp và thoát`.

Sau xác nhận là màn hình kết quả, không phải bước nhập liệu thứ năm.

### 8.3 Lưu và quyền riêng tư

- Autosave mọi thay đổi hợp lệ.
- Hiển thị rõ `Đang lưu`, `Đã lưu`, `Lỗi lưu`.
- Bản nháp chỉ owner đọc/sửa/xóa.
- Manager/CEO/BOD không nhìn thấy bản nháp của cấp dưới.
- Admin chỉ có thể chuyển ownership bằng một thao tác quản trị được audit.
- Khi gửi duyệt, phiên bản mới xuất hiện cho đúng người duyệt.

### 8.4 Phiên bản và baseline

- Phiên bản đã duyệt là snapshot bất biến.
- Kế hoạch sửa sau duyệt tạo revision mới bằng cách sao chép baseline hiện hành.
- Revision mới chỉ thay baseline sau khi được duyệt.
- Baseline cũ chuyển thành `superseded` nhưng luôn giữ lịch sử.
- Dashboard chính thức không hiển thị draft hoặc pending như baseline.

### 8.5 Phê duyệt kế hoạch năm

- Manager tạo → CEO/BOD trực tiếp duyệt.
- CEO/BOD tạo → xác nhận cuối tự phê duyệt.
- Tuyến duyệt được snapshot tại thời điểm gửi.
- Yêu cầu chỉnh sửa tạo revision mới nhưng giữ lịch sử trao đổi/quyết định.
- Từ chối và rút lại là trạng thái kết thúc rõ ràng; không xóa hồ sơ.

## 9. PO kế hoạch và vận hành

### 9.1 Ý nghĩa

PO trong V2 là một đợt mua kế hoạch, chưa phải chứng từ ERP chính thức.

### 9.2 Định danh ổn định

- PO có stable ID độc lập với plan revision.
- Revision lưu tháng đặt, tháng về và phân bổ của stable PO tại phiên bản đó.
- PO đã có đề xuất hoặc trạng thái vận hành không được xóa.
- Revision có thể điều chỉnh kế hoạch, thêm PO hoặc đánh dấu PO bị hủy.
- Muốn hủy PO có đề xuất đang hoạt động phải chuyển các đề xuất trước.

### 9.3 Trạng thái vận hành

- `planned` — Dự kiến.
- `ordered` — Đã đặt hàng.
- `supplier_confirmed` — Nhà cung cấp đã xác nhận.
- `received` — Đã nhận hàng.
- `cancelled` — Đã hủy.

Khi vận hành, Manager có thể bổ sung số PO thực tế và ngày chính xác. Tháng kế hoạch vẫn được giữ để so sánh.

## 10. Đề xuất nhập hàng

### 10.1 Điều kiện tạo

Người dùng chỉ được tạo đề xuất khi:

- Nhãn hàng/năm có baseline đã duyệt.
- Có ít nhất một PO kế hoạch còn hoạt động.
- Người dùng có `create_purchase_proposal` cho nhãn hàng.

Leader chưa có `view_approved_plan` chỉ thấy phạm vi đủ để tạo đề xuất; không thấy số lượng, giá trị hoặc phân bổ baseline.

### 10.2 Nội dung đề xuất

- Nhãn hàng và năm.
- Tháng cần hàng.
- Lý do.
- Một hoặc nhiều dòng SKU.
- Tổng số đơn vị cần cho từng SKU.

Không nhập Ex Price, giá trị hoặc FOC. FOC là quyết định thương mại ở cấp quản lý/PO.

### 10.3 Gửi và ghép PO

- Bản nháp đề xuất chỉ owner đọc/sửa/xóa.
- Leader gửi đến đúng Manager trực tiếp.
- Leader không chọn PO.
- Manager xem các PO được gợi ý có tháng hàng về không muộn hơn tháng cần hàng.
- Manager phải ghép toàn bộ đề xuất vào đúng một PO.
- Chọn PO đến muộn tạo cảnh báo nhưng được phép.
- Nếu cần chia nhiều PO, Manager yêu cầu người gửi tách thành nhiều đề xuất.

Manager/CEO-BOD tạo đề xuất có thể chọn PO trong quá trình xác nhận của chính họ.

### 10.4 Dung lượng và vượt kế hoạch

Dung lượng PO theo SKU được tính từ tổng lượng kế hoạch `Qty + FOC` trừ phần đã được giữ chỗ/đã duyệt còn hiệu lực.

- So sánh từng dòng đề xuất với dung lượng còn lại của PO.
- Nếu bất kỳ dòng nào vượt, toàn bộ đề xuất bắt buộc duyệt hai cấp.
- Vượt kế hoạch là cảnh báo, không phải lỗi chặn.
- Baseline không bị sửa; phần vượt được ghi nhận riêng.

### 10.5 Giá trị tham chiếu

- Giá trị tham chiếu = tổng `Requested Units × Ex Price` từ baseline đã duyệt.
- Đây là ước tính bảo thủ, giả định toàn bộ số lượng được mua trả tiền.
- FOC quyết định sau không làm tăng actual amount.
- Ex Price, policy, PO, over-plan reason và approvers được snapshot khi Manager ghép PO.

### 10.6 Chính sách duyệt đề xuất

Admin cấu hình cho một hoặc nhiều nhãn hàng:

1. **Bắt buộc hai cấp.**
2. **Theo hạn mức.** Dưới ngưỡng một cấp; đạt/vượt ngưỡng hai cấp.

Mặc định hệ thống là bắt buộc hai cấp. Dù policy cho phép một cấp, đề xuất vượt PO vẫn bắt buộc hai cấp.

### 10.7 Quyết định

- Một cấp: Manager phê duyệt; CEO/BOD trực tiếp nhận thông báo thông tin.
- Hai cấp: Manager duyệt L1; CEO/BOD trực tiếp duyệt L2.
- Manager tự tạo:
  - Một cấp: Manager xác nhận và tự phê duyệt.
  - Hai cấp: Manager tự hoàn tất L1 rồi chuyển CEO/BOD.
- CEO/BOD tự tạo: chọn PO và tự phê duyệt.
- Self-approval phải được audit rõ người tạo và người duyệt là cùng một user.

### 10.8 Vòng đời

- `draft`
- `pending_manager`
- `pending_executive`
- `changes_requested`
- `approved`
- `rejected`
- `withdrawn`
- `cancellation_pending_manager`
- `cancellation_pending_executive`
- `cancelled`

Quy tắc:

- Có thể rút trước phê duyệt cuối; thông báo cho approver hiện tại.
- Yêu cầu chỉnh sửa tạo revision mới và giữ lịch sử.
- Đề xuất đã duyệt không sửa/xóa trực tiếp.
- Hủy đề xuất đã duyệt đi qua cùng tuyến duyệt.
- Chỉ cancellation đã duyệt mới giải phóng dung lượng PO.

### 10.9 Giữ chỗ và đồng thời

- Tại quyết định L1, hệ thống khóa các dòng dung lượng liên quan và tính lại.
- Nếu đề xuất một cấp vừa trở thành over-plan do concurrency, không phê duyệt cuối; tự chuyển sang L2 với L1 đã hoàn tất.
- Đề xuất chờ L2 giữ chỗ dung lượng.
- Reject, withdraw hoặc cancellation đã duyệt giải phóng phần giữ chỗ theo đúng trạng thái.

## 11. Excel mẫu

### 11.1 Vị trí trong sản phẩm

- Không có menu/phân hệ import riêng.
- `Tải file mẫu` và `Nhập từ Excel` nằm trong wizard.
- Excel và nhập tay ghi vào cùng bản nháp và dùng cùng validation.

### 11.2 Workbook

Workbook được tạo sau khi chọn nhãn hàng/năm và gồm hai sheet nghiệp vụ:

1. `Kế hoạch SKU`
   - SKU, tên sản phẩm, Ex Price, Paid Qty, FOC, tồn đầu kỳ.
2. `Phân bổ PO`
   - Mã PO, tháng đặt, tháng hàng về, SKU, Qty, FOC.

Dữ liệu phân bổ dùng dạng từng dòng, không tạo số cột động và không giới hạn số PO.

Workbook có metadata ẩn:

- Template version.
- Schema identifier.
- Brand ID/code.
- Planning year.
- Generated timestamp.

### 11.3 Import

1. Kiểm tra file type/size và đúng template.
2. Parse vào staging, không ghi business tables.
3. Không thực thi macro, external link hoặc công thức.
4. Server tính lại tổng lượng nhận và giá trị.
5. Preview hiển thị lỗi/cảnh báo theo sheet, dòng, cột và hướng sửa bằng tiếng Việt.
6. Hiển thị SKU mới, canonical mapping, tổng Qty/FOC và sai lệch.
7. Chỉ cho xác nhận khi không còn lỗi bắt buộc.
8. Áp dụng nguyên tử và idempotent.

Nếu bản nháp có dữ liệu, không tự merge. Người dùng phải xác nhận thay thế bước SKU và PO. Hệ thống tạo checkpoint trước import để có thể hoàn tác.

Import không được tạo/sửa phiên bản đã gửi duyệt hoặc đã duyệt.

## 12. Dashboard và điều hướng

### 12.1 Điều hướng chính

- Tổng quan.
- Hộp việc duyệt.
- Thông báo.
- Kế hoạch năm.
- Đợt mua.
- Đề xuất nhập hàng.
- Dữ liệu nền — theo capability.
- Quản trị — theo capability.

Menu đang chọn có nền, vạch Champagne Gold và `aria-current`. Menu người dùng không có quyền không được hiển thị.

### 12.2 Quy tắc dashboard

Trong ba giây người dùng phải biết:

1. Việc gì cần xử lý.
2. Kế hoạch đang thực hiện đến đâu.
3. Ngoại lệ/rủi ro nào đáng chú ý.

Dashboard không hiển thị draft của người khác và không dùng pending plan làm baseline.

### 12.3 Nội dung theo vai trò

#### Leader

- Tạo đề xuất.
- Trạng thái đề xuất của chính mình.
- Yêu cầu chỉnh sửa, quyết định và thông báo.
- Baseline chỉ hiển thị khi có `view_approved_plan`.

#### Manager

- Kế hoạch năm được phép tạo/xem.
- Hồ sơ chờ Manager.
- Tiến độ PO.
- Đề xuất của nhóm.
- Phần còn lại/vượt và PO có nguy cơ muộn.

#### CEO/BOD

- Kế hoạch năm và đề xuất chờ L2.
- Danh mục nhãn hàng phụ trách.
- Ngân sách, mức thực hiện, vượt kế hoạch và ngoại lệ lớn.
- Thông báo thông tin cho đề xuất một cấp.

#### Administrator

- Sức khỏe cấu hình tổ chức.
- Tài khoản thiếu quản lý/phạm vi.
- Chính sách duyệt và dữ liệu nền.
- Audit và cảnh báo phân quyền.

## 13. UI/UX và nhận diện

### 13.1 Sagen brand

- Dùng logo Sagen hiện có; loại bỏ tài sản và màu MegaMat.
- Off-white/white cho nền, Charcoal cho chữ, Champagne Gold cho accent.
- Màu status chỉ truyền đạt ý nghĩa: xanh thành công, vàng cảnh báo, đỏ lỗi.
- Không gradient sặc sỡ hoặc shadow dày.

### 13.2 Typography

- Body/UI: Be Vietnam Pro.
- Tiêu đề chọn lọc: Lora.
- Tiêu đề desktop 32–40px; mobile 26–32px.
- Không dùng header quá lớn chiếm phần lớn viewport.
- Bảng, form và navigation dùng sans-serif.

### 13.3 Layout/components

- Khoảng cách section 24–32px.
- Khoảng cách card tối thiểu 16px.
- Card radius 10–12px, border mảnh, shadow nhẹ.
- Không biến mọi nội dung thành card.
- Form có chiều rộng đọc hợp lý; dashboard/ma trận dùng không gian ngang.
- Một primary action nổi bật trên mỗi màn hình.

### 13.4 Bảng và ma trận

- SKU + tên sản phẩm chiếm cột rộng.
- Cột số lượng tự co theo nội dung, căn phải.
- Tên dài ellipsis một dòng; hover và keyboard focus hiển thị đầy đủ.
- Header/cột SKU sticky khi cuộn ma trận PO.
- Mobile chuyển bảng phức tạp thành danh sách theo SKU/PO.

### 13.5 Ngôn ngữ

- Dùng tiếng Việt cho navigation, trạng thái, hành động và lỗi.
- Không dùng `Forecast` làm khái niệm cố định.
- PO, FOC và Ex Price được giải thích ở lần xuất hiện đầu hoặc bằng tooltip.

### 13.6 Accessibility

- Target tương tác tối thiểu 44px.
- Điều hướng bàn phím đầy đủ.
- Dialog có initial focus, focus trap, Escape và focus return.
- Focus indicator rõ.
- Không chỉ dùng màu để truyền đạt trạng thái.
- Hỗ trợ reduced motion.
- Đạt tương phản WCAG AA cho nội dung/chức năng chính.

## 14. Mô hình dữ liệu logic

Tên bảng cuối cùng có thể được tinh chỉnh trong implementation plan, nhưng các boundary và quan hệ dưới đây là bắt buộc.

### 14.1 Tổ chức

- User Profile.
- Organizational Tier.
- Reporting Line.
- User Capability.
- User Brand Permission, gồm direct/inherited/source.

### 14.2 Dữ liệu nền

- Brand.
- Product/SKU.
- SKU Alias/Canonical Mapping.

### 14.3 Kế hoạch

- Planning Cycle — Brand × Year.
- Plan Revision — owner, revision number, status, lock version.
- Annual Plan Line — SKU, price, paid qty, FOC, opening stock.
- Stable Purchase Wave.
- Revision Purchase Wave — month/status snapshot.
- Revision Allocation — revision, wave, SKU, Qty, FOC.

### 14.4 Đề xuất

- Purchase Proposal.
- Proposal Revision.
- Proposal Line.
- Proposal Allocation Snapshot.
- Capacity Reservation.

### 14.5 Kiểm soát

- Approval Policy.
- Approval Case.
- Approval Step.
- Approval Decision.
- Notification Outbox.
- Notification.
- Audit Event.
- Import Session/Preview/Checkpoint.

### 14.6 Constraints bắt buộc

- Mã brand/SKU normalize và unique.
- Số lượng, FOC, tồn kho, giá không âm.
- Amount = Paid Qty × Ex Price.
- Month là kiểu month-level, không giả ngày đầu tháng.
- Một cycle cho Brand × Year.
- Một active plan workflow cho cycle.
- Allocations khớp annual line trước submit.
- Một organizational tier chính/user.
- Reporting line không tạo vòng lặp.
- Active Leader/Manager luôn có supervisor active phù hợp.
- Stable PO có transaction không được hard delete.

## 15. State machines

### 15.1 Plan revision

```text
draft_owner_only
  → pending_executive
  → approved
  → superseded

pending_executive
  → changes_requested
  → draft_owner_only (revision mới)

pending_executive
  → rejected | withdrawn
```

CEO/BOD có thể đi trực tiếp từ `draft_owner_only` sang `approved` trong transaction xác nhận.

### 15.2 Proposal

```text
draft
  → pending_manager
  → approved                    (một cấp)
  → pending_executive
  → approved                    (hai cấp)

pending_*
  → changes_requested | rejected | withdrawn

approved
  → cancellation_pending_manager
  → cancelled                   (một cấp)
  → cancellation_pending_executive
  → cancelled                   (hai cấp)
```

Chuyển trạng thái ngoài state machine bị từ chối ở database command.

## 16. Bảo mật, đồng thời và lỗi

### 16.1 RLS

- Draft: owner only.
- Pending: submitter và exact assigned approver theo mức dữ liệu cần thiết.
- Approved baseline: user có brand/capability phù hợp.
- Admin metadata: chỉ dữ liệu tối thiểu cho governance.
- UPDATE policy luôn có `USING` và `WITH CHECK`.
- User không được tự sửa active status, tier, supervisor hoặc capability.
- Views exposed dùng security-invoker.
- SECURITY DEFINER function bị revoke mặc định và grant tường minh.

### 16.2 Boundary validation

- Payload được validate tại API edge bằng schema typed.
- Database constraints kiểm tra lại invariant.
- Không trả raw SQL, stack trace, secret hoặc record không nằm trong DTO.

### 16.3 Transaction và khóa

Các command sau phải nguyên tử:

- Submit/approve/reject/request changes/withdraw.
- Assign proposal to PO.
- Reserve/release PO capacity.
- Transfer reporting line/pending work.
- Deactivate account with replacement.
- Apply Excel import.

Sử dụng row lock/advisory transaction lock phù hợp để bảo vệ invariant đếm và dung lượng.

### 16.4 Optimistic concurrency

- Draft có lock version.
- Ghi với version cũ trả `409 CONFLICT`.
- UI giữ thay đổi chưa lưu, hiển thị dữ liệu server và cho người dùng chọn cách xử lý.

### 16.5 Error contract

Mọi lỗi API gồm:

- Stable error code.
- Thông báo tiếng Việt.
- Field/row diagnostics nếu có.
- Retryable flag.
- Correlation ID.

### 16.6 Idempotency

- Save, submit, approve, import, cancel đều nhận idempotency key.
- Cùng key + cùng payload trả lại kết quả cũ.
- Cùng key + payload khác trả conflict.

### 16.7 Audit

Audit lưu:

- Actor, action, target.
- Before/after hoặc snapshot cần thiết.
- Business reason.
- Correlation ID.
- Route/policy snapshot.
- Self-approval và over-plan flags.

## 17. Thông báo

Giai đoạn đầu chỉ dùng Notification Center trong ứng dụng.

- Notification outbox được ghi cùng transaction nghiệp vụ.
- Worker/process sau commit chuyển outbox thành notification.
- Notification có unread/read, loại, nội dung tiếng Việt và deep link.
- CEO/BOD nhận thông báo thông tin khi đề xuất một cấp được duyệt.
- CEO/BOD nhận thông báo cần phê duyệt khi tuyến hai cấp.
- Current approver được thông báo khi hồ sơ bị rút.
- Người gửi được thông báo khi yêu cầu sửa, từ chối, duyệt hoặc hủy hoàn tất.

## 18. Xóa dữ liệu cũ và cutover

### 18.1 Giữ lại

- Supabase Auth account `admin@sagen-groupe.com`.
- Hồ sơ/quyền Administrator cần thiết để đăng nhập và cấu hình lại.
- Cấu hình hệ thống không phải dữ liệu demo.
- Schema, migration history và hạ tầng cần cho V2.
- Business rule/configuration đã được duyệt, gồm canonical SKU rule.

Không lưu password hoặc secret trong spec/repository.

### 18.2 Xóa

- Brand/SKU demo cũ.
- Planning cycles, plan versions, plan lines.
- PO waves, allocations và trạng thái demo.
- Approval requests/decisions demo.
- Import staging/history cũ.
- Dashboard-derived business data cũ.
- Audit events chỉ liên quan dữ liệu nghiệp vụ/demo bị xóa, sau khi đã có backup phục hồi.

### 18.3 Trình tự

1. Backup schema/data hiện tại và kiểm tra phục hồi.
2. Tạo V2 schema/module song song.
3. Test tại môi trường an toàn.
4. Xác minh tài khoản/quyền Admin được giữ.
5. Chạy acceptance bằng dữ liệu test mới.
6. Xóa business/demo data đúng danh sách.
7. Chuyển route/navigation sang V2.
8. Loại bỏ module, API, parser và menu Excel cũ.
9. Chạy smoke test production và giữ rollback snapshot.

Không chỉnh schema production bằng thao tác ad-hoc. Mọi thay đổi đi qua migration đã review và thử trước.

## 19. Kiểm thử

### 19.1 Domain/unit

- Amount = Qty × Ex Price.
- Paid Qty/FOC/Total Receipts.
- Allocation equality.
- Year validation.
- Route approval và threshold.
- Over-plan escalation.
- Stable PO rules.
- State machines.
- Canonical SKU mapping.

### 19.2 Database/pgTAP

- RLS matrix cho owner, Leader khác, Manager trực tiếp/không trực tiếp, CEO/BOD trực tiếp/không trực tiếp, Admin và user inactive.
- Draft privacy.
- Direct/inherited brand scope.
- Supervisor invariants và atomic transfer.
- Idempotency.
- Concurrent approval/capacity reservation.
- Không còn active administrator invariant nếu cần bảo vệ quản trị hệ thống.

### 19.3 API contract

- Validation và localized errors.
- 401/403/404/409/422 semantics.
- Idempotency replay/mismatch.
- Optimistic conflict.
- Atomic rollback.
- Correlation ID và audit linkage.

### 19.4 Component/accessibility

- Wizard gate và autosave states.
- Modal focus trap/Escape/focus return.
- Table keyboard interaction.
- SKU truncation + tooltip/focus disclosure.
- Responsive matrix/list transition.
- Sidebar `aria-current`.

### 19.5 E2E với database thật

- Manager tạo kế hoạch tay và gửi CEO/BOD.
- Manager tạo kế hoạch bằng Excel và nhận kết quả tương đương.
- CEO/BOD tạo và tự phê duyệt.
- Draft không lộ cho cấp trên hoặc user khác.
- Leader không thấy baseline nhưng tạo đề xuất.
- Manager ghép PO và duyệt một cấp.
- Over-plan chuyển bắt buộc hai cấp.
- Manager self-approval một/hai cấp.
- Cancellation giải phóng capacity đúng lúc.
- Admin đổi supervisor và hồ sơ chờ chuyển đúng.
- Dashboard chỉ dùng approved baseline.
- Navigation theo role/capability.

Không coi E2E dùng in-memory/mock transport là bằng chứng tích hợp Supabase.

## 20. Tiêu chí nghiệm thu

1. Không tạo kế hoạch cho năm quá khứ.
2. Không thể bỏ qua bước chưa hợp lệ.
3. Không submit khi phân bổ Qty/FOC chưa khớp từng SKU.
4. Draft chỉ owner thấy.
5. Manager plan đến đúng CEO/BOD; CEO/BOD plan tự duyệt.
6. Leader proposal đến đúng Manager.
7. Over-plan luôn cảnh báo và bắt buộc L2.
8. Baseline đã duyệt không bị ghi đè.
9. Stable PO giữ lịch sử qua revision.
10. Excel và nhập tay tạo cùng canonical draft.
11. Dashboard theo role chỉ dùng dữ liệu được phép.
12. Không còn menu/luồng/parser import cũ.
13. Không còn business/demo data cũ sau cutover.
14. UI dùng đúng Sagen, tiếng Việt, responsive và keyboard accessible.
15. Lint, typecheck, unit, database, E2E thật, build và secret scan đều pass trước cutover.

## 21. Quyết định đã chốt

- Chọn kiến trúc V2 trong cùng dự án, không sửa chắp vá và không viết lại toàn bộ.
- Chọn wizard tiến trình ngang toàn trang.
- Chọn tháng làm độ chính xác lịch kế hoạch.
- Baseline bất biến; đề xuất là operational layer riêng.
- Mặc định duyệt hai cấp; policy có thể áp dụng cho một/nhiều brand.
- Over-plan luôn bắt buộc hai cấp nhưng không chặn nghiệp vụ.
- Reporting line xác định exact approver.
- Draft chỉ owner thấy.
- Excel template hỗ trợ cả SKU năm và phân bổ PO.
- Xóa business/demo data cũ; giữ Admin và cấu hình hệ thống.
- Dashboard theo vai trò và thiết kế Sagen.

## 22. Không còn câu hỏi mở

Thiết kế này không còn chỗ trống nghiệp vụ. Mọi quyết định cần thiết để chuyển sang lập kế hoạch triển khai đã được xác định. Chi tiết tên bảng, endpoint và thứ tự migration sẽ được khóa trong kế hoạch triển khai, nhưng không được thay đổi các boundary, invariant và acceptance criteria của tài liệu này.
