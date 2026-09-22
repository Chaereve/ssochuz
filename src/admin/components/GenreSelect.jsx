import { h } from 'preact';
import { listGenres } from '../utils/genres.js';

export function GenreSelect({ registry, value = '', onChange, allowEmpty = true }) {
  const genres = listGenres(registry).filter((g) => g.is_visible || g.slug === value || g.name === value);
  return (
    <div class="v2genre">
      <select class="inp" value={value} onChange={(e) => onChange && onChange(e.target.value)}>
        {allowEmpty ? <option value="">— Chưa gán thể loại —</option> : null}
        {genres.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
      </select>
    </div>
  );
}
