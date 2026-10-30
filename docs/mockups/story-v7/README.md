# Mockup · Nhãn ở đáy bìa — vòng 7

`node docs/mockups/story-v7/gen.mjs` → `index.html`

D1 (vòng 6) bị chìm vì: dải **gradient mỏng** + chữ **8,5px màu nhạt** ⇒ trên bìa sáng là mất.
Bốn cách sửa, cùng chỗ đặt (nửa dưới bìa, chừa băng rôn MỚI góc trên phải):

| Mã | Cách | Ưu | Nhược |
|---|---|---|---|
| **1** | Dải đen đặc #0b0806, cao 30px, chữ trắng 9,5px + chấm màu phát sáng; 18+ khung trắng | chắc chắn đọc được trên mọi bìa | trông như thanh thông tin của app |
| **2** | Như 1 + **gờ son 2px** ở cạnh trên | nối màu băng rôn MỚI, dải không bị “dán” lên ảnh | — |
| **3** | **Hai viên nền đen đặc**, viền sáng mảnh, bo 5px; 18+ **nền trắng chữ đen** | bìa không bị cắt ngang, gọn nhất | hai nhãn rời rạc hơn |
| **4** | Cả dải đáy bìa tô **son #9d3348**, chữ trắng | nổi nhất, cùng họ màu băng rôn | nặng, át màu ảnh bìa |

Kiểm tra ảnh chụp 1216px + 390px (mobile: dải 24px, chữ 7,5px, nhãn `nowrap`).
