import { h } from 'preact';

const LABELS = {
  doctor: 'Bác sĩ dữ liệu', cmts: 'Kiểm duyệt bình luận', reports: 'Báo lỗi độc giả', stats: 'Thống kê', votes: 'Phiếu bầu', log: 'Nhật ký', settings: 'Cài đặt & đồng bộ'
};

export function PlaceholderTab({ tab }) {
  return (
    <div id={`pane-${tab}`} class="v2pane">
      <section class="card2 v2placeholder">
        <span class="pill acc">phase sau</span>
        <h3>{LABELS[tab] || tab}</h3>
        <p class="hint">Module này đang giữ chỗ phòng trường hợp cần mở rộng thêm. Admin cũ vẫn còn ở <a href="/admin-legacy">/admin-legacy</a> trong giai đoạn theo dõi sau cutover.</p>
      </section>
    </div>
  );
}
