/* RBAC phía admin. Worker vẫn là nguồn sự thật: ADMIN_KEY = Super Admin.
   Vai trò client chỉ dùng để ẩn/hiện UI — mọi ghi KV vẫn cần khoá quản trị. */

export const ROLES = {
  super_admin: {
    label: 'Super Admin',
    perms: ['*'],
  },
  admin: {
    label: 'Admin',
    perms: ['books', 'chapters', 'covers', 'users', 'comments', 'reports', 'homepage', 'analytics', 'settings', 'audit'],
  },
  editor: {
    label: 'Editor',
    perms: ['books', 'chapters', 'covers', 'homepage', 'analytics'],
  },
  moderator: {
    label: 'Moderator',
    perms: ['comments', 'reports', 'users:restrict'],
  },
  author: {
    label: 'Author',
    perms: ['books:own', 'chapters:own', 'covers:own'],
  },
};

export const ROLE_ORDER = ['super_admin', 'admin', 'editor', 'moderator', 'author'];

export function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (r === 'superadmin' || r === 'owner') return 'super_admin';
  if (r === 'local' || r === 'login' || r === 'key') return 'super_admin';
  if (ROLES[r]) return r;
  if (r === 'admin') return 'admin';
  return 'admin';
}

export function can(role, perm) {
  if (!perm) return true;
  const id = normalizeRole(role);
  const def = ROLES[id] || ROLES.admin;
  if (def.perms.indexOf('*') >= 0) return true;
  if (def.perms.indexOf(perm) >= 0) return true;
  const ns = String(perm).split(':')[0];
  return def.perms.indexOf(ns) >= 0;
}

export function roleLabel(role) {
  const id = normalizeRole(role);
  return (ROLES[id] && ROLES[id].label) || 'Admin';
}

export function visibleTabs(role) {
  const id = normalizeRole(role);
  if (id === 'author') return ['overview', 'list', 'new', 'edit', 'settings'];
  if (id === 'moderator') return ['overview', 'cmts', 'reports', 'users', 'log'];
  if (id === 'editor') return ['overview', 'list', 'new', 'edit', 'chapters', 'homepage', 'stats'];
  return null; /* null = tất cả */
}
