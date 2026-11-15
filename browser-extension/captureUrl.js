/** Build the desktop capture request without changing the supplied URL, title or selection. */
export function createCaptureUrl(url, title, selection) {
  const capture = new URL('urlflow://add');
  capture.searchParams.set('url', url);
  if (title?.trim()) capture.searchParams.set('title', title);
  const selected = typeof selection === 'string' ? selection.trim() : '';
  if (selected) capture.searchParams.set('selection', selected);
  return capture.href;
}
