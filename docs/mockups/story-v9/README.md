# Mockup · Badge trên bìa — vòng 9 (chốt D1, chỉ sửa badge)

`node docs/mockups/story-v9/gen.mjs` → `index.html`

Giữ **D1 vòng 6**: dải mờ ở đáy bìa, trạng thái bên trái, 18+ bên phải. Không đổi bố cục.
Chỉ sửa phần chữ của badge để không chìm trên bìa sáng:

- dải mờ **đậm hơn và thấp hơn** (46% chiều cao, đặc 95% ở đáy, tan hết ở đỉnh) — không còn cắt ngang poster;
- chữ **9,5px trắng** (trước là màu nhạt 8,5px), giãn chữ .16em, bóng chữ dày;
- **chấm màu phát sáng** (box-shadow cùng màu) thay chấm phẳng;
- 18+ **sáng hơn** (trắng 82%) thay vì xám mờ.

Ba bản chỉ khác cách trình bày chữ:

| Mã | Cách | Ghi chú |
|---|---|---|
| **B1** | chữ trắng + chấm phát sáng, **18+ để trơn** | gần D1 nhất, ít thay đổi nhất |
| **B2** | như B1, **18+ trên ô giấy** (chữ mực) | nổi rõ, ăn hệ màu giấy của web |
| **B3** | **chỉ chữ + gạch chân mảnh**, 18+ ngăn bằng dấu chấm | sạch nhất, mất tín hiệu màu |

Lưu ý kỹ thuật: mock2.css có class `.sc` (nhãn góc thẻ) đè lên scrim của mockup → dải mờ bị
đẩy lên đỉnh bìa. Đã đổi tên thành `.cvShade`. Trên trang thật không có xung đột này
(`cz.css` không có `.sc`), nhưng ghi lại để khỏi lặp lại khi làm mockup.
