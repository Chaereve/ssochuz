# Mockup · Nhãn trên bìa — vòng 6

`node docs/mockups/story-v6/gen.mjs` → `index.html`

Bạn chọn **D · nhãn trên bìa**. Vì trang thật đã có:
- **bookmark “MỚI”** dải đỏ góc **trên phải** bìa (`.nw-bookmark`, 20×52),
- badge **18+** trước đây ở góc **trên trái** bìa (`.shero .cover .b18`),

nên cả trạng thái lẫn 18+ đều dời xuống **nửa dưới bìa** — bốn cách bày, cùng một nguyên tắc
“không chồng lên băng rôn”.

| Mã | Cách | Ưu | Nhược |
|---|---|---|---|
| **D1** | Dải chân bìa: dải tối dần ở đáy, ● Hoàn thành trái · 18+ phải | sạch, đọc được trên mọi bìa | chữ nhỏ, không có “chất” riêng |
| **D2** | Kính mờ: dải blur nền bìa, 18+ đóng khung 1px | sang, tách khỏi ảnh mà không cần nền đặc | backdrop-filter có thể không chạy trên vài máy |
| **D3** | Chú thích dưới bìa: nhãn in ra ngoài, bìa sạch tuyệt đối | bìa nào cũng hợp, kể cả bìa sáng | nhãn rời khỏi bìa |
| **D4** | Gáy bìa: trạng thái chạy dọc mép trái, 18+ góc dưới phải | đẹp chất sách | chữ dọc khó đọc |

Nhãn dùng chấm màu + chữ mono in hoa, **không viền, không nền thuốc**.
Kiểm tra ảnh chụp ở 1216px và 390px (mobile: nhãn thu về 6,8px, 18+ thành chữ thường).
