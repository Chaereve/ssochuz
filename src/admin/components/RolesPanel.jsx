import { h } from 'preact';
import { useState } from 'preact/hooks';
import { ROLE_ORDER, ROLES, roleLabel } from '../utils/permissions.js';

export function RolesPanel({ registry, role, onSave }) {
  const staff = ((registry && registry.settings && registry.settings.staff) || []).slice();
  const [rows, setRows] = useState(staff);
  const [email, setEmail] = useState('');
  const [pick, setPick] = useState('editor');

  function add(e) {
    e.preventDefault();
    const em = String(email || '').trim().toLowerCase();
    if (!em || em.indexOf('@') < 0) return;
    if (rows.some((r) => String(r.email).toLowerCase() === em)) return;
    setRows(rows.concat([{ email: em, role: pick, name: em.split('@')[0] }]));
    setEmail('');
  }

  return (
    <div id="pane-roles" class="v2pane">
      <section class="card2">
        <div class="row"><h3>Vai trò &amp; quyền</h3><span class="grow"></span><span class="pill acc">{roleLabel(role)}</span></div>
        <p class="hint">Danh sách này lưu trên KV (registry.settings.staff) và bị lọc khỏi API công khai. Ghi dữ liệu vẫn đòi ADMIN_KEY — Worker không tin role gửi từ trình duyệt. ADMIN_KEY luôn là Super Admin.</p>
        <div class="v2role-grid">
          {ROLE_ORDER.map((id) => (
            <div class="v2role-card" key={id}>
              <b>{ROLES[id].label}</b>
              <span class="sm muted">{ROLES[id].perms.indexOf('*') >= 0 ? 'Toàn quyền' : ROLES[id].perms.join(', ')}</span>
            </div>
          ))}
        </div>
      </section>
      <section class="card2">
        <h3>Nhân sự</h3>
        <form class="row" onSubmit={add}>
          <input class="inp" type="email" value={email} placeholder="email@…" onInput={(e) => setEmail(e.target.value)} />
          <select class="inp" value={pick} onChange={(e) => setPick(e.target.value)}>
            {ROLE_ORDER.map((id) => <option key={id} value={id}>{ROLES[id].label}</option>)}
          </select>
          <button class="btn" type="submit">Thêm</button>
        </form>
        <div class="v2tablewrap">
          <table class="v2book-table">
            <thead><tr><th>Email</th><th>Vai trò</th><th></th></tr></thead>
            <tbody>
              {rows.length ? rows.map((r, i) => (
                <tr key={r.email}>
                  <td>{r.email}</td>
                  <td>
                    <select class="inp" value={r.role} onChange={(e) => setRows(rows.map((x, k) => k === i ? Object.assign({}, x, { role: e.target.value }) : x))}>
                      {ROLE_ORDER.map((id) => <option key={id} value={id}>{ROLES[id].label}</option>)}
                    </select>
                  </td>
                  <td><button class="btn ghost sm" type="button" onClick={() => setRows(rows.filter((_, k) => k !== i))}>Gỡ</button></td>
                </tr>
              )) : <tr><td colspan="3"><div class="empty sm">Chưa có nhân sự — Super Admin dùng ADMIN_KEY.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <button class="btn pri" type="button" onClick={() => onSave(rows)}>Lưu nhân sự</button>
      </section>
    </div>
  );
}
