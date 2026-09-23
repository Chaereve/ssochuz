import { h } from 'preact';
import { listGenres, suggestGenres } from '../utils/genres.js';

export function GenreSelect({ registry, value = '', onChange, allowEmpty = true, hint = '' }) {
  const genres = listGenres(registry).filter((g) => g.is_visible || g.slug === value || g.name === value);
  const suggestions = suggestGenres(hint, registry, value);
  return (
    <div class="v2genre">
      <select class="inp" value={value} onChange={(e) => onChange && onChange(e.target.value)}>
        {allowEmpty ? <option value="">— Chưa gán thể loại —</option> : null}
        {genres.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
      </select>
      {suggestions.length ? (
        <div class="v2genre-hints">
          <span class="sm muted">Gợi ý thể loại</span>
          {suggestions.map((g) => (
            <button type="button" class="v2genre-pill" key={g.slug} onClick={() => onChange && onChange(g.slug)}>{g.name}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
