import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDb } from './db';

const GWORKSPACE_SCRIPT = path.join(
  process.env.HOME || '~',
  '.cursor/skills/google-workspace/scripts/gworkspace.py'
);

export function extractDocIdFromUrl(url: string): string | null {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export function isGoogleDocUrl(url: string): boolean {
  return /docs\.google\.com\/document\/d\//.test(url);
}

function getGoogleEnv() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'google_%'").all() as { key: string; value: string }[];
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const clientSecretPath = (settings.google_client_secret_path || '~/.config/google/client_secret.json')
    .replace(/^~/, process.env.HOME || '');
  const oauthTokenPath = (settings.google_oauth_token_path || '~/.config/google/oauth_token.json')
    .replace(/^~/, process.env.HOME || '');
  return { ...process.env, GOOGLE_CLIENT_SECRET_PATH: clientSecretPath, GOOGLE_OAUTH_TOKEN_PATH: oauthTokenPath };
}

export async function fetchGoogleDocContent(docId: string): Promise<string> {
  const env = getGoogleEnv();
  try {
    const output = execSync(
      `python3.11 "${GWORKSPACE_SCRIPT}" docs read "${docId}"`,
      { encoding: 'utf-8', timeout: 30000, maxBuffer: 10 * 1024 * 1024, env }
    );
    return output.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Google Doc 拉取失败: ${msg}`);
  }
}

export async function fetchGoogleDocHtml(docId: string): Promise<string> {
  const env = getGoogleEnv();
  const tmpFile = path.join(os.tmpdir(), `gdoc_${docId}_${Date.now()}.html`);
  try {
    execSync(
      `python3.11 "${GWORKSPACE_SCRIPT}" docs export "${docId}" --format html --output "${tmpFile}"`,
      { encoding: 'utf-8', timeout: 60000, maxBuffer: 10 * 1024 * 1024, env }
    );
    const raw = fs.readFileSync(tmpFile, 'utf-8');
    return cleanGoogleDocHtml(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Google Doc HTML 导出失败: ${msg}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

function cleanGoogleDocHtml(raw: string): string {
  let body = raw;
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) body = bodyMatch[1];

  // Strip ALL <style> blocks — we apply our own CSS
  body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Strip class attributes
  body = body.replace(/\s+class="[^"]*"/g, '');

  // Strip Google's internal bookmark anchors
  body = body.replace(/<a[^>]*id="[^"]*"[^>]*>\s*<\/a>/g, '');

  // Strip comment reference links [a], [b], etc. and comment divs at the bottom
  body = body.replace(/<div[^>]*>\s*<p[^>]*>\s*<a[^>]*href="#cmnt_ref\d+"[^>]*>[\s\S]*?<\/div>/gi, '');
  body = body.replace(/<a[^>]*href="#cmnt\d+"[^>]*>\[[\w]+\]<\/a>/gi, '');
  body = body.replace(/<sup>\s*<a[^>]*href="#cmnt\d+"[^>]*>[\s\S]*?<\/a>\s*<\/sup>/gi, '');

  // Clean inline styles: keep only meaningful properties
  body = body.replace(/\s+style="([^"]*)"/g, (_match, styleStr: string) => {
    const kept: string[] = [];
    const props = styleStr.split(';').map((s: string) => s.trim()).filter(Boolean);
    for (const prop of props) {
      const [key, val] = prop.split(':').map((s: string) => s.trim());
      if (!key || !val) continue;
      if (key === 'font-weight' && (val === 'bold' || val === '700')) { kept.push('font-weight:bold'); continue; }
      if (key === 'font-style' && val === 'italic') { kept.push('font-style:italic'); continue; }
      if (key === 'text-decoration' && val.includes('underline')) { kept.push('text-decoration:underline'); continue; }
      if (key === 'text-decoration' && val.includes('line-through')) { kept.push('text-decoration:line-through'); continue; }
      if (key === 'color' && val !== '#000000' && val !== 'rgb(0, 0, 0)' && val !== '#000' && val !== 'black') { kept.push(`color:${val}`); continue; }
      if (key === 'background-color' && val !== 'transparent' && val !== '#ffffff' && val !== 'white') { kept.push(`background-color:${val}`); continue; }
      if (key === 'text-align' && val !== 'left') { kept.push(`text-align:${val}`); continue; }
      if (key === 'vertical-align' && val === 'super') { kept.push('vertical-align:super;font-size:smaller'); continue; }
      if (key === 'vertical-align' && val === 'sub') { kept.push('vertical-align:sub;font-size:smaller'); continue; }
    }
    return kept.length > 0 ? ` style="${kept.join(';')}"` : '';
  });

  // Unwrap empty spans (no style, no content-bearing attributes)
  body = body.replace(/<span>([\s\S]*?)<\/span>/g, '$1');

  // Clean empty paragraphs but keep one for spacing
  body = body.replace(/(<p[^>]*>)\s*(<\/p>)/g, '$1<br>$2');

  // Collapse multiple <br>
  body = body.replace(/(<br\s*\/?>){3,}/g, '<br><br>');

  // Extract base64 images → save to /public/gdoc-images/ → replace with local paths
  const imgDir = path.join(process.cwd(), 'public', 'gdoc-images');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  let imgIdx = 0;
  body = body.replace(/<img([^>]*)src="data:image\/(png|jpeg|gif|webp);base64,([^"]+)"([^>]*)>/gi,
    (_m, pre, ext, b64, post) => {
      const fname = `img_${Date.now()}_${imgIdx++}.${ext === 'jpeg' ? 'jpg' : ext}`;
      try { fs.writeFileSync(path.join(imgDir, fname), Buffer.from(b64, 'base64')); } catch { return ''; }
      return `<img${pre}src="/gdoc-images/${fname}"${post}>`;
    });

  return `<div class="gdoc-content">${body}</div>`;
}

export async function testGoogleConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const output = execSync(
      `python3.11 "${GWORKSPACE_SCRIPT}" drive list --max-results 1`,
      { encoding: 'utf-8', timeout: 15000, maxBuffer: 1024 * 1024 }
    );
    return { success: true, message: `连接成功。${output.trim().split('\n')[0] || ''}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('invalid_grant') || msg.includes('Token has been expired'))
      return { success: false, message: 'OAuth Token 已过期，请重新授权: python3.11 ~/.cursor/skills/google-workspace/scripts/auth.py' };
    if (msg.includes('No such file'))
      return { success: false, message: 'client_secret.json 未找到，请检查路径配置' };
    return { success: false, message: msg.slice(0, 200) };
  }
}
