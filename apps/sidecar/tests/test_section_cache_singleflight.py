"""PERF-02: section-cache singleflight shares one build across concurrent misses."""

from __future__ import annotations

import threading
import time
import unittest
from typing import Any

from orcai_desktop_sidecar.runtime_state import section_cache_get_or_build


class TestSectionCacheSingleflight(unittest.TestCase):
    def test_concurrent_misses_share_one_builder(self) -> None:
        cache: dict[str, tuple[float, dict[str, Any]]] = {}
        lock = threading.Lock()
        builds = {"n": 0}
        started = threading.Barrier(4)
        release_build = threading.Event()

        def builder() -> dict[str, Any]:
            builds["n"] += 1
            release_build.wait(timeout=2.0)
            return {"n": builds["n"]}

        results: list[dict[str, Any]] = []
        errors: list[BaseException] = []

        def worker() -> None:
            started.wait(timeout=2.0)
            try:
                results.append(
                    section_cache_get_or_build(
                        cache,
                        "k",
                        builder,
                        lock=lock,
                        ttl=4.0,
                    )
                )
            except BaseException as exc:  # noqa: BLE001 — collect for assert
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for thread in threads:
            thread.start()
        # Let all four hit the miss path before the leader finishes.
        time.sleep(0.05)
        release_build.set()
        for thread in threads:
            thread.join(timeout=2.0)

        self.assertEqual(errors, [])
        self.assertEqual(builds["n"], 1)
        self.assertEqual(len(results), 4)
        self.assertTrue(all(item is results[0] for item in results))
        self.assertIn("k", cache)

    def test_fresh_bypasses_warm_hit(self) -> None:
        cache: dict[str, tuple[float, dict[str, Any]]] = {}
        lock = threading.Lock()
        builds = {"n": 0}

        def builder() -> dict[str, Any]:
            builds["n"] += 1
            return {"n": builds["n"]}

        first = section_cache_get_or_build(cache, "k", builder, lock=lock, ttl=4.0)
        second = section_cache_get_or_build(cache, "k", builder, lock=lock, ttl=4.0)
        fresh = section_cache_get_or_build(
            cache, "k", builder, lock=lock, ttl=4.0, fresh=True
        )
        self.assertEqual(first["n"], 1)
        self.assertEqual(second["n"], 1)
        self.assertEqual(fresh["n"], 2)
        self.assertEqual(builds["n"], 2)

    def test_builder_failure_is_not_cached(self) -> None:
        cache: dict[str, tuple[float, dict[str, Any]]] = {}
        lock = threading.Lock()

        def boom() -> dict[str, Any]:
            raise OSError("disk")

        with self.assertRaises(OSError):
            section_cache_get_or_build(cache, "k", boom, lock=lock, ttl=4.0)
        self.assertNotIn("k", cache)

        ok = section_cache_get_or_build(
            cache, "k", lambda: {"ok": True}, lock=lock, ttl=4.0
        )
        self.assertEqual(ok, {"ok": True})
        with self.assertRaises(OSError):
            section_cache_get_or_build(cache, "k", boom, lock=lock, ttl=4.0, fresh=True)
        self.assertEqual(cache["k"][1], {"ok": True})


if __name__ == "__main__":
    unittest.main()
