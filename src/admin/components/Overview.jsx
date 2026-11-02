import { h } from 'preact';
import { computeOverview, spamSuspects } from '../utils/overview.js';
import { BarsChart } from './OperationalPanels.jsx';
import { countText, dateVN, num } from '../utils/format.js';
import { BookBadges } from './Badges.jsx';

function icon(name) {
  return window.CZ && window.CZ.icon ? window.CZ.icon(name, 'i-s') : '';
}

function Tile({ value, label, hint }) {
  return <div class="tile"><b>{num(value)}</b><span>{label}</span>{hint ? <small>{hint}</small> : null}</div>;
}

function SystemRow({ kind = 'good', icon = 'check', title, children }) {
  const html = window.CZ && window.CZ.icon ? window.CZ.icon(icon, 'i-s') : '';
  return <div class={`docrow ${kind}`}><span class="di" dangerouslySetInnerHTML={{ __html: html }} /><span class="dt"><b>{title}</b><span>{children}</span></span></div>;
}

export function Overview({ state, onReload, onTodo }) {
  const registry = state.registry || { lib: [] };
  const statsItems = (state.stats && state.stats.items) || {};
  const ov = computeOverview(registry, statsItems);
  const authCfg = (registry.settings && registry.settings.auth) || {};
  const supabaseInCode = !!(window.CZ_SUPABASE_URL && window.CZ_SUPABASE_ANON_KEY);
  const supabaseInKv = !!(authCfg.supabaseUrl && authCfg.supabaseAnonKey);
  const supabaseOn = supabaseInCode || supabaseInKv;
  const reportCount = (state.reports && (state.reports.open != null ? state.reports.open : state.reports.count)) || 0;
  const spamCount = spamSuspects(state.comments).length;
  const lockedCount = ov.lib.filter((book) => book.lock).length;
  const quota = state.quota || {};
  const statsDays = (state.stats && state.stats.days) || [];

  /* Dải số chia ba lớp: bốn số chính · bốn số vận hành · một dòng số phụ.
     Thứ tự tile do computeOverview trả về là cố định (bộ, có chương, sắp ra
     mắt, chương đã đăng, 18+, thiếu thông tin, có số liệu, đọc, phiếu). */
  const allTiles = ov.tiles;
  const heroTiles = [allTiles[0], allTiles[3], allTiles[7], allTiles[8]];
  const secondTiles = [allTiles[5], allTiles[4]];
  const metricTiles = [allTiles[1], allTiles[2], allTiles[6]];
  const queueTotal = reportCount + spamCount + lockedCount;
  const last14 = statsDays.slice(-14);
  const reads14 = last14.reduce((n, d) => n + (Number(d.views) || 0), 0);
  const peak = last14.reduce((best, d) => ((Number(d.views) || 0) > (Number(best.views) || 0) ? d : best), { views: 0, day: '' });

  return (
    <div id="pane-overview" class="v2overview">
      {/* Dải số: bốn thẻ riêng, nhãn trên – số dưới. Không bọc thêm khung. */}
      <section class="v2kpi" aria-label="Số liệu thư viện">
        <div class="tiles v2tiles4">
          {heroTiles.map((tile) => <Tile key={tile.label} value={tile.value} label={tile.label} />)}
        </div>
        <div class="tiles v2tiles4 v2tiles-second">
          {quota.readSupported
            ? <Tile value={quota.readsToday || 0} label="Lượt đọc KV hôm nay" hint={quota.readCritical ? 'sắp chạm trần 100k' : quota.readWarn ? 'đã qua 70% trần' : 'ước lượng · trần 100k'} />
            : <div class="tile"><b>—</b><span>Lượt đọc KV hôm nay</span><small>Worker chưa trả readsToday</small></div>}
          <Tile value={quota.writesToday || 0} label="Quota KV hôm nay" hint={quota.supported ? 'nguồn Worker' : 'ước tính phía trình duyệt'} />
          {secondTiles.map((tile) => <Tile key={tile.label} value={tile.value} label={tile.label} />)}
        </div>
        <div class="row v2kpi-foot">
          <span class="v2metrics">
            {metricTiles.map((tile) => (
              <span class="v2metric" key={tile.label}><b>{num(tile.value)}</b> {tile.label}</span>
            ))}
          </span>
          <span class="grow"></span>
          <span class="sm muted">nguồn: {state.online ? 'KV qua Worker' : 'tệp tĩnh /data'}</span>
          <button class="btn ghost sm" type="button" onClick={onReload}>{state.loading ? 'Đang đọc…' : 'Đọc lại dữ liệu'}</button>
        </div>
      </section>

      <div class="v2dash">
        <section class="card2" aria-label="Việc cần làm hôm nay">
          <div class="row">
            <h3>Cần xử lý</h3>
            <span class="v2count has">{num(queueTotal)}</span>
            <span class="grow"></span>
            <span class="sm muted">bấm để mở</span>
          </div>
          <div class="v2todo-grid">
            <button type="button" class="v2todo" onClick={() => onTodo && onTodo('reports')}>
              <span class="vd-ic" dangerouslySetInnerHTML={{ __html: icon('alert') }} />
              <span class="vd-tx"><b>{num(reportCount)}</b><span>Báo lỗi chưa xử lý</span></span>
            </button>
            <button type="button" class="v2todo" onClick={() => onTodo && onTodo('cmts')}>
              <span class="vd-ic" dangerouslySetInnerHTML={{ __html: icon('chat') }} />
              <span class="vd-tx"><b>{num(spamCount)}</b><span>Bình luận nghi spam</span></span>
            </button>
            <button type="button" class="v2todo" onClick={() => onTodo && onTodo('list')}>
              <span class="vd-ic" dangerouslySetInnerHTML={{ __html: icon('lock') }} />
              <span class="vd-tx"><b>{num(lockedCount)}</b><span>Bộ đang khóa mật mã</span></span>
            </button>
          </div>
          <div class="v2today">
            <div class="ovhead">Việc nên xem lại</div>
            {ov.tasks && ov.tasks.length ? ov.tasks.map((task) => (
              <div class="ovtask" key={task.key}>
                <div class="ovrow">
                  <span class="ovpill">{num(task.count)}</span>
                  <span class="ovtt"><b>{task.title}</b><span>{task.hint}</span></span>
                  <span class="grow"></span>
                  <button class="btn ghost sm" type="button" onClick={() => onTodo && onTodo(task.key)}>Xem danh sách</button>
                </div>
                <div class="ovchips">
                  {task.items.map((book) => <button class="ovchip" type="button" key={book.slug} title={book.title} onClick={() => onTodo && onTodo('edit', book)}>{book.title}</button>)}
                  {task.count > task.items.length ? <span class="sm muted">… và {num(task.count - task.items.length)} bộ nữa</span> : null}
                </div>
              </div>
            )) : <div class="empty sm">Dữ liệu đang gọn gàng — không có việc nào cần xử lý.</div>}
          </div>
        </section>

        <section class="card2" aria-label="Mới cập nhật">
          <div class="row"><h3>Mới cập nhật</h3><span class="grow"></span><span class="sm muted">{ov.recent.length} bộ</span></div>
          <div class="ovrecent">
            {ov.recent.length ? ov.recent.map((book) => (
              <button class="ovrec" type="button" key={book.slug} onClick={() => onTodo && onTodo('edit', book)}>
                <span class={`ovth ${book.thumb ? 'skel' : ''}`}>{book.thumb ? <img src={book.thumb} alt="" loading="lazy" decoding="async" /> : null}</span>
                <span class="ovtt"><b title={book.title}>{book.title}</b><span>{book.author || ''} · {countText(book)}</span><BookBadges book={book} registry={registry} compact /></span>
                <span class="ovwhen">{dateVN(book.updated)}</span>
              </button>
            )) : <div class="empty sm">Chưa có bộ nào.</div>}
          </div>
        </section>
      </div>

      <div class="v2dash">
        <section class="card2" aria-label="Lượt đọc 14 ngày">
          <div class="row">
            <h3>Lượt đọc 14 ngày</h3>
            <span class="grow"></span>
            <span class="v2stat-inline"><b>{num(reads14)}</b><span>lượt</span></span>
            {peak.day ? <span class="sm muted">đỉnh {dateVN(peak.day)} · {num(peak.views)}</span> : null}
          </div>
          {statsDays.length ? <BarsChart days={statsDays} take={14} /> : <p class="hint">Chưa có số liệu từ Worker.</p>}
          <p class="sm muted v2chart-note">{statsDays.length ? 'Cập nhật ' + String(state.stats.updatedAt || '').slice(0, 16).replace('T', ' ') : 'Chưa có số liệu'}</p>
        </section>

        <section class="card2" aria-label="Tình trạng hệ thống">
          <div class="row"><h3>Hệ thống</h3><span class="grow"></span><span class="sm muted">4 mục</span></div>
          <div class="doc">
            <SystemRow kind={supabaseOn ? 'good' : 'warn'} icon={supabaseOn ? 'check' : 'alert'} title={`Đăng nhập người đọc: ${supabaseOn ? 'đã bật' : 'chưa bật'}`}>
              {supabaseOn ? 'Google qua Supabase; quyền quản trị do Worker xác nhận.' : 'Chưa cấu hình Supabase trong cz-config.js hoặc trên KV.'}
            </SystemRow>
            <SystemRow kind={state.online ? 'good' : 'warn'} icon={state.online ? 'cloud' : 'info'} title={`Worker: ${state.online ? 'đã nối KV' : 'chưa nối · đọc tệp tĩnh'}`}>
              {state.online ? `API tập trung${state.worker && state.worker.version ? ' · ' + state.worker.version : ''}.` : 'Cần URL Worker + ADMIN_KEY để ghi.'}
            </SystemRow>
            <SystemRow kind={quota.supported ? 'good' : 'warn'} icon={quota.supported ? 'check' : 'alert'} title={`Quota KV: ${quota.writesToday || 0}/${quota.limit || 1000} lượt ghi`}>
              {quota.supported ? 'Số thật từ Worker.' : 'Worker chưa trả writesToday — đang ước tính phía trình duyệt.'}
            </SystemRow>
            <SystemRow
              kind={!quota.readSupported ? 'warn' : (quota.readWarn ? 'warn' : 'good')}
              icon={!quota.readSupported ? 'alert' : (quota.readWarn ? 'alert' : 'check')}
              title={quota.readSupported
                ? `Lượt đọc KV: ${num(quota.readsToday || 0)}/${num(quota.readBudget || 100000)}`
                : 'Lượt đọc KV: chưa có số'}
            >
              {quota.readSupported
                ? (quota.readWarn
                  ? 'Đã qua 70% trần đọc miễn phí (100.000/ngày); số ước lượng.'
                  : 'Ước lượng bộ đếm RAM của Worker; không tốn lượt ghi.')
                : 'Worker bản cũ chưa có bộ đếm lượt đọc.'}
            </SystemRow>
          </div>
        </section>
      </div>
    </div>
  );
}
