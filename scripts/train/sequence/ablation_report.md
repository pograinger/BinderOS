# Ablation Report: 384-dim vs 512-dim Sequence Classifiers

**Generated:** 2026-03-13T08:09:00.353203+00:00
**Window sizes tested:** N = 3, 5, 7
**Baseline dimension:** 384
**Sequence dimension:** 512

## Recommendation

**KEEP_384** — Recommended N=5
Mean F1 delta across all classifiers: N=3: -0.0020, N=5: -0.0020, N=7: -0.0023

## Per-Classifier Results

| Classifier | Baseline F1 | N=3 F1 | N=5 F1 | N=7 F1 | Best N | Best Delta | Replace? |
|------------|------------|--------|--------|--------|--------|------------|---------|
| actionability | 0.9938 | 0.9958 | 0.9938 | 0.9958 | N=3 | +0.0021 | YES |
| cognitive-load | 0.9870 | 0.9867 | 0.9867 | 0.9841 | N=3 | -0.0003 | caution |
| collaboration-type | 0.9580 | 0.9368 | 0.9436 | 0.9401 | N=5 | -0.0145 | caution |
| completeness-gate | 0.9903 | 0.9861 | 0.9875 | 0.9861 | N=5 | -0.0028 | caution |
| context-tagging | 0.9916 | 0.9900 | 0.9901 | 0.9900 | N=5 | -0.0015 | caution |
| decomposition | 0.9961 | 0.9957 | 0.9959 | 0.9952 | N=5 | -0.0002 | caution |
| emotional-valence | 0.9923 | 0.9975 | 0.9975 | 0.9975 | N=3 | +0.0052 | YES |
| energy-level | 0.9932 | 0.9900 | 0.9900 | 0.9900 | N=3 | -0.0032 | caution |
| gtd-horizon | 0.9978 | 0.9958 | 0.9958 | 0.9958 | N=3 | -0.0020 | caution |
| gtd-routing | 0.9893 | 0.9894 | 0.9883 | 0.9883 | N=3 | +0.0000 | caution |
| information-lifecycle | 0.9921 | 0.9948 | 0.9948 | 0.9948 | N=3 | +0.0026 | YES |
| knowledge-domain | 0.9949 | 0.9949 | 0.9949 | 0.9949 | N=3 | +0.0000 | YES |
| missing-context | 0.9971 | 0.9971 | 0.9971 | 0.9956 | N=3 | +0.0000 | caution |
| missing-next-action | 0.9912 | 0.9882 | 0.9882 | 0.9897 | N=7 | -0.0015 | caution |
| missing-outcome | 0.9941 | 0.9868 | 0.9882 | 0.9868 | N=5 | -0.0059 | caution |
| missing-reference | 0.9971 | 0.9985 | 0.9985 | 0.9985 | N=3 | +0.0015 | YES |
| missing-timeframe | 0.9853 | 0.9897 | 0.9897 | 0.9882 | N=3 | +0.0044 | YES |
| priority-matrix | 0.9974 | 0.9948 | 0.9974 | 0.9974 | N=5 | +0.0000 | caution |
| project-detection | 0.9855 | 0.9834 | 0.9834 | 0.9855 | N=7 | +0.0000 | caution |
| review-cadence | 0.9922 | 0.9948 | 0.9948 | 0.9922 | N=3 | +0.0026 | caution |
| time-estimate | 0.9712 | 0.9509 | 0.9432 | 0.9455 | N=3 | -0.0202 | caution |
| triage-type | 0.9724 | 0.9774 | 0.9774 | 0.9774 | N=3 | +0.0050 | YES |

## Aggregate Summary

| Window Size | Mean F1 Delta |
|-------------|--------------|
| N=3 | -0.0020 |
| N=5 | -0.0020 |
| N=7 | -0.0023 |

**Recommended N:** 5
**Classifiers recommending replacement:** 7/22
