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


def main():
    changed = False
    for slug, title, url_file in SERVICES:
        try:
            url = open(url_file, encoding="utf-8").read().strip()
        except OSError:
            continue
        if not url.startswith("https://"):
            continue
        dest = os.path.join(HERE, slug, "index.html")
        html = PAGE.format(title=title, url=url)
        old = open(dest, encoding="utf-8").read() if os.path.exists(dest) else ""
        if html != old:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
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
