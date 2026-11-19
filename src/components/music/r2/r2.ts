/**
 * "Listening room" (r2). While a record is out of the row, the page's words step out of the room behind
 * it (the backdrop lets a little of the room through, and words behind the record's own would read as
 * one tangle), and come back as it goes home.
 */
import { onPage } from '@/scripts/page';

onPage((signal) => {
  const root = document.querySelector<HTMLElement>('.v4.r2[data-music-page]');
  if (!root) return;
  root.addEventListener('v4:open', () => root.setAttribute('data-r2-out', ''), { signal });
  root.addEventListener('v4:close', () => root.removeAttribute('data-r2-out'), { signal });
  signal.addEventListener('abort', () => root.removeAttribute('data-r2-out'));
});
