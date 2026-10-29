p = '/home/user/ssochuz/src/cz.css'
s = open(p, encoding='utf-8').read()


def rep(old, new, n=1):
    global s
    assert s.count(old) == n, 'COUNT %d -> %d: %s' % (s.count(old), n, old[:80])
    s = s.replace(old, new, n)


rep("""   --cover-w: clamp(196px, 22.5vw, 292px);   /* bìa TO thêm ~15% nữa */
  --fan-unit: calc(var(--cover-w) * .42);   /* khoảng xoè suy ra từ bề rộng bìa */""",
    """   --cover-w: clamp(196px, 22.5vw, 292px);   /* bìa TO thêm ~15% nữa */
  --fan-unit: calc(var(--cover-w) * .42);   /* khoảng xoè suy ra từ bề rộng bìa */
  /* Tâm dọc của quạt, tính theo chiều cao khung quạt. Trước đây là 52%: đo ở
     1440px thì đáy bìa chỉ cách đáy banner 40px trong khi đỉnh bìa cách đỉnh
     67px, nên cả "sạp bìa" trông dồn xuống dưới. 49,5% nhấc quạt lên ~13px và
     hai khoảng thở gần bằng nhau (≈53px cả trên lẫn dưới). Đây là biến DUY NHẤT
     dùng cho cả bìa lẫn bóng đổ, nên quạt và "nền đất" không bao giờ lệch nhau;
     muốn nhấc cao/thấp thêm chỉ cần đổi đúng tỉ lệ này. */
  --fan-cy: 49.5%;""")

rep("  top: calc(52% + var(--cover-w) * .75 - 8px);",
    "  top: calc(var(--fan-cy) + var(--cover-w) * .75 - 8px);")
rep("  position: absolute; left: 50%; top: 52%;",
    "  position: absolute; left: 50%; top: var(--fan-cy);")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
