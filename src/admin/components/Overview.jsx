import { h, Fragment } from 'preact';
import { computeOverview, spamSuspects } from '../utils/overview.js';
import { BarsChart } from './OperationalPanels.jsx';
import { countText, dateVN, num } from '../utils/format.js';
import { BookBadges } from './Badges.jsx';

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
      <section class="card2">
        <div class="row"><h3>Tình trạng dữ liệu</h3><span class="grow"></span><button class="btn ghost sm" type="button" onClick={onReload}>{state.loading ? 'Đang đọc…' : 'Đọc lại dữ liệu'}</button></div>
        <p class="hint">Tính từ dữ liệu đang mở ({state.online ? 'KV qua Worker' : 'file /data/*.json trong repo'}). Các công thức giữ theo admin cũ để đối chiếu.</p>
        <div class="tiles">
          {ov.tiles.map((tile) => <Tile key={tile.label} value={tile.value} label={tile.label} />)}
          <Tile value={quota.writesToday || 0} label="Quota KV hôm nay" hint={quota.supported ? 'nguồn Worker' : 'Worker chưa có counter'} />
        </div>
        <div class="v2today">
          <div class="ovhead">Việc cần làm hôm nay</div>
          <div class="v2todo-grid">
            <button type="button" class="v2todo" onClick={() => onTodo && onTodo('reports')}><b>{num(reportCount)}</b><span>Báo lỗi chưa xử lý</span></button>
            <button type="button" class="v2todo" onClick={() => onTodo && onTodo('cmts')}><b>{num(spamCount)}</b><span>Bình luận nghi spam</span></button>
            <button type="button" class="v2todo" onClick={() => onTodo && onTodo('list')}><b>{num(lockedCount)}</b><span>Bộ đang khóa mật mã</span></button>
          </div>
        </div>
        <div class="ovtasks">
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
                {task.items.map((book) => <button class="ovchip" type="button" key={book.slug} onClick={() => onTodo && onTodo('edit', book)}>{book.title}</button>)}
                {task.count > task.items.length ? <span class="sm muted">… và {num(task.count - task.items.length)} bộ nữa</span> : null}
              </div>
            </div>
          )) : <div class="empty sm">Dữ liệu đang gọn gàng — không có việc nào cần xử lý.</div>}
        </div>
      </section>

      <section class="card2">
        <div class="row"><h3>Tình trạng hệ thống</h3><span class="grow"></span><span class="sm muted">đăng nhập · số chương · Worker · quota</span></div>
        <div class="doc">
          <SystemRow kind={supabaseOn ? 'good' : 'warn'} icon={supabaseOn ? 'check' : 'alert'} title={`Đăng nhập người đọc: ${supabaseOn ? (supabaseInCode ? 'Supabase (cz-config.js)' : 'Supabase (lưu trên KV)') : 'CHƯA bật'}`}>
            {supabaseOn ? 'Người đọc đăng nhập qua Supabase/Google. Quyền quản trị vẫn do Worker xác nhận.' : 'Chưa thấy cấu hình Supabase public trong cz-config.js hoặc registry.settings.auth.'}
          </SystemRow>
          <SystemRow kind="good" icon="pulse" title="Doctor: đã có kiểm tra nền">
            Tab Kiểm tra dữ liệu có audit KV, quét book, phát hiện lệch số chương/chương rỗng và nút recount có xác nhận mạnh.
          </SystemRow>
          <SystemRow kind={state.online ? 'good' : 'warn'} icon={state.online ? 'cloud' : 'info'} title={`Worker: ${state.online ? 'đã nối KV' : 'chưa nối — đang xem dữ liệu tĩnh'}`}>
            {state.online ? `Worker ${state.worker && state.worker.version ? state.worker.version : ''} · sửa ở đây sẽ đi qua API tập trung.` : 'Nhập URL Worker + ADMIN_KEY để đọc KV và bật kiểm kê quota/server.'}
          </SystemRow>
          <SystemRow kind={quota.supported ? 'good' : 'warn'} icon={quota.supported ? 'check' : 'alert'} title={`Quota KV: ${quota.writesToday || 0}/${quota.limit || 1000} write hôm nay`}>
            {quota.supported ? 'Worker trả writesToday/lastReset.' : 'Endpoint /api/admin/kv hiện chưa trả writesToday; quota v2 đang ở chế độ ước tính phía client.'}
          </SystemRow>
          {(() => {
            const ovf = (state.worker && state.worker.overflow) || {};
            const sb = !!ovf.supabase;
            const r2 = !!ovf.r2;
            return (
              <SystemRow kind={sb || r2 ? 'good' : 'warn'} icon={sb || r2 ? 'check' : 'info'} title="Overflow KV (tuỳ chọn)">
                Supabase: {sb ? 'connected' : 'unavailable'}. R2: {r2 ? 'connected' : 'unavailable'}. KV fallback: active. Overflow không bắt buộc — admin vẫn chạy full JSON trên KV.
              </SystemRow>
            );
          })()}
        </div>
      </section>

      <section class="card2">
        <div class="row"><h3>Lượt đọc 14 ngày</h3><span class="grow"></span><span class="sm muted">{statsDays.length ? 'cập nhật ' + (state.stats.updatedAt || '').slice(0, 16).replace('T', ' ') : 'chưa có số liệu'}</span></div>
        {statsDays.length ? <BarsChart days={statsDays} take={14} /> : <p class="hint">Chưa có dữ liệu lượt đọc từ Worker</p>}
      </section>

      <section class="card2">
        <h3>Mới cập nhật</h3>
        <div class="ovrecent">
          {ov.recent.length ? ov.recent.map((book) => (
            <button class="ovrec" type="button" key={book.slug} onClick={() => onTodo && onTodo('edit', book)}>
              <span class={`ovth ${book.thumb ? 'skel' : ''}`}>{book.thumb ? <img src={book.thumb} alt="" loading="lazy" decoding="async" /> : null}</span>
              <span class="ovtt"><b>{book.title}</b><span>{book.author || ''} · {countText(book)}</span><BookBadges book={book} registry={registry} compact /></span>
              <span class="ovwhen">{dateVN(book.updated)}</span>
            </button>
          )) : <div class="empty sm">Chưa có bộ nào.</div>}
        </div>
      </section>
    </div>
  );
}
