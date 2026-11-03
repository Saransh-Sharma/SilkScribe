# Reproducible local evaluation

The scorer consumes saved inference outputs and annotations. It never downloads models, runs hosted inference or uses another model to judge factuality. Install `requirements-evaluation.txt` in a development environment, separate from shipped workers.

```sh
.build/local-runtime-speech/venv/bin/python -m unittest discover -s scripts/local-models -p 'test_evaluation.py'
.build/local-runtime-speech/venv/bin/python scripts/local-models/evaluate.py /absolute/manifest.json --output .build/evaluation-report.json
```

Example manifest (paths are relative to the manifest):

```json
{
  "kind": "annotated-benchmark",
  "hardware": {
    "machine": "record exact machine",
    "memory_bytes": 51539607552
  },
  "cases": [
    {
      "id": "meeting-01",
      "model_revision": "exact immutable revision",
      "duration_seconds": 3600,
      "reference": "reference.json",
      "prediction": "worker-output.json",
      "human_review": "review.json",
      "artifacts": [
        { "path": "model.safetensors", "sha256": "actual 64-character digest" }
      ]
    }
  ]
}
```

Reference fields are optional by task: `text`; `words` with single-word `text`, `start`, `end`; `turns` with `start`, `end`, `speaker`; and notes evidence `segments` with `id` and `text`. All timestamps use seconds on the same recording timeline. Predictions are worker protocol envelopes or their result objects. A human-review file is an array of `{ "section": "summary", "index": 0, "supported": true }` entries covering every generated note exactly once. Omit it when human review has not happened; support remains unmeasured.

[JiWER](https://jitsi.github.io/jiwer/cli/) computes WER and CER with whitespace normalization only. Case and punctuation are retained, and language-specific tokenization must be an explicit corpus preparation decision. [pyannote.metrics](https://pyannote.github.io/pyannote-metrics/reference.html?highlight=precision) computes recording-wide optimally mapped DER with zero collar and overlap included. Timing scores use boundaries of lexically matched, genuinely word-timed segments; phrase timestamps are never expanded into words. A valid citation is counted separately from human-confirmed support.

Reports record scorer versions, manifest/reference/prediction hashes, verified artifact hashes, runtime and available memory counters. Empty artifact lists are explicitly unverified. Keep source audio hashes, annotation methodology, language mix, consent/license provenance, exact runtime bundle identity and acceleration settings with the corpus manifest. Use separate cases for full precision, each conversion and each execution backend on the same audio, then review differences before accepting a conversion.

`scorer-test` and `smoke` manifests are supported but cannot establish meeting quality. Reports always set `release_approval` to false: signing, clean-machine offline behavior, capture faults and human acceptance are separate gates.
