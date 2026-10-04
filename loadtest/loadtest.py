#!/usr/bin/env python3
"""
AcetaView load test (stdlib only, no installs).

Each virtual user behaves like a browser opening a case:
  1. GET the index page
  2. GET every frame of the case (axial/sagittal/coronal/3d_*) using
     6 parallel connections (browser per-host limit)
  3. Optional --scrub: afterwards re-request random frames fast (cache-bypass)
     to simulate fast scrolling.

Usage:
  python3 loadtest/loadtest.py --users 30
  python3 loadtest/loadtest.py --users 100 --case Case02 --scrub 200
  python3 loadtest/loadtest.py --users 30 --all-cases        # heavier
"""
import argparse, os, random, statistics, sys, threading, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lock = threading.Lock()
lat, errors, statuses, cache_hits, bytes_total = [], [], {}, {}, [0]


def frame_paths(case):
    out = []
    base = os.path.join(ROOT, "videos", case)
    for plane in sorted(os.listdir(base)):
        d = os.path.join(base, plane)
        if os.path.isdir(d):
            out += [f"/videos/{case}/{plane}/{f}" for f in sorted(os.listdir(d)) if f.lower().endswith((".jpg", ".png", ".webp"))]
    return out


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "AcetaView-LoadTest/1.0"})
    t = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            code = r.status
            cs = r.headers.get("cf-cache-status") or r.headers.get("x-vercel-cache") or "n/a"
    except urllib.error.HTTPError as e:
        code, body, cs = e.code, b"", "n/a"
    except Exception as e:
        with lock:
            errors.append(f"{url}: {e}")
        return
    dt = (time.perf_counter() - t) * 1000
    with lock:
        lat.append(dt)
        statuses[code] = statuses.get(code, 0) + 1
        cache_hits[cs] = cache_hits.get(cs, 0) + 1
        bytes_total[0] += len(body)


def user(base, paths, scrub, stagger, bust):
    time.sleep(random.uniform(0, stagger))
    fetch(base + "/")
    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(fetch, [base + p for p in paths]))
        if scrub:
            q = lambda: f"?r={random.random()}" if bust else ""
            list(ex.map(fetch, [base + random.choice(paths) + q() for _ in range(scrub)]))


def pct(v, p):
    s = sorted(v)
    return s[min(len(s) - 1, int(len(s) * p / 100))] if s else 0


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--url", default="https://acetaview.pages.dev")
    a.add_argument("--users", type=int, default=30)
    a.add_argument("--case", default="Case01")
    a.add_argument("--all-cases", action="store_true")
    a.add_argument("--scrub", type=int, default=0, help="extra random frame requests per user")
    a.add_argument("--stagger", type=float, default=2.0, help="seconds to spread user start (0 = all at once)")
    a.add_argument("--bust", action="store_true", help="add ?r=random to scrub requests to bypass CDN cache (worst case)")
    a = a.parse_args()
    base = a.url.rstrip("/")

    cases = sorted(c for c in os.listdir(os.path.join(ROOT, "videos")) if c.startswith("Case")) if a.all_cases else [a.case]
    paths = [p for c in cases for p in frame_paths(c)]
    print(f"Target {base} | users={a.users} | files/user={len(paths)} | scrub={a.scrub}")

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=a.users) as ex:
        for _ in range(a.users):
            ex.submit(user, base, paths, a.scrub, a.stagger, a.bust)
    wall = time.perf_counter() - t0

    n = len(lat)
    print(f"\nDuration: {wall:.1f}s | requests: {n} ({n/wall:.0f} req/s) | data: {bytes_total[0]/1e6:.0f} MB ({bytes_total[0]/1e6/wall:.1f} MB/s)")
    print(f"Latency ms: avg={statistics.mean(lat):.0f} p50={pct(lat,50):.0f} p95={pct(lat,95):.0f} p99={pct(lat,99):.0f} max={max(lat):.0f}" if lat else "No successful requests")
    print(f"Status codes: {statuses}")
    print(f"Cache status: {cache_hits}")
    print(f"Network errors: {len(errors)}")
    for e in errors[:5]:
        print("  ", e)
    bad = sum(v for k, v in statuses.items() if k >= 400) + len(errors)
    ok = bad == 0 and pct(lat, 95) < 1500
    print("\nRESULT:", "PASS ✅" if ok else "CHECK ⚠️  (errors or p95 > 1.5s)")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
