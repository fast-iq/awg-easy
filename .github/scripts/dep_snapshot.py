#!/usr/bin/env python3
"""Submit a Dependency Graph snapshot to GitHub.

GitHub's built-in JavaScript detector does not parse pnpm v10 lockfiles
(the `importers:` section of this repo's src/pnpm-lock.yaml carries no
dependency data), so Dependency Graph / Dependency Review / Dependabot
alerts would be empty without this submission. We submit the top-level
dependencies resolved in src/pnpm-lock.yaml as one manifest snapshot.

Usage: dep_snapshot.py <api_base> <repo> <package.json> <pnpm-lock.yaml>
Env:   GITHUB_TOKEN (or GH_TOKEN), GITHUB_SHA, GITHUB_REF
"""
import datetime
import json
import os
import re
import sys
import urllib.request


def main() -> int:
    api_base, repo, pkg_path, lock_path = sys.argv[1:5]
    pkg = json.load(open(pkg_path))
    manifest = set(pkg.get("dependencies", {})) | set(pkg.get("devDependencies", {}))

    lock = open(lock_path).read()
    # package entries look like: `  name@1.2.3(peer@x):` (quotes optional)
    resolved = {}
    for name, ver in re.findall(r"^  '?([^'@][^:@]*|@[^:']+?)@([^:']+)'?:", lock, re.M):
        base = ver.split("(")[0]
        if name in manifest and name not in resolved:
            resolved[name] = {"package_url": f"pkg:npm/{name}@{base}"}

    sha = os.environ.get("GITHUB_HEAD_SHA") or os.environ["GITHUB_SHA"]
    ref = os.environ.get("GITHUB_HEAD_REF_NAME") or os.environ.get("GITHUB_REF", "refs/heads/main")
    token = os.environ.get("GITHUB_TOKEN") or os.environ["GH_TOKEN"]

    body = {
        "version": 1,
        "sha": sha,
        "ref": ref,
        "job": {"correlator": "awg-easy dep-graph", "id": os.environ.get("GITHUB_RUN_ID", "manual")},
        "detector": {"name": "awg-easy-dep-snapshot", "version": "1.0",
                     "url": "https://github.com/fast-iq/awg-easy"},
        "scanned": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "manifests": {
            "pnpm-lock.yaml": {
                "name": "pnpm-lock.yaml",
                "file": {"source_location": "src/pnpm-lock.yaml"},
                "resolved": resolved,
            }
        },
    }
    req = urllib.request.Request(
        f"{api_base}/repos/{repo}/dependency-graph/snapshots",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/vnd.github+json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        print(f"submitted {len(resolved)} deps for {sha[:10]}: {resp.status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
