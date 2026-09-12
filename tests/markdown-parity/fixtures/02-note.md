---
title: A realistic note
tags: [meeting, robotics]
---

# Sorting line throughput

Notes from the Thursday review. The headline: we are **throughput bound at the
pick, not at the perception stage**, which inverts the assumption the last
roadmap was built on.

## What we measured

| Stage      | Budget | Actual | Verdict |
| ---------- | -----: | -----: | ------- |
| Perception |  120ms |   84ms | under   |
| Planning   |   40ms |   38ms | at      |
| Pick       |  300ms |  610ms | **over** |

> [!warning] The pick number is a median, not a mean
> The tail is much worse — p95 sits above 1.2s, driven by regrasp attempts on
> flattened cardboard.

## What we think is happening

1. Suction loses seal on wet or creased surfaces
2. The regrasp retry is serial, so every failure costs a full cycle
3. We have no early-abort signal, so a doomed grasp still runs to completion

- [x] Pull the last week of grasp logs
- [x] Confirm the p95 tail is regrasp and not planning
- [ ] Prototype an early-abort on vacuum pressure
- [ ] Re-measure with the abort in place

## Next

The cheap experiment is the pressure-threshold abort — it needs no new hardware
and reuses the sensor we already read at `10Hz`. See [[grasp-retry-policy]] for
the current logic, and the [vendor datasheet](https://example.com/datasheet).

```python
def should_abort(pressure_kpa: float, elapsed_ms: float) -> bool:
    return elapsed_ms > 120 and pressure_kpa > -12.0
```

> A closing thought, kept as a plain quote rather than a callout: the roadmap
> assumed perception was the bottleneck for two quarters. Nobody re-measured.
