# -*- coding: utf-8 -*-
"""Dựng lại data/registry.json từ dữ liệu THẬT của chuseoz.blogspot.com.

Nguồn (đều là dữ liệu thật lấy từ blog, không sinh thêm số):
  * /p/list-novel.html            -> card: tác giả, cặp, series, năm, 18+, bìa, số chương hiển thị
  * feeds/pages/default (64 trang)-> "Tình trạng", mô tả (syn), ngày cập nhật, ảnh bìa
  * feeds/posts/summary (45 bài)  -> postId thật, ngày đăng/ngày cập nhật, URL bài
  * từng bài viết                 -> SỐ CHƯƠNG THẬT (đếm .chapter-page)
  * /p/lich-ra-chuong.html        -> lịch ra chương thật
  * data/book/<slug>.json         -> nội dung chương (đã đối chiếu khớp bài thật)

Cách dùng:  python3 tools/sync_blogger.py --pages pages.json --posts posts.json \
              --postdetails details.json --cards cards.json --registry data/registry.json
"""
import argparse, datetime, html as H, json, os, re, unicodedata


# ---------------------------------------------------------------- tiện ích
def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save(path, obj):
    # indent=2 + xuống dòng cuối tệp: đúng dạng data/registry.json đang nằm trong
    # kho, để mỗi lần sync diff chỉ ra đúng những trường đổi, không xới cả tệp
    with open(path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')


def save_book(path, obj):
    """Tệp chương đang nằm ở dạng nén một dòng — ghi lại đúng dạng đó để diff không nổ."""
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def book_with_syn(bk, full):
    """Chèn synFull ngay sau couple, trước mảng chapters — trường nhỏ không bị
    đẩy xuống cuối tệp 400 KB, và thứ tự khoá vẫn ổn định giữa các lần sync."""
    if bk.get('synFull') == full:
        return bk
    out = {}
    for k in ('title', 'slug', 'author', 'couple'):
        if k in bk:
            out[k] = bk[k]
    out['synFull'] = full
    for k, v in bk.items():
        if k not in out and k != 'synFull':
            out[k] = v
    return out


def norm_key(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    s = s.replace('\u0111', 'd').replace('\u0110', 'D')
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()


def clean(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip()


def slug_of(url):
    return (url or '').rstrip('/').split('/')[-1][:-5] if (url or '').endswith('.html') \
        else (url or '').rstrip('/').split('/')[-1]


def page_text(content_html):
    t = re.sub(r'<style.*?</style>|<script.*?</script>', ' ', content_html, flags=re.S)
    t = H.unescape(re.sub(r'<[^>]+>', ' ', t))
    return re.sub(r'\s+', ' ', t).strip()


# ---------------------------------------------------------------- dữ liệu vào
def read_pages(path):
    """feed pages -> {url: {title, text, html, published, updated, img}} + {norm_title: url}"""
    feed = load(path)['feed']
    by_url, by_title = {}, {}
    for e in feed.get('entry', []):
        url = next((l['href'] for l in e.get('link', []) if l.get('rel') == 'alternate'), '')
        content = e['content']['$t']
        rec = {
            'title': clean(e['title']['$t']),
            'url': url,
            'text': page_text(content),
            'html': content,          # giữ HTML thô: mô tả đầy đủ cần ranh giới các <p>
            'published': e['published']['$t'][:10],
            'updated': e['updated']['$t'][:10],
            'img': (re.findall(r'<img[^>]+src="([^"]+)"', content) or [''])[0],
        }
        by_url[url] = rec
        by_title.setdefault(norm_key(rec['title']), rec)
    return by_url, by_title


def read_posts(path):
    """feed posts summary -> {slug: {postId, url, published, updated, title}}"""
    out = {}
    for e in load(path):
        slug = slug_of(e['url'])
        out[slug] = dict(postId=e.get('postId') or '', url=e['url'],
                         published=(e.get('published') or '')[:10],
                         updated=(e.get('updated') or e.get('published') or '')[:10],
                         title=e['title'])
    return out


def read_details(path):
    """post details -> {url: {chaps, titles}}"""
    return {u.rstrip('/'): v for u, v in load(path).items()}


def read_cards(path):
    out = {}
    for c in load(path):
        c = dict(c)
        for k in ('title', 'author', 'couple', 'thumb', 'status', 'count'):
            if isinstance(c.get(k), str):
                prev = None
                while prev != c[k]:          # bỏ &amp;amp; -> &amp; -> &
                    prev, c[k] = c[k], H.unescape(c[k])
        out[slug_of(c['url'])] = c
    return out


# ---------------------------------------------------------------- chuẩn hoá
STATUS_MAP = {
    'hoan thanh': 'Hoàn thành',
    'hoàn thành': 'Hoàn thành',
    'sap ra mat': 'Sắp ra mắt',
    'đang tiến hành': 'Đang cập nhật',
    'đang cập nhật': 'Đang cập nhật',
    'sap dich': 'Sắp ra mắt',
}
BOOK_ALIAS = {'snake-fish': 'snake2-fish2', 'the-fire-4-elements': 'the-fire',
              'snake2-fish2': 'snake2-fish2'}


def canon_status(raw):
    if not raw:
        return None
    return STATUS_MAP.get(norm_key(raw), STATUS_MAP.get(raw.lower()))


def syn_from_page(text):
    m = re.search(r'Tác giả:\s*(.*)$', text)
    body = clean(m.group(1) if m else text)
    body = re.sub(r'^(18\+)?\s*', '', body).strip()
    body = re.split(r'\s(?:Chương|Đọc|Xem)\s', body)[0]
    body = re.sub(r'\s*[|·]\s*$', '', body)
    return body


# ---------------------------------------------------------------- mô tả đầy đủ
PARA_BREAK = re.compile(r'</p\s*>|<br\s*/?>|</div\s*>|</h[1-6]\s*>|</li\s*>', re.I)
JUNK_LINE = re.compile(r'^(Chương|Đọc tiếp|Xem thêm|Truyện|Nguồn|Thể loại|Couple|Tình trạng|'
                       r'Tên khác|Số chương|Cập nhật|Tác giả)\b', re.I)
STOP_LINE = re.compile(r'^(Danh sách( các)? chương|Mục lục|Chương \d|List chapter)\b', re.I)
# chỉ lột emoji/dấu đầu dòng — cố ý KHÔNG gồm dải \u2000-\u206f vì dải đó chứa cả
# ‘ ’ “ ” —, mà mô tả ở đây mở đầu đoạn bằng ngoặc kép/gạch ngang rất nhiều
LEAD_JUNK = re.compile(r'^[\s\u00a0\u2022\u2023\u25aa\u25cf\u2600-\u27bf\ufe0f'
                       r'\U0001f000-\U0001faff]+')


def syn_full_from_page(content_html):
    """MÔ TẢ ĐẦY ĐỦ, giữ ranh giới đoạn bằng một dòng trống.

    Bản cũ chỉ lấy `syn_from_page()` rồi cắt `[:300]`: 61/62 bộ bị mất chữ, tổng
    cộng ~45.000 ký tự nội dung thật bị vứt đi, mà câu thì đứt ngang giữa chừng.
    Trang giới thiệu trên Blogger có dạng:
        <b>Tình trạng:</b> … <b>Tác giả:</b> …
        <div style="margin-top:20px"><p>đoạn 1</p><p>đoạn 2</p>…
        📚 DANH SÁCH CHƯƠNG <a class="chapter-link">Chương 1</a> …
    nên cắt từ sau khối "Tác giả:" tới trước danh sách chương, đổi thẻ đóng đoạn /
    ngắt dòng thành \\n, rồi rửa từng dòng.
    """
    t = str(content_html or '')
    m = re.search(r'Tác giả:.*?</div>', t, re.S | re.I)
    body = t[m.end():] if m else t
    a = re.search(r'<a\b[^>]*class="[^"]*chapter-link', body, re.I) \
        or re.search(r'<a\b[^>]*href="[^"]*#page-', body, re.I)
    if a:
        body = body[:a.start()]
    body = re.sub(r'<style.*?</style>|<script.*?</script>', ' ', body, flags=re.S | re.I)
    body = PARA_BREAK.sub('\n', body)
    body = H.unescape(re.sub(r'<[^>]+>', ' ', body))
    out = []
    for line in body.split('\n'):
        s = LEAD_JUNK.sub('', re.sub(r'\s+', ' ', line).replace('\u00a0', ' ')).strip()
        s = re.sub(r'^18\+\s*', '', s).strip()
        s = re.split(r'\s(?:Chương|Đọc|Xem)\s', s)[0]
        s = re.sub(r'\s*[|·]\s*$', '', s).strip()
        if not s or len(s) < 2:
            continue
        # tới tiêu đề danh sách chương là hết mô tả thật — dừng hẳn, phần sau là
        # tên từng chương, để lẫn vào sẽ thành một đống chữ vô nghĩa
        if STOP_LINE.match(s):
            break
        if JUNK_LINE.match(s):
            continue
        out.append(s)
    return '\n\n'.join(out)


def syn_teaser(text, limit=200):
    """Câu mở đầu để dùng ở thẻ/trang chủ/thẻ meta — không xé đôi một từ.

    Ưu tiên khép ở dấu chấm câu; không có chỗ khép tử tế thì mới cắt ở khoảng
    trắng và thêm dấu ba chấm.
    """
    s = re.sub(r'\s+', ' ', str(text or '')).strip()
    if len(s) <= limit:
        return s
    head = s[:limit]
    m = max(head.rfind('.'), head.rfind('!'), head.rfind('?'))
    if m >= int(limit * 0.55):
        return s[:m + 1].strip()
    return head.rsplit(' ', 1)[0].rstrip(' ,;:·|-') + '…'



def parse_schedule(text):
    """'Thứ 2, 3: Third Person  Thứ 4, 5: ...' -> [{days, title}]"""
    items = []
    for m in re.finditer(r'(Thứ[^:]{0,20}):\s*(.+?)(?=\s*Thứ\s|\s*Lịch có thể|$)', text):
        days, titles = clean(m.group(1)), clean(m.group(2))
        for t in re.split(r'\s{2,}|,\s*$', titles):
            t = clean(t)
            if len(t) > 2:
                items.append({'days': days, 'title': t})
    return items


# ---------------------------------------------------------------- chạy
def build(pages_path, posts_path, details_path, cards_path, registry_path, books_dir,
          out_path, report_path):
    pages_by_url, pages_by_title = read_pages(pages_path)
    posts = read_posts(posts_path)
    details = read_details(details_path)
    cards = read_cards(cards_path)
    reg = load(registry_path)

    books = {}
    for fn in os.listdir(books_dir):
        if fn.endswith('.json'):
            books[fn[:-5]] = load(os.path.join(books_dir, fn))

    # sách thật đọc được từ bài viết: {slug-book: số chương}
    real_chaps = {}
    for url, v in details.items():
        slug = slug_of(url + '.html') if not url.endswith('.html') else slug_of(url)
        real_chaps[BOOK_ALIAS.get(slug, slug)] = v['chaps']

    rows, changes = [], []
    new_lib = []
    dirty_books = {}      # slug -> tệp chương đã chèn synFull, ghi ra cuối hàm
    for n in reg['lib']:
        slug = n['slug']
        card = cards.get(slug, {})
        page = pages_by_url.get((card.get('url') or '').replace('http://', 'https://')) \
            or pages_by_title.get(norm_key(n['title']))
        alias = BOOK_ALIAS.get(slug, slug)
        post = posts.get(slug) or posts.get(alias)
        real = real_chaps.get(alias)
        if real is None and post:
            real = len((books.get(slug) or {}).get('chapters', []))
        if real is None:
            real = len((books.get(slug) or {}).get('chapters', []))
        status_page = canon_status((re.search(r'Tình trạng:\s*(.+?)\s*Tác giả:', page['text'])
                                    .group(1) if page else None)) if page else None
        if real <= 0:
            status = 'Sắp ra mắt'
        else:
            status = status_page or canon_status(card.get('status')) or n.get('status') or 'Đang cập nhật'

        old_label = str(n.get('countLabel') or n.get('count') or '')
        m = re.match(r'^(\d+)\s*/\s*(\d+)$', old_label)
        denom = int(m.group(2)) if m and int(m.group(2)) >= real > 0 else None
        if real <= 0:
            count = '0/—'
        elif denom and denom > real:
            count = '%d/%d' % (real, denom)          # đang dịch: x/tổng
        else:
            count = '%d/%d' % (real, real)

        new = dict(n)
        if card:
            new['author'] = clean(card.get('author') or n.get('author'))
            new['couple'] = clean(card.get('couple') or '')
            new['series'] = card.get('series') or n.get('series') or ''
            new['year'] = card.get('year') or n.get('year')
            new['is18'] = bool(card.get('is18'))
            if card.get('thumb'):
                new['thumb'] = card['thumb']
        new['url'] = '/truyen/%s/' % slug
        new['blog'] = (post or {}).get('url') or (card.get('url') or '')
        new['postId'] = re.sub(r'\D', '', str((post or {}).get('postId') or n.get('postId') or ''))
        new['chapters'] = max(real, 0)
        new['count'] = count
        new['countLabel'] = count
        new['status'] = status
        # statusRaw/note: giữ câu chữ gốc của blog khi nó còn đúng; bỏ khi đã cũ
        # (badge trên list-novel ghi "Tới chương 5" nhưng bài thật đã có 7 chương -> cũ)
        raw = clean(card.get('status') or '')
        digits = re.findall(r'\d+', raw)
        stale = bool(digits) and real > int(digits[0])
        if raw and canon_status(raw) != status and raw != 'Sắp ra mắt' and not stale:
            new['statusRaw'] = raw
            new['note'] = raw
        else:
            new.pop('statusRaw', None)
            new.pop('note', None)
        # ngày: ưu tiên ngày cập nhật THẬT của bài viết (chương mới), sau đó mới tới trang giới thiệu
        if post:
            new['updated'] = post['updated']
            new['published'] = post['published']
        elif page:
            new['updated'] = page['updated']
            new['published'] = page['published']
        if page:
            full = syn_full_from_page(page.get('html') or '')
            if len(full) > 40:
                # MÔ TẢ ĐẦY ĐỦ đi theo từng bộ (data/book/<slug>.json), không nằm
                # trong registry: registry là mục lục mà MỌI trang phải tải, nhét
                # thêm 56 KB chữ vào đó là bắt trang chủ tải nặng gấp 2,6 lần
                # (12,9 KB → 34,1 KB gzip). Trang truyện vốn đã tải tệp chương.
                bk = books.get(slug)
                if isinstance(bk, dict):
                    fixed = book_with_syn(bk, full)
                    if fixed != bk:
                        books[slug] = fixed
                        dirty_books[slug] = fixed
                # syn trong registry là bản rút gọn cho thẻ / trang chủ / meta
                # description. Bản cũ cắt cứng [:300] nên đứt giữa chừng một từ;
                # nay khép ở dấu câu hoặc ranh giới từ.
                new['syn'] = syn_teaser(full)
        new_lib.append(new)

        rows.append(dict(slug=slug, title=n['title'], old=dict(
            chapters=n.get('chapters'), count=n.get('countLabel'), status=n.get('status'),
            updated=n.get('updated'), postId=n.get('postId'), thumb=n.get('thumb'),
            author=n.get('author'), is18=n.get('is18')),
            new=dict(chapters=new['chapters'], count=new['countLabel'], status=new['status'],
                     updated=new.get('updated'), postId=new['postId'], thumb=new['thumb'],
                     author=new['author'], is18=new['is18'])))

    # ---- series: chỉ giữ nhóm mà mọi phần đều có thật trong lib
    titles = {n['title'] for n in new_lib}
    series = []
    for g in reg.get('series', []):
        parts = [p for p in g.get('parts', []) if p in titles]
        if len(parts) >= 2:
            series.append(dict(g, parts=parts))
    # thêm nhóm 1 phần để trang truyện vẫn có "series" riêng (giữ như cũ nếu đã có)
    old_keys = {g['key'] for g in series}
    for g in reg.get('series', []):
        if g['key'] in old_keys:
            continue
        parts = [p for p in g.get('parts', []) if p in titles]
        if parts:
            series.append(dict(g, parts=parts))
    series.sort(key=lambda g: (-len(g['parts']), g['name']))

    # ---- slides: ưu tiên bộ đang nổi bật nhưng PHẢI có chương thật
    by_title = {n['title']: n for n in new_lib}
    have_chaps = [n for n in new_lib if n['chapters'] > 0]
    slides = []
    for s in reg.get('slides', []):
        n = by_title.get(s['title'])
        if n and n['chapters'] > 0 and n['title'] not in [x['title'] for x in slides]:
            slides.append(n)
    for n in sorted(have_chaps, key=lambda x: x.get('updated') or '', reverse=True):
        if len(slides) >= 5:
            break
        if n['title'] not in [x['title'] for x in slides]:
            slides.append(n)
    slides = slides[:5]

    # ---- lịch ra chương thật
    sched_page = pages_by_title.get(norm_key('Lịch ra chương')) or pages_by_url.get(
        'https://chuseoz.blogspot.com/p/lich-ra-chuong.html')
    schedule = None
    if sched_page:
        items = parse_schedule(sched_page['text'])
        for it in items:
            n = next((x for x in new_lib if norm_key(x['title']) == norm_key(it['title'])
                      or norm_key(it['title']).startswith(norm_key(x['title']))), None)
            it['slug'] = n['slug'] if n else ''
        schedule = {'source': sched_page['url'], 'updated': sched_page['updated'], 'items': items,
                    'note': 'Lịch có thể thay đổi nếu có việc đột xuất.'}

    reg_out = dict(reg)
    reg_out['rev'] = datetime.date.today().isoformat()
    reg_out['lib'] = new_lib
    reg_out['series'] = series
    reg_out['slides'] = slides
    if schedule:
        reg_out['schedule'] = schedule
    reg_out['source'] = {'blog': 'https://chuseoz.blogspot.com/',
                         'registry': 'https://chuseoz.blogspot.com/p/list-novel.html',
                         'synced': datetime.datetime.now().isoformat(timespec='seconds')}
    save(out_path, reg_out)
    # mô tả đầy đủ nằm ở tệp chương, chỉ ghi những bộ thật sự có thay đổi
    for slug, bk in sorted(dirty_books.items()):
        path = os.path.join(books_dir, slug + '.json')
        if os.path.exists(path):
            save_book(path, bk)

    lines = ['# Đối chiếu registry với dữ liệu blogspot (%s)' % reg_out['rev'], '']
    for r in rows:
        diffs = [k for k in ('chapters', 'count', 'status', 'updated', 'postId', 'thumb', 'author', 'is18')
                 if str(r['old'].get(k)) != str(r['new'].get(k))]
        if diffs:
            lines.append('## %s' % r['title'])
            for k in diffs:
                lines.append('- %-9s `%s` → `%s`' % (k, r['old'].get(k), r['new'].get(k)))
            lines.append('')
    if report_path:
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
    return reg_out, rows, dirty_books


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    ap.add_argument('--posts', required=True)
    ap.add_argument('--postdetails', required=True)
    ap.add_argument('--cards', required=True)
    ap.add_argument('--registry', required=True)
    ap.add_argument('--books', default='data/book')
    ap.add_argument('--out', default='data/registry.json')
    ap.add_argument('--report', default=None)
    a = ap.parse_args()
    reg, rows, dirty_books = build(a.pages, a.posts, a.postdetails, a.cards, a.registry, a.books,
                                   a.out, a.report)
    changed = [r for r in rows if any(str(r['old'].get(k)) != str(r['new'].get(k)) for k in r['old'])]
    print('lib: %d bộ | %d bộ có thay đổi' % (len(reg['lib']), len(changed)))
    print('mô tả đầy đủ đã ghi vào %d tệp chương' % len(dirty_books))
    print('slides:', [s['title'] for s in reg['slides']])
    print('series:', len(reg['series']), '| schedule:', len((reg.get('schedule') or {}).get('items', [])))
