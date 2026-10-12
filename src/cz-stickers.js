/* Browser bridge for the shared ES module registry.
 * Worker imports src/shared/stickers.js directly; browser code receives the
 * exact same immutable objects as window.CZStickers.
 */
import { STICKERS } from './shared/stickers.js';

window.CZStickers = STICKERS;
