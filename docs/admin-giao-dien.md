# Admin — hợp đồng nguyên tố (D1)

Lớp giao diện quản trị (`src/admin/styles/admin.css`) dùng **một** bộ nguyên tố cho mọi
màn. Thêm màn mới thì lấy đúng các mục dưới đây, không đẻ biến thể riêng.

| Nguyên tố | Quy tắc |
|---|---|
| Nút | Nút viền là mặc định (trỏ vào chỉ đổi nền, không nhấc nút, không bóng). `.pri` nền mực cho việc chính. `.ghost` cho hành động phụ. `.danger` nền đỏ mờ 12% + chữ đỏ, luôn hiện rõ. Cao 40/44px bo 12px; nút nhỏ trong bảng 32px bo 8px. |
| Badge | Pill nền nhạt + chấm 6px cùng tông. Bốn tông: xám (chờ), `.tone-ok` (đang ổn), `.tone-amber`/`.tone-soon` (cần chú ý), `.tone-bad` (dừng/lỗi). `.tone-violet` = "đang chờ lên sóng" dùng tông nhấn. |
| Ô nhập | Cao 44px ở màn hẹp, 40px từ 640px; viền `--bd2`, bo 12px. Focus = viền `--acc` + quầng 3px. `<select>` luôn là select thật để giữ hành vi bàn phím. |
| Card | Nền `--surf`, viền tóc 1px `--bd`, bo 16px, **không bóng**. Chỉ lớp nổi mới có bóng. |
| Dòng | 40px trong sidebar, 44–52px trong bảng. Trỏ vào đổi nền nhạt; mục đang chọn dùng `--surf2` + chữ đậm hơn (không tô màu nhấn). |
| Lớp nổi | Dropdown/menu: bo 16px, mục 40px, bóng `--a-pop-shadow`. Vào 500ms / ra 350ms, `cubic-bezier(.32,.72,0,1)`. |
| Trạng thái rỗng | Một dòng chữ mờ canh giữa; chỉ màn chính của app khi chưa có gì mới có nút tạo. Khung chờ giữ đúng hình dạng dòng thật (dùng `.skel` của `cz.css`). |

Bốn quy ước còn lại:

1. **Một màu nhấn** (`--acc`) cho nút, link và trạng thái đang bật. Mục điều hướng đang
   chọn dùng nền, không dùng màu nhấn.
2. **Hai vai viền**: `--bd` là viền trang trí (card, khung, đường chia), `--bd2` là viền
   chức năng (ô nhập, nút viền, đường kẻ ngang của khung app).
3. **Không vòng focus** trên nút/link/tab/chip/dòng — chỉ ô nhập có quầng focus.
4. **Chuyển động chỉ trên `transform` và `opacity`.** Không nhấc nút, không đổi bóng,
   không phóng to khi trỏ.

Màu và bo góc đều lấy từ token của dự án trong `src/cz.css` (`--bg/--surf/--txt/--mut/--acc/--bd/--bd2`),
dark mode dùng `[data-theme="dark"]` có sẵn.
