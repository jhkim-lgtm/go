#!/usr/bin/env python3
"""고정주소 리다이렉트 갱신기.

각 로컬 앱의 quick tunnel URL(public_url.txt)을 읽어
https://jhkim-lgtm.github.io/go/<slug>/ 리다이렉트 페이지를 다시 쓰고,
바뀐 게 있으면 commit + push 한다. launchd 5분 주기.
"""
import os, re, subprocess, sys
import urllib.request
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
GUARD = "/Users/bk/sales-agent/scripts/git_connection_guard/guard.py"


def valid_tunnel_url(url):
    """Quick-tunnel service hosts only: api.trycloudflare.com is not an app."""
    return re.fullmatch(
        r"https://[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/?", url
    ) is not None


def reachable(url, slug):
    """Keep the last published URL until its replacement actually serves the app."""
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            if response.status != 200:
                return False
            if slug == "mfk":
                html = response.read(100000).decode("utf-8", errors="replace")
                return "<title>MFK 인플루언서 허브</title>" in html and 'name="password"' not in html
            return True
    except Exception as exc:
        print(f"{slug}: 새 연결 확인 대기 ({type(exc).__name__})", file=sys.stderr)
        return False

SERVICES = [
    ("mirror", "1%CLUB 글로벌 미러링",
     "/Users/bk/sales-agent/global-mirror/hub/public_url.txt"),
    ("mfk", "MFK 인플루언서 수집",
     "/Users/bk/orca/workspaces/sales-agent/MFK-인플루언서-크롤링/mfk-influencer-hub/data/public_url.txt"),
    ("influencer", "한국거주 외국인 인플루언서 허브",
     "/Users/bk/orca/workspaces/sales-agent/인플루언서찾기/webapp/public_url.txt"),
    ("ads", "1%CLUB 광고 관리자",
     "/Users/bk/orca/workspaces/sales-agent/메타ad-자동화/meta-ad-admin/data/public_url.txt"),
    ("scout", "SCOUT/IG 인스타 계정 판독기",
     "/Users/bk/orca/workspaces/sales-agent/인스타-계정-판독기/instagram-audit/public_url.txt"),
]

# 2026-08-18: Tailscale Funnel이 일부 사내망/통신망에서 차단돼(직원 접속 불가)
# 모든 서비스를 trycloudflare 동적 리졸버로 전환. 고정 주소가 다시 생기면 여기에 추가.
STATIC_SERVICES = []

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
    changed_paths = []
    for slug, title, url_file in SERVICES:
        try:
            url = Path(url_file).read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if not valid_tunnel_url(url):
            print(f"{slug}: 서비스 주소가 아니므로 기존 고정 링크 유지", file=sys.stderr)
            continue
        slug_dir = os.path.join(HERE, slug)
        os.makedirs(slug_dir, exist_ok=True)
        # 1) 실제 주소는 url.txt에만 둔다(회전 시 이 파일만 바뀜).
        url_dest = os.path.join(slug_dir, "url.txt")
        old_url = Path(url_dest).read_text(encoding="utf-8") if os.path.exists(url_dest) else ""
        if url != old_url and not reachable(url, slug):
            continue
        if url != old_url:
            Path(url_dest).write_text(url, encoding="utf-8")
            changed_paths.append(os.path.relpath(url_dest, HERE))
        # 2) index.html은 주소 없는 고정 리졸버(내용 불변 → 재배포 거의 없음).
        dest = os.path.join(slug_dir, "index.html")
        html = RESOLVER.format(title=title)
        old = Path(dest).read_text(encoding="utf-8") if os.path.exists(dest) else ""
        if html != old:
            Path(dest).write_text(html, encoding="utf-8")
            changed_paths.append(os.path.relpath(dest, HERE))
    for slug, title, url in STATIC_SERVICES:
        dest = os.path.join(HERE, slug, "index.html")
        html = PAGE.format(title=title, url=url)
        old = Path(dest).read_text(encoding="utf-8") if os.path.exists(dest) else ""
        if html != old:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            Path(dest).write_text(html, encoding="utf-8")
            changed_paths.append(os.path.relpath(dest, HERE))
    run = lambda *a: subprocess.run(a, cwd=HERE, capture_output=True, text=True)
    if changed_paths:
        r = run("git", "add", "--", *changed_paths)
        if r.returncode != 0:
            raise RuntimeError(r.stderr)
        r = run("git", "commit", "--only", "-m", "터널 주소 갱신", "--", *changed_paths)
        if r.returncode != 0:
            raise RuntimeError(r.stderr)
    # push 실패 뒤에도 다음 주기에 재시도한다. 파일 변경 유무와 분리한다.
    pending = run("git", "rev-list", "--count", "origin/main..HEAD")
    if pending.returncode != 0:
        raise RuntimeError(pending.stderr)
    if int(pending.stdout.strip() or "0"):
        check = run("/usr/bin/python3", GUARD, "preflight")
        if check.returncode != 0:
            print("고정 링크 배포 연결 확인 대기 — 다음 주기 자동 재시도", file=sys.stderr)
            print(check.stdout or check.stderr, file=sys.stderr)
            return
        p = run("git", "push", "origin", "main")
        if p.returncode != 0:
            print(p.stderr, file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
