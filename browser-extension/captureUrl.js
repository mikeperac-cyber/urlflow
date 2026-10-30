/** Build the desktop capture request without changing the supplied URL or title. */
export function createCaptureUrl(url, title) {
  const capture = new URL('urlflow://add');
  capture.searchParams.set('url', url);
  if (title?.trim()) capture.searchParams.set('title', title);
  return capture.href;
}
