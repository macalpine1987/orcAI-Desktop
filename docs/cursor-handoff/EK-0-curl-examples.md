# ЭК-0 / Т-14 — HTTP examples (sidecar contract)

Base URL: `http://127.0.0.1:<dynamic-port>` (from Desktop runtime).

## Enqueue (serial queue, concurrency = 1)

```bash
curl -sS -X POST "$BASE/v1/jobs" \
  -H 'Content-Type: application/json' \
  -d '{"command":"predict","params":{"recording_path":"/abs/path.wav"},"priority":0}'
```

Response includes `command_line` (upstream CLI shape: positionals + options),
`priority`, `artifacts`, `exit_code`, `progress`, `retry_of`.

`create-tvt-data` does **not** emit `-o` (engine has no `output_dir`).

## Queue snapshot

```bash
curl -sS "$BASE/v1/jobs/queue"
# {"max_concurrent":1,"running":["…"],"pending":["…"]}
```

## Status / reconnect (log survives poll)

```bash
curl -sS "$BASE/v1/jobs/<job_id>"
curl -sS "$BASE/v1/jobs/<job_id>/log?since=0"
# {"lines":[…],"next_since":N,"progress":…,"status":…}
```

## Live stream (SSE)

```bash
curl -sSN "$BASE/v1/jobs/<job_id>/events?since=0"
# event: log / progress / status / snapshot / ping
```

## Cancel (exit_code 130; partial cleanup / incomplete marker)

```bash
curl -sS -X POST "$BASE/v1/jobs/<job_id>/cancel"
```

## Retry

```bash
curl -sS -X POST "$BASE/v1/jobs/<job_id>/retry"
```

## Error codes

| Situation | HTTP | `exit_code` | `status` |
|-----------|------|-------------|----------|
| orcAI not installed | 503 | — | — |
| Job not found | 404 | — | — |
| Success | 200/201 | 0 | completed |
| Engine/exception | 200 (job record) | 1 | failed |
| Cancelled | 200 | 130 | cancelled |

## 12 commands

`init`, `create-recording-table`, `predict`, `filter-predictions`, `create-spectrograms`, `create-label-arrays`, `create-snippet-table`, `create-tvt-snippet-tables`, `create-tvt-data`, `hpsearch`, `train`, `test` — via `POST /v1/jobs` with `command` + `params`.
