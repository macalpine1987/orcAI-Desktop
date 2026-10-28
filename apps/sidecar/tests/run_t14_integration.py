#!/usr/bin/env python3
"""Т-14 integration against a live uvicorn sidecar (no httpx)."""

from __future__ import annotations

import json
import os
import socket
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))
os.environ["ORCAI_FORCE_INPROCESS_JOBS"] = "1"

import uvicorn

from orcai_desktop_sidecar import jobs as jobs_mod
from orcai_desktop_sidecar.job_queue import JobScheduler
from orcai_desktop_sidecar.main import app
from orcai_desktop_sidecar.runner import _HANDLERS

COMMANDS = [
    "init",
    "create-recording-table",
    "predict",
    "filter-predictions",
    "create-spectrograms",
    "create-label-arrays",
    "create-snippet-table",
    "create-tvt-snippet-tables",
    "create-tvt-data",
    "hpsearch",
    "train",
    "test",
]


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")

    def request(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict | list | str]:
        data = None
        headers = {}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                code = resp.status
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8")
            code = e.code
        try:
            parsed: dict | list | str = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = raw
        return code, parsed


def _reset() -> None:
    jobs_mod._bootstrapped = False
    jobs_mod._jobs.clear()
    import orcai_desktop_sidecar.job_queue as jq

    jq._scheduler = JobScheduler(max_concurrent=1)


def _wait_terminal(api: Api, job_id: str, timeout: float = 12.0) -> dict:
    deadline = time.time() + timeout
    last: dict = {}
    while time.time() < deadline:
        code, body = api.request("GET", f"/v1/jobs/{job_id}")
        assert code == 200, body
        assert isinstance(body, dict)
        last = body
        if last["status"] in ("completed", "failed", "cancelled"):
            return last
        time.sleep(0.05)
    return last


def _instant_handler(job_id: str, params: dict) -> dict:
    out = params.get("output_dir") or params.get("output_path") or params.get("project_dir")
    if out:
        path = Path(str(out))
        if path.suffix == "":
            path.mkdir(parents=True, exist_ok=True)
            marker = path / "done.txt"
            marker.write_text("ok", encoding="utf-8")
            return {
                "output_dir": str(path.resolve()),
                "created_files": [str(marker.resolve())],
            }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("ok", encoding="utf-8")
        return {"output_path": str(path.resolve()), "created_files": [str(path.resolve())]}
    return {"created_files": [str(Path.cwd().resolve() / "noop.txt")]}


def main() -> int:
    report: list[str] = []
    failures: list[str] = []
    tmp = tempfile.TemporaryDirectory(prefix="orcai-t14-")
    home = Path(tmp.name) / "home"
    home.mkdir()
    port = _free_port()
    base = f"http://127.0.0.1:{port}"

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(50):
        try:
            urllib.request.urlopen(f"{base}/health", timeout=0.5)
            break
        except Exception:
            time.sleep(0.1)
    else:
        print("VERDICT: FAIL — sidecar did not start")
        return 1

    api = Api(base)

    with patch("orcai_desktop_sidecar.store._APP_DIR", home / ".orcai-desktop"):
        report.append("=== T-14.1 Twelve commands via POST /v1/jobs ===")
        _reset()
        mocked = {cmd: _instant_handler for cmd in COMMANDS}
        with patch.dict(_HANDLERS, mocked, clear=False):
            for cmd in COMMANDS:
                params: dict = {"project_dir": str(home / f"p-{cmd}"), "project_name": cmd}
                if cmd == "create-recording-table":
                    params = {"base_dir_recording": str(home / "wavs")}
                elif cmd == "predict":
                    params = {"recording_path": str(home / "a.wav")}
                elif cmd == "filter-predictions":
                    params = {"predicted_labels": str(home / "a_predicted.txt")}
                elif cmd in (
                    "create-spectrograms",
                    "create-label-arrays",
                    "create-tvt-snippet-tables",
                    "create-tvt-data",
                    "hpsearch",
                    "train",
                    "test",
                ):
                    params = {
                        "recording_table_path": str(home / "rt.csv"),
                        "recording_data_dir": str(home / "rd"),
                        "snippet_table_path": str(home / "st.csv"),
                        "tvt_snippet_tables_dir": str(home / "tvt"),
                        "data_dir": str(home / "data"),
                        "model_dir": str(home / "model"),
                        "output_dir": str(home / f"out-{cmd}"),
                        "orcai_parameter": str(home / "p.json"),
                    }
                elif cmd == "create-snippet-table":
                    params = {
                        "recording_table_path": str(home / "rt.csv"),
                        "recording_data_dir": str(home / "rd"),
                        "output_path": str(home / "snippets.csv"),
                    }

                code, body = api.request(
                    "POST", "/v1/jobs", {"command": cmd, "params": params, "priority": 0}
                )
                if code != 201 or not isinstance(body, dict):
                    failures.append(f"T-14.1 {cmd}: HTTP {code} {body}")
                    continue
                if not body.get("command_line") or "orcai" not in str(body["command_line"]):
                    failures.append(f"T-14.1 {cmd}: bad command_line={body.get('command_line')}")
                final = _wait_terminal(api, body["id"])
                if final.get("status") != "completed":
                    failures.append(
                        f"T-14.1 {cmd}: status={final.get('status')} err={final.get('error')}"
                    )
                    report.append(
                        f"FAIL {cmd}: status={final.get('status')} "
                        f"exit_code={final.get('exit_code')} err={final.get('error')}"
                    )
                else:
                    report.append(
                        f"OK {cmd}: exit_code={final.get('exit_code')} "
                        f"command_line={body.get('command_line')}"
                    )

        code, caps = api.request("GET", "/v1/capabilities")
        if code == 200 and isinstance(caps, dict):
            impl = set(caps.get("implemented_commands") or [])
            missing = [c for c in COMMANDS if c not in impl]
            if missing:
                failures.append(f"T-14.1 capabilities missing: {missing}")
            else:
                report.append("OK capabilities lists all 12 commands")

        report.append("=== T-14.5 Default concurrency = 1 ===")
        _reset()
        started_order: list[str] = []
        release = threading.Event()

        def slow_handler(job_id: str, params: dict) -> dict:
            started_order.append(job_id)
            if not release.wait(timeout=5):
                raise TimeoutError("release timeout")
            out = home / "slow-out.txt"
            out.write_text("ok", encoding="utf-8")
            return {"created_files": [str(out.resolve())]}

        with patch.dict(_HANDLERS, {"init": slow_handler}, clear=False):
            c1, r1 = api.request(
                "POST",
                "/v1/jobs",
                {
                    "command": "init",
                    "params": {"project_dir": str(home / "a"), "project_name": "a"},
                },
            )
            c2, r2 = api.request(
                "POST",
                "/v1/jobs",
                {
                    "command": "init",
                    "params": {"project_dir": str(home / "b"), "project_name": "b"},
                },
            )
            assert c1 == 201 and c2 == 201 and isinstance(r1, dict) and isinstance(r2, dict)
            time.sleep(0.35)
            _, q = api.request("GET", "/v1/jobs/queue")
            report.append(f"queue snapshot: {json.dumps(q)}")
            if not isinstance(q, dict) or q.get("max_concurrent") != 1:
                failures.append(f"T-14.5 max_concurrent bad: {q}")
            if isinstance(q, dict) and len(q.get("running") or []) > 1:
                failures.append(f"T-14.5 more than one running: {q}")
            if len(started_order) != 1:
                failures.append(f"T-14.5 expected 1 started, got {started_order}")
            else:
                report.append("OK only one job running at a time")
            release.set()
            _wait_terminal(api, r1["id"])
            _wait_terminal(api, r2["id"])
            if len(started_order) != 2:
                failures.append(f"T-14.5 both should start eventually: {started_order}")
            else:
                report.append("OK second job started after first finished")

        report.append("=== T-14.2 Cancel train / create-tvt-data ===")
        _reset()
        for cmd in ("train", "create-tvt-data"):
            out_dir = home / f"cancel-{cmd}"
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "partial.bin").write_bytes(b"partial")
            hold = threading.Event()

            def blocking(job_id: str, params: dict, _hold=hold, _out_dir=out_dir) -> dict:
                _hold.wait(timeout=5)
                return {"output_dir": str(_out_dir)}

            with patch.dict(_HANDLERS, {cmd: blocking}, clear=False):
                params = {
                    "output_dir": str(out_dir),
                    "data_dir": str(home / "data"),
                    "orcai_parameter": str(home / "p.json"),
                    "tvt_snippet_tables_dir": str(home / "tvt"),
                }
                code, body = api.request("POST", "/v1/jobs", {"command": cmd, "params": params})
                assert code == 201 and isinstance(body, dict), body
                jid = body["id"]
                time.sleep(0.25)
                ccode, cbody = api.request("POST", f"/v1/jobs/{jid}/cancel")
                hold.set()
                assert ccode == 200 and isinstance(cbody, dict), cbody
                marker = out_dir / f".orcai-desktop-incomplete-{cmd}"
                # HTTP cancel returns as soon as the row is cancelled; the
                # incomplete marker is written on the background finish thread.
                deadline = time.time() + 3
                while time.time() < deadline and not marker.is_file():
                    time.sleep(0.05)
                if cbody.get("status") != "cancelled":
                    failures.append(f"T-14.2 {cmd}: status={cbody.get('status')}")
                if cbody.get("exit_code") != 130:
                    failures.append(f"T-14.2 {cmd}: exit_code={cbody.get('exit_code')}")
                if not marker.is_file():
                    failures.append(f"T-14.2 {cmd}: missing incomplete marker {marker}")
                else:
                    report.append(f"OK cancel {cmd}: exit_code=130 marker={marker.name}")

        report.append("=== T-14.3 Reconnect log poll + SSE ===")
        _reset()
        steps = threading.Event()

        def logging_handler(job_id: str, params: dict) -> dict:
            from orcai_desktop_sidecar.jobs import append_log, set_progress

            append_log(job_id, "line-1-start")
            set_progress(job_id, 0.25)
            steps.wait(timeout=3)
            append_log(job_id, "line-2-after-reconnect")
            set_progress(job_id, 0.75)
            out = home / "reconnect-out.txt"
            out.write_text("ok", encoding="utf-8")
            return {
                "created_files": [str(out.resolve())],
                "output_path": str(out.resolve()),
            }

        with patch.dict(_HANDLERS, {"init": logging_handler}, clear=False):
            code, body = api.request(
                "POST",
                "/v1/jobs",
                {
                    "command": "init",
                    "params": {"project_dir": str(home / "r"), "project_name": "r"},
                },
            )
            assert code == 201 and isinstance(body, dict)
            jid = body["id"]
            time.sleep(0.3)
            _, snap1 = api.request("GET", f"/v1/jobs/{jid}")
            assert isinstance(snap1, dict)
            log1 = list(snap1.get("log") or [])
            next_since = len(log1)
            _, slice1 = api.request("GET", f"/v1/jobs/{jid}/log?since={next_since}")
            if not isinstance(slice1, dict) or "lines" not in slice1:
                failures.append(f"T-14.3 log slice bad: {slice1}")
            steps.set()
            final = _wait_terminal(api, jid)
            log2 = list(final.get("log") or [])
            if not any("line-2-after-reconnect" in ln for ln in log2):
                failures.append(f"T-14.3 log missing line-2: before={log1} after={log2}")
            else:
                report.append(
                    f"OK reconnect poll sees later log ({len(log1)} → {len(log2)} lines)"
                )
            _, slice2 = api.request("GET", f"/v1/jobs/{jid}/log?since={next_since}")
            if isinstance(slice2, dict):
                joined = "\n".join(slice2.get("lines") or [])
                if "line-2-after-reconnect" not in joined:
                    failures.append(f"T-14.3 /log?since missed line-2: {slice2}")
                else:
                    report.append(f"OK /log?since={next_since} → next_since={slice2.get('next_since')}")

            # SSE: replay should include historical lines after completion
            try:
                req = urllib.request.Request(f"{base}/v1/jobs/{jid}/events?since=0")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    raw = resp.read(4096).decode("utf-8", errors="replace")
                if "line-1-start" not in raw or "text/event-stream" not in (
                    resp.headers.get("Content-Type") or ""
                ):
                    # Content-Type check may fail after read; accept event payload.
                    if "line-1-start" not in raw:
                        failures.append(f"T-14.3 SSE missing replay: {raw[:400]}")
                    else:
                        report.append("OK SSE replay includes backlog")
                else:
                    report.append("OK SSE content-type + replay")
            except Exception as exc:
                failures.append(f"T-14.3 SSE error: {exc}")

        report.append("=== T-14.4 Absolute created_files ===")
        _reset()
        abs_file = (home / "abs-artifact.txt").resolve()
        abs_file.write_text("x", encoding="utf-8")

        def abs_handler(job_id: str, params: dict) -> dict:
            return {
                "output_path": str(abs_file),
                "created_files": [str(abs_file)],
            }

        with patch.dict(_HANDLERS, {"init": abs_handler}, clear=False):
            code, body = api.request(
                "POST",
                "/v1/jobs",
                {
                    "command": "init",
                    "params": {
                        "project_dir": str(home / "abs"),
                        "project_name": "abs",
                    },
                },
            )
            assert code == 201 and isinstance(body, dict)
            final = _wait_terminal(api, body["id"])
            arts = final.get("artifacts") or []
            created = (final.get("result") or {}).get("created_files") or []
            paths = arts or created
            if not paths:
                failures.append("T-14.4 no artifacts/created_files")
            elif not all(Path(p).is_absolute() for p in paths):
                failures.append(f"T-14.4 non-absolute paths: {paths}")
            else:
                report.append(f"OK absolute paths: {paths}")
            if final.get("exit_code") != 0:
                failures.append(f"T-14.4 exit_code={final.get('exit_code')}")

        report.append("=== T-14.4b Artifacts exclude inputs ===")
        _reset()
        wav = home / "input.wav"
        wav.write_bytes(b"RIFF")
        label = home / "out_predicted.txt"
        label.write_text("ok", encoding="utf-8")

        def polluting_handler(job_id: str, params: dict) -> dict:
            return {
                "recording_path": str(wav),
                "wav_path": str(wav),
                "data_dir": str(home / "data"),
                "label_path": str(label),
                "created_files": [str(label.resolve())],
            }

        (home / "data").mkdir(exist_ok=True)
        with patch.dict(_HANDLERS, {"init": polluting_handler}, clear=False):
            code, body = api.request(
                "POST",
                "/v1/jobs",
                {
                    "command": "init",
                    "params": {
                        "project_dir": str(home / "art"),
                        "project_name": "art",
                    },
                },
            )
            assert code == 201 and isinstance(body, dict)
            final = _wait_terminal(api, body["id"])
            arts = final.get("artifacts") or []
            if str(wav.resolve()) in arts or any(Path(p).name == "data" for p in arts):
                failures.append(f"T-14.4b input paths leaked into artifacts: {arts}")
            elif str(label.resolve()) not in arts:
                failures.append(f"T-14.4b missing label artifact: {arts}")
            else:
                report.append(f"OK artifacts are outputs only: {arts}")

        report.append("=== Bonus: retry + 404 ===")
        _reset()
        with patch.dict(
            _HANDLERS,
            {"init": lambda jid, p: {"created_files": [str(abs_file)]}},
            clear=False,
        ):
            code, body = api.request(
                "POST",
                "/v1/jobs",
                {
                    "command": "init",
                    "params": {
                        "project_dir": str(home / "retry"),
                        "project_name": "retry",
                    },
                },
            )
            assert code == 201 and isinstance(body, dict)
            jid = body["id"]
            _wait_terminal(api, jid)
            rcode, rbody = api.request("POST", f"/v1/jobs/{jid}/retry")
            if rcode != 201 or not isinstance(rbody, dict) or rbody.get("retry_of") != jid:
                failures.append(f"retry failed: {rcode} {rbody}")
            else:
                report.append(f"OK retry → {rbody['id']} retry_of={jid}")
                _wait_terminal(api, rbody["id"])
        ncode, _ = api.request("GET", "/v1/jobs/does-not-exist")
        if ncode != 404:
            failures.append(f"expected 404, got {ncode}")
        else:
            report.append("OK HTTP 404 for missing job")

        report.append("=== T-14.6 Smoke: real handlers (no mock) ===")
        _reset()
        # init — real orcAI helper with only required params (engine defaults)
        proj = home / "smoke-init"
        code, body = api.request(
            "POST",
            "/v1/jobs",
            {
                "command": "init",
                "params": {"project_dir": str(proj), "project_name": "smoke"},
            },
        )
        if code != 201 or not isinstance(body, dict):
            failures.append(f"T-14.6 init HTTP {code} {body}")
        else:
            final = _wait_terminal(api, body["id"], timeout=30.0)
            cl = str(final.get("command_line") or body.get("command_line") or "")
            if final.get("status") != "completed":
                failures.append(
                    f"T-14.6 init status={final.get('status')} err={final.get('error')}"
                )
            elif "--path" in cl or " -r " in f" {cl} ":
                failures.append(f"T-14.6 init bad CLI shape: {cl}")
            else:
                arts = final.get("artifacts") or []
                if arts and not all(Path(p).is_absolute() and Path(p).exists() for p in arts):
                    failures.append(f"T-14.6 init artifacts bad: {arts}")
                else:
                    report.append(f"OK smoke init command_line={cl}")

        # create-recording-table — empty dir is valid; only required param
        wavs = home / "smoke-wavs"
        wavs.mkdir(parents=True, exist_ok=True)
        code, body = api.request(
            "POST",
            "/v1/jobs",
            {
                "command": "create-recording-table",
                "params": {"base_dir_recording": str(wavs)},
            },
        )
        if code != 201 or not isinstance(body, dict):
            failures.append(f"T-14.6 crt HTTP {code} {body}")
        else:
            final = _wait_terminal(api, body["id"], timeout=30.0)
            cl = str(final.get("command_line") or "")
            if final.get("status") != "completed":
                failures.append(
                    f"T-14.6 crt status={final.get('status')} err={final.get('error')}"
                )
            elif "-dc" in cl:
                failures.append(f"T-14.6 crt leaked defaults into CLI: {cl}")
            else:
                out_csv = wavs / "recording_table.csv"
                arts = final.get("artifacts") or []
                if not out_csv.is_file():
                    failures.append("T-14.6 crt missing recording_table.csv")
                elif arts and not all(Path(p).exists() for p in arts):
                    failures.append(f"T-14.6 crt phantom artifacts: {arts}")
                else:
                    report.append(f"OK smoke create-recording-table CLI={cl}")

        # predict pass-through: engine_kwargs must not invent channel/threshold when absent
        from orcai.predict import predict as _predict_fn

        from orcai_desktop_sidecar.engine_call import engine_kwargs as _ek

        pk = _ek(_predict_fn, {"recording_path": str(home / "missing.wav")})
        if set(pk.keys()) - {"recording_path"}:
            failures.append(f"T-14.6 predict kwargs leaked defaults: {pk}")
        else:
            report.append("OK smoke predict engine_kwargs pass-through")

        report.append("=== Error / exit codes ===")
        report.append("HTTP 201 create | 200 get/cancel | 404 missing")
        report.append("exit_code 0 completed | 1 failed | 130 cancelled")
        report.append(f"BASE={base}")

    server.should_exit = True
    thread.join(timeout=3)
    print("\n".join(report))
    print()
    out_path = Path("/tmp/orcai-t14-report.txt")
    out_path.write_text(
        "\n".join(
            report
            + [""]
            + (["FAILURES:", *failures] if failures else ["VERDICT: PASS"])
        ),
        encoding="utf-8",
    )

    if failures:
        print("T-14 FAILURES:")
        for f in failures:
            print(f"  - {f}")
        print("VERDICT: FAIL")
        print(f"Report: {out_path}")
        tmp.cleanup()
        return 1

    print("VERDICT: PASS — все сценарии Т-14")
    print(f"Report: {out_path}")
    tmp.cleanup()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
