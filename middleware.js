import { sha256 } from './js/sha256.js';

// Vercel Edge Middleware：把 PASSWORD 的 SHA-256 注入到 HTML
export default async function middleware(request) {
  const url = new URL(request.url);
  const isHtmlPage = url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/') ||
    url.pathname.startsWith('/s=');
  if (!isHtmlPage) return; // 非 HTML 直接放行

  // 带上内部标记，避免中间件对自身发起的请求再次生效
  const headers = new Headers(request.headers);
  headers.set('x-middleware-subrequest', 'middleware');
  const response = await fetch(new Request(url.toString(), { method: 'GET', headers }));

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const originalHtml = await response.text();
  const password = process.env.PASSWORD || '';
  const passwordHash = password ? await sha256(password) : '';

  const modifiedHtml = originalHtml.replace(
    /window\.__ENV__\.PASSWORD\s*=\s*"\{\{PASSWORD\}\}";/,
    `window.__ENV__.PASSWORD = "${passwordHash}"; // SHA-256 hash`
  );

  // 关键：response.text() 已经把内容解压过了，必须去掉压缩/长度相关响应头，
  // 否则浏览器仍按 br/gzip 解码，页面会白屏。
  const newHeaders = new Headers(response.headers);
  ['content-encoding', 'content-length', 'transfer-encoding', 'etag', 'content-md5']
    .forEach(name => newHeaders.delete(name));
  newHeaders.set('content-type', 'text/html; charset=utf-8');
  newHeaders.set('cache-control', 'no-store, must-revalidate');

  return new Response(modifiedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

export const config = {
  // 只对 HTML 页面执行，跳过 api / proxy / 静态资源，避免拖慢视频分片代理
  matcher: ['/((?!api|proxy|js|css|libs|image|_vercel|favicon.ico|manifest.json|service-worker.js|robots.txt).*)'],
};
