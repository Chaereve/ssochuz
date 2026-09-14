# -*- coding: utf-8 -*-
"""Soát dữ liệu truyện: chỉ tin dữ liệu thật, không có số tự đặt.

Cách dùng:
    python3 tools/audit_data.py                 # in báo cáo ra màn hình
    python3 tools/audit_data.py --md BAO-CAO.md # ghi ra file markdown

Kiểm tra:
  1. registry.json  ↔  data/book/*.json      (số chương khai báo vs số chương thật)
  2. registry.json  ↔  thẻ truyện Blogger    (nếu có _work/cards_full.json hoặc _inbox/*)
  3. tình trạng "Sắp ra mắt" phải đi kèm 0 chương (khoá đọc)
  4. không được có khoá số liệu tự đặt (views/votes/reads/trending…) trong dữ liệu
  5. countLabel phải khớp với số chương thật
  6. tiêu đề chương lặp lại — tách 2 loại: đăng trùng thật (giống cả nội dung, xoá 1 bản)
     và đặt tên nhầm (khác nội dung, chỉ đổi tiêu đề; xem số chương bị nhảy để biết tên đúng)
"""
import argparse, html as html_mod, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARD_CANDIDATES = [
    os.path.join(ROOT, '_work/cards_full.json'),
    os.path.join(ROOT, '_inbox/cards_full.json'),
]
FAKE_KEYS = ('views', 'votes', 'reads', 'viewCount', 'voteCount', 'trendingScore', 'hot', 'rank', 'fakeViews')


def load(p, default=None):
    try:
        with io.open(p, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def label_matches(label, total):
    """Nhãn trên thẻ Blogger có 2 kiểu: 'x/y' với y = tổng số chương, hoặc y = tổng dự kiến
       (khi đó x = số chương đã đăng). Khớp nếu một trong hai con số đúng bằng số chương thật."""
    parts = str(label or '').split('/')
    nums = [p.strip() for p in parts if p.strip().isdigit()]
    return any(int(x) == total for x in nums)


def chapter_mix(chapters):
    """Đếm chương theo cách gọi tên thật trên blogspot:
       Lời Mở Đầu / Chương 0 / chương đánh số / Ngoại truyện.
       Nhãn 'x/y' trên thẻ Blogger chỉ đếm phần chương đánh số, nên hay lệch với
       tổng số chương đọc được — hàm này giúp giải thích chứ không đoán."""
    pro = c0 = nx = 0
    nums = []
    for c in chapters:
        t = (c.get('t') or '').strip()
        if re.match(r'^(lời mở đầu|lời nói đầu|giới thiệu|phi lộ|dẫn nhập)', t, re.I):
            pro += 1
        elif re.match(r'^chương\s*0\b', t, re.I):
            c0 += 1
        elif re.search(r'ngoại truyện|phiên ngoại|side story', t, re.I):
            nx += 1                       # ngoại truyện đếm riêng, không gộp vào số chương
        else:
            m = re.match(r'^chương\s*(\d+)', t, re.I)
            if m:
                nums.append(int(m.group(1)))
            else:
                pro += 1
    return {'total': len(chapters), 'prologue': pro, 'chapter0': c0, 'extras': nx,
            'numbered': len(nums), 'maxNumbered': max(nums) if nums else 0}


def norm(t):
    t = str(t or '').lower().replace('²', '2')
    t = re.sub(r'\(.*?\)', ' ', t)
    return re.sub(r'[^a-z0-9]', '', t)


def text_of(html):
    """Bản đảo chữ của chương: bỏ style/script + thẻ, mở entity, bỏ dấu câu rồi mới so.
       Giống `chapWords()` trong admin.js — hai bản cùng chữ nhưng khác cách bọc thẻ
       (<p> vs <div>) phải được tính là giống nhau, không được đoán là đăng trùng."""
    t = re.sub(r'<style.*?</style>|<script.*?</script>', ' ', str(html or ''), flags=re.S | re.I)
    t = html_mod.unescape(re.sub(r'<[^>]+>', ' ', t)).lower()
    t = re.sub(r'[^a-z0-9\u00c0-\u1eff\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def dup_groups(chapters):
    """Nhóm những chương trùng tiêu đề. Hai bệnh ngược nhau, không được gộp làm một:
       · same=True  -> trùng cả tên lẫn chữ => chương bị ĐĂNG TRÙNG 2 lần, phải xoá 1 bản;
       · same=False -> chỉ trùng mỗi tên, chữ khác nhau => chương bị đặt nhầm tên/nhầm số
         (xoá là mất 1 chương thật — chỉ được sửa tiêu đề).
       Trả về [{'t', 'at': [số thứ tự 1-based], 'same', 'countable'}] — giống dupGroups() trong admin.js."""
    by, order = {}, []
    for i, c in enumerate(chapters):
        raw = re.sub(r'\s+', ' ', str(c.get('t') or '')).strip()
        if not raw:
            continue
        k = raw.lower()
        if k not in by:
            by[k] = {'t': raw, 'at': [], 'word': []}
            order.append(k)
        by[k]['at'].append(i + 1)
        by[k]['word'].append(text_of(c.get('html')))
    out = []
    for k in order:
        g = by[k]
        if len(g['at']) < 2:
            continue
        word = [b for b in g.pop('word') if b]
        g['same'] = len(word) > 1 and all(b == word[0] for b in word)
        g['countable'] = len(word) > 1      # 2 chương rỗng thì chưa đủ căn cứ để kết luận
        out.append(g)
    return out


def chapter_gaps(chapters):
    """Số chương bị nhảy (có 'Chương 5' và 'Chương 7' mà thiếu 6) — bằng chứng của ca đặt tên nhầm."""
    have = set()
    for c in chapters:
        m = re.match(r'^\s*(?:chương|chuong)\s*(\d+)', str(c.get('t') or ''), re.I)
        if m:
            have.add(int(m.group(1)))
    if len(have) < 2:
        return []
    return [i for i in range(min(have), max(have) + 1) if i not in have]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--md', help='ghi báo cáo ra file markdown')
    a = ap.parse_args()

    reg = load(os.path.join(ROOT, 'data/registry.json')) or {}
    lib = reg.get('lib') or []
    cards = []
    for c in CARD_CANDIDATES:
        cards = load(c) or []
        if cards:
            break
    # ghép thẻ Blogger ↔ truyện: ưu tiên khớp y nguyên tên, chỉ bỏ phần trong ngoặc khi không trùng
    def norm_full(t):
        return re.sub(r'[^a-z0-9]', '', str(t or '').lower().replace('²', '2'))
    by_card, seen = {}, {}
    for c in cards:
        by_card[norm_full(c.get('title'))] = c
        seen[norm_full(c.get('title'))] = seen.get(norm_full(c.get('title')), 0) + 1
    loose = {}
    for c in cards:
        k = norm(c.get('title'))
        loose.setdefault(k, []).append(c)
    by_card.update({k: v[0] for k, v in loose.items() if len(v) == 1 and k not in by_card})

    problems, notes, titlefix = [], [], []
    tot_ch = 0
    for n in lib:
        slug = n.get('slug')
        p = os.path.join(ROOT, 'data/book', slug + '.json')
        if not os.path.exists(p):
            problems.append('Thiếu file chương: data/book/%s.json' % slug)
            continue
        b = load(p) or {}
        chs = b.get('chapters') or []
        tot_ch += len(chs)
        if len(chs) != (n.get('chapters') or 0):
            problems.append('Lệch số chương %s: khai %s – thật %s' % (slug, n.get('chapters'), len(chs)))
        empty = [c for c in chs if not (c.get('html') or '').strip()]
        if empty:
            problems.append('%s có %d chương rỗng nội dung' % (slug, len(empty)))
        # tiêu đề chương lặp lại: 2 bệnh khác nhau, xử lý ngược nhau (1 xoá, 1 giữ)
        for g in dup_groups(chs):
            at = '#' + ', #'.join(str(i) for i in g['at'])
            if g['same']:
                problems.append('%s: chương %s trùng cả tiêu đề lẫn nội dung ("%s") — đăng trùng thật, '
                                'xoá 1 bản rồi đếm lại' % (slug, at, g['t']))
            else:
                gp = chapter_gaps(chs)
                why = ('dãy chương nhảy số, thiếu Chương %s → bản sau (#%s) chính là Chương %s, chỉ đổi tiêu đề'
                       % (', '.join(str(x) for x in gp), g['at'][-1], gp[0])) if gp else \
                      'chữ của 2 bản khác nhau nên không phải đăng trùng — chỉ là đặt trùng tên'
                titlefix.append('**%s** (`%s`) — chương %s cùng tên `%s`; %s'
                                % (n.get('title'), slug, at, g['t'], why))
        if not chs and (n.get('status') or '') == 'Hoàn thành':
            problems.append('%s: 0 chương nhưng ghi "Hoàn thành"' % slug)
        if chs and (n.get('status') or '') == 'Sắp ra mắt':
            problems.append('%s: đã có %d chương nhưng còn ghi "Sắp ra mắt"' % (slug, len(chs)))
        lab = str(n.get('countLabel') or '')
        if lab and lab.split('/')[0].strip() not in ('—', '-') and lab.split('/')[0].strip() != str(len(chs)):
            problems.append('countLabel lệch %s: "%s" vs %d chương thật' % (slug, lab, len(chs)))
        # dữ liệu không được chứa số liệu tự đặt
        bad = [k for k in n if k in FAKE_KEYS]
        if bad:
            problems.append('%s có khoá số liệu tự đặt: %s' % (slug, ', '.join(bad)))
        # so với thẻ truyện trên blogspot (nếu có)
        c = (by_card.get(norm_full(n.get('title'))) or by_card.get(norm(n.get('title'))))
        if c:
            mx = chapter_mix(chs)
            lab = str(c.get('count') or '')
            if not label_matches(lab, mx['total']):
                notes.append('**%s** — thẻ Blogger ghi `%s`, dữ liệu có **%d chương thật** '
                             '(%d Lời Mở Đầu/Chương 0 + %d chương đánh số + %d Ngoại truyện). '
                             '%s'
                             % (n.get('title'), lab or '—', mx['total'],
                                mx['prologue'] + mx['chapter0'], mx['numbered'], mx['extras'],
                                'Lệch do cách đếm của thẻ cũ.' if mx['numbered'] else 'Thẻ cũ hơn dữ liệu hiện có.'))
            if (c.get('status') or '') != (n.get('status') or ''):
                notes.append('**%s** — tình trạng: thẻ ghi "%s", trang truyện hiển thị "%s" (bản gốc lưu ở `statusRaw`).'
                             % (n.get('title'), c.get('status'), n.get('status')))
    n0 = sum(1 for n in lib if not (n.get('chapters') or 0))
    rep = []
    rep.append('# Soát dữ liệu truyện — chuseoz\n')
    rep.append('Chạy bằng `python3 tools/audit_data.py` · rev dữ liệu: `%s` · nguồn: %s\n'
               % (reg.get('rev'), (reg.get('source') or {}).get('note', '')))
    rep.append('| Mục | Số |\n|---|---|')
    rep.append('| Số bộ trong thư viện | %d |' % len(lib))
    rep.append('| Thẻ truyện đối chiếu được từ Blogger | %d |' % len([n for n in lib if (by_card.get(norm_full(n.get('title'))) or by_card.get(norm(n.get('title'))))]))
    rep.append('| Tổng chương có nội dung thật | %d |' % tot_ch)
    rep.append('| Bộ chưa có chương (khoá đọc) | %d |' % n0)
    rep.append('| Số bộ trong bảng xếp hạng dùng số tự đặt | 0 |')
    rep.append('| Tiêu đề chương lặp cần đổi tên | %d |' % len(titlefix))
    rep.append('| Lỗi cần sửa | %d |' % len(problems))
    rep.append('')
    rep.append('## Lỗi\n')
    rep.append('\n'.join('- %s' % x for x in problems) if problems else 'Không có lỗi nào.')
    rep.append('')
    rep.append('## Tiêu đề chương bị lặp (KHÔNG xoá — chỉ sửa tên)\n')
    rep.append('\n'.join('- %s' % x for x in titlefix) if titlefix
               else 'Không có bộ nào lặp tiêu đề chương.')
    rep.append('')
    rep.append('## Chênh lệch giữa thẻ Blogger (cũ) và trang truyện (đang dùng)\n')
    rep.append('\n'.join('- %s' % x for x in notes) if notes else 'Không có chênh lệch.')
    rep.append('')
    rep.append('## Cách đếm chương (vì sao nhãn trên thẻ Blogger hay lệch với số chương đọc được)\n')
    rep.append('| Truyện | Thẻ Blogger | Tổng chương | Lời Mở Đầu / Chương 0 | Chương đánh số | Ngoại truyện |')
    rep.append('|---|---|---|---|---|---|')
    shown = 0
    for n in lib:
        c = by_card.get(norm_full(n.get('title'))) or by_card.get(norm(n.get('title')))
        if not c:
            continue
        p2 = os.path.join(ROOT, 'data/book', (n.get('slug') or '') + '.json')
        if not os.path.exists(p2):
            continue
        mx = chapter_mix((load(p2) or {}).get('chapters') or [])
        lab = str(c.get('count') or '')
        if label_matches(lab, mx['total']):
            continue                       # khớp số chương thì không cần kể ra
        rep.append('| %s | %s | %d | %d | %d | %d |' % (n.get('title'), lab or '—', mx['total'],
                                                        mx['prologue'] + mx['chapter0'], mx['numbered'], mx['extras']))
        shown += 1
    if not shown:
        rep.append('| (không có bộ nào lệch) | | | | | |')
    rep.append('')
    rep.append('> Nguyên tắc: số liệu đọc/bình chọn **chỉ** lấy từ Worker KV (`/api/stats` — Worker tự đếm).\n'
               '> Khi chưa có số thì web không hiện số nào và ghi rõ lý do, không ước lượng.\n')
    out = '\n'.join(rep)
    print(out)
    if a.md:
        with io.open(a.md, 'w', encoding='utf-8') as f:
            f.write(out)
        print('\n(đã ghi %s)' % a.md)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
