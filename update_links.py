#!/usr/bin/env python3
"""고정주소 리다이렉트 갱신기.

각 로컬 앱의 quick tunnel URL(public_url.txt)을 읽어
https://jhkim-lgtm.github.io/go/<slug>/ 리다이렉트 페이지를 다시 쓰고,
바뀐 게 있으면 commit + push 한다. launchd 5분 주기.
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))

SERVICES = [
    ("mirror", "1%CLUB 글로벌 미러링",
     "/Users/bk/sales-agent/global-mirror/hub/public_url.txt"),
    ("mfk", "MFK 인플루언서 수집",
     "/Users/bk/orca/workspaces/sales-agent/MFK-인플루언서-크롤링/mfk-influencer-hub/data/public_url.txt"),
    ("influencer", "한국거주 외국인 인플루언서 허브",
     "/Users/bk/orca/workspaces/sales-agent/인플루언서찾기/webapp/public_url.txt"),
    ("ads", "1%CLUB 광고 관리자",
     "/Users/bk/orca/workspaces/sales-agent/메타ad-자동화/meta-ad-admin/data/public_url.txt"),
]

# Tailscale Funnel 주소는 Quick Tunnel과 달리 재시작해도 그대로다. 이 값이
# 바뀌더라도 카톡/즐겨찾기에는 아래 고정 wrapper 경로만 공유한다.
STATIC_SERVICES = [
    ("scout", "SCOUT/IG 인스타 계정 판독기",
     "https://bk-macmini.tail738f1c.ts.net:8443"),
]

PAGE = """<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>{title}</title>
<meta http-equiv="refresh" content="0;url={url}">
<script>location.replace("{url}");</script>
<style>body{{background:#101014;color:#c9a961;font-family:-apple-system,sans-serif;display:grid;place-items:center;height:100vh;margin:0}}a{{color:#c9a961}}</style>
</head><body><p>{title} 으로 이동 중… <a href="{url}">바로 열기</a></p></body></html>
"""

# 회전(quick tunnel) 서비스용 동적 리졸버. index.html은 주소를 담지 않아
# 절대 바뀌지 않으므로(→ 한 번 캐시되면 영구 유효), 회전해도 재배포 불필요.
# 실제 주소는 옆의 url.txt에 두고, 매 로드마다 캐시버스터로 새로 읽어
# 최신 허브로 보낸다. GitHub Pages 10분 캐시·브라우저 히스토리와 무관하게
# 항상 현재 허브로 접속된다(2026-08-12 접속 장애 재발방지).
RESOLVER = """<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>{title}</title>
<style>body{{background:#101014;color:#c9a961;font-family:-apple-system,sans-serif;display:grid;place-items:center;height:100vh;margin:0;text-align:center}}a{{color:#c9a961}}</style>
</head><body>
<p>{title} 으로 이동 중…</p>
<script>
(async function(){{
  try{{
    var r = await fetch('url.txt?cb=' + Date.now() + '_' + Math.random(), {{cache:'no-store'}});
    var u = (await r.text()).trim();
    if(u.indexOf('https://')===0){{ location.replace(u); return; }}
  }}catch(e){{}}
  document.body.insertAdjacentHTML('beforeend','<p style="color:#f87171">주소를 불러오지 못했습니다. 새로고침(⌘⇧R) 해주세요.</p>');
}})();
</script>
</body></html>
"""


def main():
    changed = False
    for slug, title, url_file in SERVICES:
        try:
            url = open(url_file, encoding="utf-8").read().strip()
        except OSError:
            continue
        if not url.startswith("https://"):
            continue
        slug_dir = os.path.join(HERE, slug)
        os.makedirs(slug_dir, exist_ok=True)
        # 1) 실제 주소는 url.txt에만 둔다(회전 시 이 파일만 바뀜).
        url_dest = os.path.join(slug_dir, "url.txt")
        old_url = open(url_dest, encoding="utf-8").read() if os.path.exists(url_dest) else ""
        if url != old_url:
            open(url_dest, "w", encoding="utf-8").write(url)
            changed = True
        # 2) index.html은 주소 없는 고정 리졸버(내용 불변 → 재배포 거의 없음).
        dest = os.path.join(slug_dir, "index.html")
        html = RESOLVER.format(title=title)
        old = open(dest, encoding="utf-8").read() if os.path.exists(dest) else ""
        if html != old:
            open(dest, "w", encoding="utf-8").write(html)
            changed = True
    for slug, title, url in STATIC_SERVICES:
        dest = os.path.join(HERE, slug, "index.html")
        html = PAGE.format(title=title, url=url)
        old = open(dest, encoding="utf-8").read() if os.path.exists(dest) else ""
        if html != old:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            open(dest, "w", encoding="utf-8").write(html)
            changed = True
    if not changed:
        return
    run = lambda *a: subprocess.run(a, cwd=HERE, capture_output=True, text=True)
    run("git", "add", "-A")
    r = run("git", "commit", "-m", "터널 주소 갱신")
    if r.returncode == 0:
        p = run("git", "push", "origin", "main")
        if p.returncode != 0:
            print(p.stderr, file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
