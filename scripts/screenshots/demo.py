"""Write a demo galley directory for the screenshots of the website.

Usage: demo.py <directory>
"""
import os, sys, shutil, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
root = os.path.abspath(sys.argv[1])
repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
shutil.rmtree(root, ignore_errors=True)
os.makedirs(root)
shutil.copy(f"{repo}/src-tauri/src/GALLEY.md", f"{root}/GALLEY.md")

def fig(path, hit2):
    x = np.arange(0, 25)
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11})
    f, ax = plt.subplots(figsize=(7, 3.4), dpi=150)
    for name, k, c in [("LRU", 0.18, "#4c78a8"), ("LFU", 0.12, "#9d755d"), ("2Q", hit2, "#54a24b")]:
        ax.plot(x, 0.92 * (1 - np.exp(-k * x)), label=name, color=c, lw=2)
    ax.set_xlabel("Cache size [GB]"); ax.set_ylabel("Hit rate")
    ax.spines[["top", "right"]].set_visible(False); ax.legend(frameon=False); ax.grid(alpha=.25)
    f.tight_layout(); f.patch.set_facecolor("#faf7f0"); ax.set_facecolor("#faf7f0"); f.savefig(path); plt.close(f)

docs = {}
d1 = r'''# Tile cache for the map server

The map server renders vector tiles on each request. At peak load, the rendering takes 70 % of the CPU time. This document proposes a cache for the rendered tiles.

## Requirements

- The cache must serve 95 % of the requests at zoom level 14 and below.
- A tile must not be older than 10 minutes after an edit of the map data.
- The cache must survive a restart of one node.

## Design

Each node keeps an LRU cache in memory. A request goes to the node that owns the tile, by consistent hashing over the tile key $k = (z, x, y)$.

```mermaid
flowchart LR
  C[Client] --> LB[Load balancer]
  LB --> N1[Node 1]
  LB --> N2[Node 2]
  N1 --> R[(Renderer)]
  N2 --> R
```

The expected hit rate for a cache of size $s$ follows from the access frequency of the tiles:

$$
h(s) = \sum_{i=1}^{s} p_i, \qquad p_i \propto i^{-\alpha}
$$

![Hit rate over the cache size for three eviction policies](images/hitrate.png)

## Invalidation

An edit of the map data sends the bounding box of the edit to all nodes. Each node removes the tiles that intersect the box.

```rust
fn invalidate(&mut self, bbox: BBox) {
    self.tiles.retain(|key, _| !key.bounds().intersects(&bbox));
}
```

## Open questions

Which eviction policy do you prefer? Select one option.

- [ ] LRU
- [ ] LFU
- [ ] 2Q
'''
d2 = r'''# Tile cache for the map server

The map server renders vector tiles on each request. At peak load, the rendering takes 70 % of the CPU time. This document proposes a two-level cache for the rendered tiles.

## Requirements

- The cache must serve 95 % of the requests at zoom level 14 and below.
- A tile must not be older than 60 seconds after an edit of the map data.
- The cache must survive a restart of one node.

## Design

Each node keeps a 2Q cache in memory. A shared Redis instance holds the tiles that the nodes evict. A request goes to the node that owns the tile, by consistent hashing over the tile key $k = (z, x, y)$.

```mermaid
flowchart LR
  C[Client] --> LB[Load balancer]
  LB --> N1[Node 1]
  LB --> N2[Node 2]
  N1 --> RD[(Redis)]
  N2 --> RD
  RD --> R[(Renderer)]
```

The expected hit rate for a cache of size $s$ follows from the access frequency of the tiles:

$$
h(s) = \sum_{i=1}^{s} p_i, \qquad p_i \propto i^{-\alpha}
$$

![Hit rate over the cache size for three eviction policies](images/hitrate.png)

| Level  | Size    | Latency |
|--------|---------|---------|
| Memory | 4 GB    | 0.2 ms  |
| Redis  | 64 GB   | 1.5 ms  |

## Invalidation

An edit of the map data publishes the bounding box of the edit on a Redis channel. Each node removes the tiles that intersect the box.

```rust
fn invalidate(&mut self, bbox: BBox) {
    self.tiles.retain(|key, _| !key.bounds().intersects(&bbox));
}
```

> [!NOTE]
> Tiles above zoom level 10 cover large areas. An edit invalidates them often, so the cache does not keep them.
'''
a1 = '''# Annotations

## 1

> A tile must not be older than 10 minutes

10 minutes is too long for the editors. Use 60 seconds.

## 2

Checked: [x] 2Q

Context: Which eviction policy do you prefer? Select one option.

## 3

> sends the bounding box of the edit to all nodes

How do the nodes get the message? Use the Redis pub/sub that we already run.

## 4

Image: images/hitrate.png

Good figure. Also add a table with the sizes and latencies of the levels.
'''
a2 = '''# Annotations

## 1

> A shared Redis instance holds the tiles that the nodes evict.

What happens when Redis is down? Describe the fallback.

## 2

> Tiles above zoom level 10

Is the limit 10 a measured value? Give the number of invalidations per hour.
'''
base = f"{root}/2026-11-18_0930_tile-cache"
for n, d, a, k in [("01", d1, a1, 0.2), ("02", d2, a2, 0.2)]:
    os.makedirs(f"{base}/{n}/images")
    fig(f"{base}/{n}/images/hitrate.png", k)
    open(f"{base}/{n}/document.md", "w").write(d)
    open(f"{base}/{n}/annotations.md", "w").write(a)
for name, title in [("2026-11-12_1405_api-versioning", "API versioning"), ("2026-11-15_1610_release-checklist", "Release checklist"), ("2026-11-17_0815_onboarding-guide", "Onboarding guide")]:
    for n in ["01", "02", "03"][: (len(title) % 3) + 1]:
        os.makedirs(f"{root}/{name}/{n}")
        open(f"{root}/{name}/{n}/document.md", "w").write(f"# {title}\n\nDraft {n}.\n")
