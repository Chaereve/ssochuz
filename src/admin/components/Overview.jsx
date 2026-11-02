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

  return (
    <div id="pane-overview" class="v2overview">
      {/* Hàng số liệu: KHÔNG bọc trong thẻ — đây là “dải số” của trang, đứng
          cùng cấp với tiêu đề chứ không phải một khối nội dung. */}
      <section class="v2kpi" aria-label="Số liệu thư viện">
        <div class="row v2kpi-head">
          <h3>Tình trạng dữ liệu</h3>
          <span class="grow"></span>
          <span class="hint">nguồn: {state.online ? 'KV qua Worker' : 'tệp tĩnh /data'}</span>
          <button class="btn ghost sm" type="button" onClick={onReload}>{state.loading ? 'Đang đọc…' : 'Đọc lại dữ liệu'}</button>
        </div>
        <div class="tiles">
          {ov.tiles.map((tile) => <Tile key={tile.label} value={tile.value} label={tile.label} />)}
          <Tile value={quota.writesToday || 0} label="Quota KV hôm nay" hint={quota.supported ? 'nguồn Worker' : 'Worker chưa có counter'} />
          {quota.readSupported
            ? <Tile value={quota.readsToday || 0} label="Lượt đọc KV hôm nay" hint={quota.readCritical ? 'ước lượng · sắp chạm trần 100k' : quota.readWarn ? 'ước lượng · đã qua 70%' : 'ước lượng · trần 100k'} />
            : <div class="tile"><b>—</b><span>Lượt đọc KV hôm nay</span><small>Worker chưa trả readsToday</small></div>}
        </div>
      </section>

      <div class="v2dash">
        <section class="card2" aria-label="Việc cần làm hôm nay">
          <div class="row"><h3>Việc cần làm hôm nay</h3><span class="grow"></span><span class="sm muted">bấm để mở</span></div>
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
            {ov.tasks.length ? ov.tasks.map((task) => (
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
          <div class="row"><h3>Lượt đọc 14 ngày</h3><span class="grow"></span><span class="sm muted">{statsDays.length ? 'cập nhật ' + (state.stats.updatedAt || '').slice(0, 16).replace('T', ' ') : 'chưa có số liệu'}</span></div>
          {statsDays.length ? <BarsChart days={statsDays} take={14} /> : <p class="hint">Chưa có số liệu từ Worker.</p>}
        </section>

        <section class="card2" aria-label="Tình trạng hệ thống">
          <div class="row"><h3>Tình trạng hệ thống</h3><span class="grow"></span><span class="sm muted">4 mục</span></div>
          <div class="doc">
            <SystemRow kind={supabaseOn ? 'good' : 'warn'} icon={supabaseOn ? 'check' : 'alert'} title={`Đăng nhập người đọc: ${supabaseOn ? 'đã bật' : 'chưa bật'}`}>
              {supabaseOn ? 'Google qua Supabase; quyền quản trị vẫn do Worker xác nhận.' : 'Chưa cấu hình Supabase trong cz-config.js hoặc trên KV.'}
            </SystemRow>
            <SystemRow kind="good" icon="pulse" title="Kiểm tra dữ liệu: sẵn sàng">
              Quét KV, lệch số chương và chương rỗng.
            </SystemRow>
            <SystemRow kind={state.online ? 'good' : 'warn'} icon={state.online ? 'cloud' : 'info'} title={`Worker: ${state.online ? 'đã nối KV' : 'chưa nối · đang đọc tệp tĩnh'}`}>
              {state.online ? `API tập trung${state.worker && state.worker.version ? ' · ' + state.worker.version : ''}.` : 'Cần URL Worker + ADMIN_KEY để ghi.'}
            </SystemRow>
            <SystemRow kind={quota.supported ? 'good' : 'warn'} icon={quota.supported ? 'check' : 'alert'} title={`Quota KV: ${quota.writesToday || 0}/${quota.limit || 1000} lượt ghi hôm nay`}>
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
                  ? 'Đã qua 70% trần đọc miễn phí (100.000/ngày); ước lượng, có thể thấp hơn dashboard Cloudflare.'
                  : 'Ước lượng bộ đếm RAM của Worker; không tốn lượt ghi.')
                : 'Worker bản cũ chưa có bộ đếm lượt đọc.'}
            </SystemRow>
            {(() => {
              const ovf = (state.worker && state.worker.overflow) || {};
              const sb = !!ovf.supabase;
              const r2 = !!ovf.r2;
              return (
                <SystemRow kind={sb || r2 ? 'good' : 'warn'} icon={sb || r2 ? 'check' : 'info'} title="Lưu trữ tràn: không bắt buộc">
                  Supabase {sb ? 'có' : 'không'} · R2 {r2 ? 'có' : 'không'} · bìa {ovf.covers ? 'Supabase Storage' : 'KV'} · ảnh chương KV.
                </SystemRow>
              );
            })()}
          </div>
        </section>
      </div>
    </div>
  );
}
