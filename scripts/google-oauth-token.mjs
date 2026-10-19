#!/usr/bin/env node
/**
 * Google Drive 업로드용 OAuth 리프레시 토큰 발급 (1회 · 소유자 계정으로 동의)
 *
 * 배경(2026-10-19): 서비스 계정은 My Drive 저장 용량이 없어 files.create가 403(storageQuotaExceeded)로 실패.
 * 첨부 업로드만 드라이브 소유자(seochowomen1@gmail.com)의 OAuth 토큰으로 수행한다.
 *
 * 사용:
 *   node scripts/google-oauth-token.mjs <client_secret_xxx.json 경로>
 *   (GCP 콘솔 → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(데스크톱 앱) → JSON 다운로드)
 *
 * 동작:
 *   1) 127.0.0.1:53682 루프백 서버를 띄우고 동의 URL을 출력(기본 브라우저로 자동 열기)
 *   2) 소유자 계정으로 로그인·동의 → 리다이렉트로 code 수신 → 토큰 교환
 *   3) 결과를 .google-oauth.local.json(gitignore)에 저장 — 콘솔에는 비밀값을 출력하지 않음
 *
 * 범위: drive.file (앱이 만든 파일·폴더만 접근 — 비민감 범위라 앱 검증 불필요)
 * ⚠️ OAuth 동의 화면 "게시 상태"가 테스트면 리프레시 토큰이 7일 뒤 만료 → 반드시 "프로덕션"으로 게시
 */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const PORT = 53682;
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const OUT = path.resolve(process.cwd(), ".google-oauth.local.json");

function loadClient(file) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const c = j.installed ?? j.web ?? j;
  if (!c.client_id || !c.client_secret) throw new Error("client_id / client_secret 를 찾을 수 없습니다. (데스크톱 앱 OAuth 클라이언트 JSON인지 확인)");
  return { client_id: c.client_id, client_secret: c.client_secret };
}

function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        try {
          const j = JSON.parse(data);
          if (res.statusCode !== 200) reject(new Error(`토큰 교환 실패 ${res.statusCode}: ${j.error} ${j.error_description ?? ""}`));
          else resolve(j);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function openBrowser(url) {
  try {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch { /* 수동으로 열도록 URL은 이미 출력됨 */ }
}

async function main() {
  const file = process.argv[2];
  if (!file) { console.error("사용: node scripts/google-oauth-token.mjs <client_secret.json>"); process.exit(1); }
  const client = loadClient(file);
  const redirect = `http://127.0.0.1:${PORT}/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", client.client_id);
  authUrl.searchParams.set("redirect_uri", redirect);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    if (u.pathname !== "/callback") { res.writeHead(404); res.end(); return; }
    const code = u.searchParams.get("code");
    const st = u.searchParams.get("state");
    const err = u.searchParams.get("error");
    if (err || !code || st !== state) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h2>동의 실패</h2><p>${err ?? "code/state 불일치"}</p>`);
      return;
    }
    try {
      const tok = await postForm("https://oauth2.googleapis.com/token", {
        code, client_id: client.client_id, client_secret: client.client_secret, redirect_uri: redirect, grant_type: "authorization_code",
      });
      if (!tok.refresh_token) throw new Error("refresh_token이 응답에 없습니다. (이미 동의한 적이 있으면 계정 보안 → 서드파티 액세스에서 앱을 제거하고 다시 시도)");
      fs.writeFileSync(OUT, JSON.stringify({
        GOOGLE_OAUTH_CLIENT_ID: client.client_id,
        GOOGLE_OAUTH_CLIENT_SECRET: client.client_secret,
        GOOGLE_OAUTH_REFRESH_TOKEN: tok.refresh_token,
        scope: tok.scope, issuedAt: new Date().toISOString(),
      }, null, 2), { encoding: "utf8", mode: 0o600 });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h2>완료</h2><p>토큰이 저장되었습니다. 이 창을 닫아도 됩니다.</p>");
      console.log(`\n✅ 리프레시 토큰 저장: ${OUT}\n   (파일은 gitignore · Vercel env 등록 후 삭제 권장)`);
      setTimeout(() => { server.close(); process.exit(0); }, 500);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h2>토큰 교환 실패</h2><p>${String(e.message ?? e)}</p>`);
      console.error("❌", e.message ?? e);
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log("브라우저에서 드라이브 소유자 계정(seochowomen1@gmail.com)으로 로그인해 동의해 주세요.");
    console.log("동의 URL:\n" + authUrl.toString() + "\n");
    openBrowser(authUrl.toString());
    console.log(`대기 중… (http://127.0.0.1:${PORT}/callback 수신 대기 · Ctrl+C 로 취소)`);
  });
}

main().catch((e) => { console.error("❌", e.message ?? e); process.exit(1); });
