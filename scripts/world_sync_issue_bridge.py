#!/usr/bin/env python3
"""Apply a bounded World derivative envelope from a GitHub issue event."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

HEADER_PREFIX = "WORLD_ISSUE_ENVELOPE_V1 "
FILE_RE = re.compile(r'^<<<WORLD_FILE path="([^"]+)" expected_blob_sha="([^"]+)">>>$')
END_MARKER = "<<<END_WORLD_FILE>>>"
ALLOWED_PREFIXES = ("data/generated/world/",)
ALLOWED_SUFFIXES = (".json",)
MAX_FILES = 40
MAX_TOTAL_BYTES = 350_000


class BridgeError(RuntimeError):
    pass


def git(*args: str, cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=cwd, check=check, capture_output=True, text=True)


def current_blob_sha(root: Path, rel_path: str) -> str | None:
    result = git("rev-parse", f"HEAD:{rel_path}", cwd=root, check=False)
    return result.stdout.strip() if result.returncode == 0 else None


def is_ancestor(root: Path, observed: str) -> bool:
    return git("merge-base", "--is-ancestor", observed, "HEAD", cwd=root, check=False).returncode == 0


def parse_body(body: str) -> tuple[dict, list[dict]]:
    lines = body.splitlines()
    if not lines or not lines[0].startswith(HEADER_PREFIX):
        raise BridgeError("missing WORLD_ISSUE_ENVELOPE_V1 header")
    try:
        header = json.loads(lines[0][len(HEADER_PREFIX):])
    except json.JSONDecodeError as exc:
        raise BridgeError(f"invalid envelope header JSON: {exc}") from exc

    files: list[dict] = []
    i = 1
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        match = FILE_RE.match(line)
        if not match:
            raise BridgeError(f"unexpected envelope line {i + 1}: {line[:120]}")
        path, expected = match.groups()
        i += 1
        content_lines: list[str] = []
        while i < len(lines) and lines[i] != END_MARKER:
            content_lines.append(lines[i])
            i += 1
        if i >= len(lines):
            raise BridgeError(f"missing end marker for {path}")
        content = "\n".join(content_lines)
        if content_lines:
            content += "\n"
        files.append({"path": path, "expected_blob_sha": expected, "content": content})
        i += 1
    return header, files


def validate_header(event: dict, header: dict, root: Path) -> None:
    issue = event.get("issue") or {}
    repo = event.get("repository") or {}
    owner = ((repo.get("owner") or {}).get("login") or "").lower()
    author = ((issue.get("user") or {}).get("login") or "").lower()
    if not owner or author != owner:
        raise BridgeError(f"issue author must be repository owner; author={author!r} owner={owner!r}")
    if header.get("schema_version") != 1:
        raise BridgeError("schema_version must be 1")
    if header.get("target") != "VIDA":
        raise BridgeError("target must be VIDA")
    if header.get("authorization_scope") != "WORLD_SCHEDULED_PUBLICATION":
        raise BridgeError("authorization_scope must be WORLD_SCHEDULED_PUBLICATION")
    if not header.get("transaction_id"):
        raise BridgeError("transaction_id is required")

    pas_commit = str(header.get("pas_commit") or "")
    if not re.fullmatch(r"[0-9a-f]{40}", pas_commit):
        raise BridgeError("pas_commit must be a full lowercase commit SHA")

    observed = str(header.get("observed_main_sha") or "")
    if not re.fullmatch(r"[0-9a-f]{40}", observed):
        raise BridgeError("observed_main_sha must be a full lowercase commit SHA")
    if not is_ancestor(root, observed):
        raise BridgeError("observed_main_sha is not an ancestor of current HEAD")


def validate_file_entry(root: Path, entry: dict) -> None:
    path = entry["path"]
    expected = entry["expected_blob_sha"]
    content = entry["content"]
    p = Path(path)
    if p.is_absolute() or ".." in p.parts:
        raise BridgeError(f"unsafe path: {path}")
    if not any(path.startswith(prefix) for prefix in ALLOWED_PREFIXES):
        raise BridgeError(f"path outside World derivative boundary: {path}")
    if not path.endswith(ALLOWED_SUFFIXES):
        raise BridgeError(f"unsupported file type: {path}")
    if END_MARKER in content:
        raise BridgeError(f"reserved marker present in file content: {path}")

    actual = current_blob_sha(root, path)
    if expected == "NEW":
        if actual is not None:
            raise BridgeError(f"{path}: expected NEW but file already exists")
    else:
        if not re.fullmatch(r"[0-9a-f]{40}", expected):
            raise BridgeError(f"{path}: invalid expected_blob_sha")
        if actual != expected:
            raise BridgeError(f"{path}: stale target blob; expected={expected} actual={actual or 'MISSING'}")
    try:
        json.loads(content)
    except json.JSONDecodeError as exc:
        raise BridgeError(f"{path}: invalid JSON: {exc}") from exc


def apply_files(root: Path, entries: list[dict]) -> None:
    if not entries:
        raise BridgeError("envelope contains no files")
    if len(entries) > MAX_FILES:
        raise BridgeError(f"too many files: {len(entries)} > {MAX_FILES}")
    total = sum(len(e["content"].encode("utf-8")) for e in entries)
    if total > MAX_TOTAL_BYTES:
        raise BridgeError(f"payload too large: {total} > {MAX_TOTAL_BYTES} bytes")
    if len({e["path"] for e in entries}) != len(entries):
        raise BridgeError("duplicate file paths in envelope")
    for entry in entries:
        validate_file_entry(root, entry)
    for entry in entries:
        dest = root / entry["path"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(entry["content"], encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--event", type=Path, required=True)
    ap.add_argument("--repo-root", type=Path, default=Path.cwd())
    args = ap.parse_args()

    root = args.repo_root.resolve()
    event = json.loads(args.event.read_text(encoding="utf-8"))
    issue = event.get("issue") or {}
    if not str(issue.get("title") or "").startswith("[WORLD_VIDA_SYNC]"):
        raise BridgeError("issue title must start with [WORLD_VIDA_SYNC]")

    header, entries = parse_body(str(issue.get("body") or ""))
    validate_header(event, header, root)
    apply_files(root, entries)

    surface_entry = next((e for e in entries if e["path"] == "data/generated/world/surface.json"), None)
    if surface_entry is not None:
        surface = json.loads(surface_entry["content"])
        source_commit = str(((surface.get("source") or {}).get("commit")) or "")
        if source_commit != header["pas_commit"]:
            raise BridgeError(
                f"surface source.commit={source_commit!r} does not match pas_commit={header['pas_commit']!r}"
            )

    print(json.dumps({
        "schema_version": 1,
        "transaction_id": header["transaction_id"],
        "pas_commit": header["pas_commit"],
        "dry_run": bool(header.get("dry_run")),
        "files": [e["path"] for e in entries],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
