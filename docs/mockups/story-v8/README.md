# Mockup · Chân bìa — vòng 8

`node docs/mockups/story-v8/gen.mjs` → `index.html`

Vòng 7 (D1) bị **chìm** vì chữ đặt thẳng trên ảnh bìa sáng. Vòng 8 đổi **nền của nhãn**:

| Mã | Nền nhãn | Đặc điểm |
|---|---|---|
| **A** | Chân bìa **đặc 27px nằm ngoài ảnh** (bìa bo góc trên, chân nối liền) | không che ảnh, tương phản tuyệt đối |
| **B** | Thanh đặc **tràn viền trong bìa** 28px, bóng hắt lên ảnh | gọn chiều cao nhất |
| **C** | **Kính mờ 30px** + kẻ sáng 1px, 18+ đóng khung | đẹp nhất, cần `backdrop-filter` |

Nhãn vẫn ở đáy bìa (trạng thái trái · 18+ phải), vẫn tránh băng rôn “MỚI” góc trên phải.
Chữ 8,5–9px mono in hoa, chấm màu phát sáng; mobile thu về 6,6px, chân bìa 22px.
