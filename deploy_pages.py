"""通过 GitHub REST API 发布此目录到独立的 GitHub Pages 仓库。

凭据只从当前命令的 GITHUB_TOKEN 环境变量读取，不写入文件或输出。
运行：run-with-env shadow-blade -- python3 deploy_pages.py
"""

import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
OWNER = "xiaokai2810"
REPO = "huazhuan-wuyu-helper"
FILES = (
    "index.html",
    "style.css",
    "engine.js",
    "app.js",
    "花砖物语助手.html",
    "README.md",
    "engine.test.js",
    "build_standalone.py",
    "deploy_pages.py",
    "game-engine.js",
    "ai.js",
    "ai-worker.js",
    "game-ui.js",
    "game.css",
    "game.test.js",
    "package.json",
    "ai-benchmark.js",
)
BASE = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN")


def request(method, path, data=None, allowed=(200, 201, 204)):
    url = BASE + path
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8")
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "codex-azul-pages",
        "Authorization": "Bearer " + TOKEN,
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(req, timeout=30) as response:
            payload = response.read()
            return response.status, json.loads(payload) if payload else None
    except HTTPError as error:
        if error.code in allowed:
            payload = error.read()
            return error.code, json.loads(payload) if payload else None
        raise RuntimeError(f"GitHub API {method} {path} returned HTTP {error.code}") from None


def main():
    if not TOKEN:
        raise RuntimeError("GITHUB_TOKEN is missing")
    _, user = request("GET", "/user")
    if user["login"] != OWNER:
        raise RuntimeError("Connected GitHub account does not match the target owner")

    repo_path = f"/repos/{OWNER}/{REPO}"
    status, existing = request("GET", repo_path, allowed=(200, 404))
    if status == 404:
        _, existing = request("POST", "/user/repos", {
            "name": REPO,
            "description": "花砖物语（Azul）离线对局助手",
            "private": False,
            "auto_init": True,
        })
        print(f"created repository: {existing['html_url']}")
    elif existing.get("description") != "花砖物语（Azul）离线对局助手":
        raise RuntimeError("Repository name already belongs to another project")
    branch = existing["default_branch"]
    _, ref = request("GET", f"{repo_path}/git/ref/heads/{quote(branch)}")
    parent = ref["object"]["sha"]
    _, commit = request("GET", f"{repo_path}/git/commits/{parent}")
    _, tree = request("POST", f"{repo_path}/git/trees", {
        "base_tree": commit["tree"]["sha"],
        "tree": [{"path": name, "mode": "100644", "type": "blob", "content": (ROOT / name).read_text(encoding="utf-8")} for name in FILES],
    })
    _, new_commit = request("POST", f"{repo_path}/git/commits", {
        "message": "Add three-level AI matches alongside the position helper",
        "tree": tree["sha"], "parents": [parent],
    })
    request("PATCH", f"{repo_path}/git/refs/heads/{quote(branch)}", {"sha": new_commit["sha"], "force": False})
    print(f"published commit: {new_commit['sha']}")
    print(f"files: {len(FILES)}")

    pages_path = repo_path + "/pages"
    status, pages = request("GET", pages_path, allowed=(200, 404))
    if status == 404:
        _, pages = request("POST", pages_path, {
            "build_type": "legacy",
            "source": {"branch": branch, "path": "/"},
        })
        print("enabled GitHub Pages")
    else:
        print("GitHub Pages already enabled")
    page_url = pages.get("html_url") or f"https://{OWNER}.github.io/{REPO}/"
    request("PATCH", repo_path, {"homepage": page_url})
    print(f"pages_url: {page_url}")
    print(f"pages_status: {pages.get('status', 'pending')}")


if __name__ == "__main__":
    main()
