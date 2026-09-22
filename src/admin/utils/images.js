export function dataUrlToBase64(dataUrl) {
  return String(dataUrl || '').replace(/^data:[^;,]+;base64,/, '').replace(/\s/g, '');
}

export function bytesOfBase64(base64) {
  return Math.floor(String(base64 || '').replace(/=+$/, '').length * 3 / 4);
}

export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

export async function compressImage(file, { max = 1400, quality = 0.82, type = 'image/webp' } = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Ảnh quá lớn (trên 12 MB) — hãy giảm kích thước trước.');
  const input = await readAsDataURL(file);
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Ảnh không hợp lệ hoặc trình duyệt không đọc được.'));
    image.src = input;
  });
  const scale = Math.min(1, max / Math.max(img.naturalWidth || img.width || 1, img.naturalHeight || img.height || 1));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ nén ảnh bằng canvas.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  let dataUrl = canvas.toDataURL(type, quality);
  if (!/^data:image\/webp/i.test(dataUrl) && type === 'image/webp') {
    type = 'image/jpeg';
    dataUrl = canvas.toDataURL(type, quality);
  }
  const data = dataUrlToBase64(dataUrl);
  return { data, type, width, height, bytes: bytesOfBase64(data), dataUrl };
}
