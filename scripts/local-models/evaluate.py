#!/usr/bin/env python3
"""Score locally saved worker outputs against an annotated evaluation manifest.
Run with the speech development venv plus requirements-evaluation.txt.
No downloads, inference, or model-based factuality judgments occur here.
"""
import argparse
import hashlib
import json
import math
import pathlib
import statistics
from importlib.metadata import version


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def finite(value):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError('Non-finite annotation or measurement')
    return value


def annotation(turns):
    from pyannote.core import Annotation, Segment
    result = Annotation()
    for index, turn in enumerate(turns):
        start, end = finite(turn['start']), finite(turn['end'])
        if start < 0 or end <= start or not str(turn['speaker']):
            raise ValueError('Invalid speaker turn')
        result[Segment(start, end), index] = str(turn['speaker'])
    return result


def score(reference, prediction, duration, reviews=None):
    import jiwer
    from pyannote.core import Segment, Timeline
    from pyannote.metrics.diarization import DiarizationErrorRate
    result = prediction.get('result', prediction)
    if 'error' in prediction or 'fallback' in result:
        raise ValueError('Inference did not produce a scoreable result')
    output = {}
    if 'text' in reference and 'segments' in result:
        # Only whitespace is normalized. No case/punctuation stripping or
        # language-dependent tokenization is silently introduced.
        expected = ' '.join(reference['text'].split())
        actual = ' '.join(s['text'] for s in result['segments'])
        words = jiwer.process_words(expected, actual)
        output['transcription'] = {
            'wer': words.wer, 'cer': jiwer.cer(expected, actual),
            'hits': words.hits, 'substitutions': words.substitutions,
            'deletions': words.deletions, 'insertions': words.insertions,
            'normalization': 'whitespace only; case and punctuation retained',
        }
    if 'turns' in reference and 'turns' in result:
        if duration <= 0:
            raise ValueError('Diarization scoring requires the evaluated duration')
        metric = DiarizationErrorRate(collar=0, skip_overlap=False)
        output['diarization'] = {key: float(value) for key, value in metric(
            annotation(reference['turns']), annotation(result['turns']),
            uem=Timeline([Segment(0, duration)]), detailed=True).items()}
        output['diarization_policy'] = {'collar_seconds': 0, 'score_overlap': True, 'mapping': 'recording-wide optimal'}
    if 'words' in reference and 'segments' in result:
        refs = reference['words']
        hyps = result['segments']
        if any(len(item['text'].split()) != 1 for item in refs + hyps):
            output['timing'] = {'available': False, 'reason': 'Word-level timing is unavailable; segment boundaries are not expanded into invented word timestamps.'}
        else:
            alignment = jiwer.process_words(' '.join(w['text'] for w in refs), ' '.join(w['text'] for w in hyps))
            errors = []
            for chunk in alignment.alignments[0]:
                if chunk.type != 'equal':
                    continue
                for ri, hi in zip(range(chunk.ref_start_idx, chunk.ref_end_idx), range(chunk.hyp_start_idx, chunk.hyp_end_idx)):
                    for boundary in ('start', 'end'):
                        errors.append(abs(finite(refs[ri][boundary]) - finite(hyps[hi][boundary])))
            output['timing'] = {
                'available': bool(errors), 'matched_words': len(errors) // 2,
                'reference_words': len(refs),
                'boundary_mae_seconds': statistics.mean(errors) if errors else None,
                'boundary_p95_seconds': sorted(errors)[math.ceil(.95 * len(errors)) - 1] if errors else None,
                'scope': 'boundaries of lexically matched words only',
            }
    notes = result.get('notes', result if 'summary' in result else None)
    if notes is not None:
        items = [(section, index, item) for section in ('summary', 'decisions', 'actions') for index, item in enumerate(notes.get(section, []))]
        known = {item['id'] for item in reference.get('segments', [])}
        invalid = sum(not item.get('sources') or any(source not in known for source in item['sources']) for _, _, item in items)
        support = None
        if reviews is not None:
            decisions = {(item['section'], item['index']): item['supported'] for item in reviews}
            if len(decisions) != len(reviews) or set(decisions) != {(section, index) for section, index, _ in items} or any(type(v) is not bool for v in decisions.values()):
                raise ValueError('Human support review must label every generated note exactly once')
            support = sum(decisions.values()) / len(items) if items else None
        output['notes'] = {'items': len(items), 'invalid_source_references': invalid,
                           'human_supported_fraction': support,
                           'factuality_reviewed': reviews is not None,
                           'policy': 'Source-ID validity alone is not factual verification.'}
    metrics = prediction.get('metrics', {})
    output['runtime'] = {key: finite(metrics[key]) for key in ('elapsed_seconds', 'peak_rss_bytes', 'peak_device_bytes') if key in metrics}
    if 'elapsed_seconds' in output['runtime'] and duration > 0:
        output['runtime']['real_time_factor'] = output['runtime']['elapsed_seconds'] / duration
    return output


def evaluate(manifest_path):
    manifest_path = manifest_path.resolve(strict=True)
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('kind') not in ('scorer-test', 'smoke', 'annotated-benchmark'):
        raise ValueError('Declare kind: scorer-test, smoke, or annotated-benchmark')
    base = manifest_path.parent
    cases = []
    for case in manifest['cases']:
        prediction_path = (base / case['prediction']).resolve(strict=True)
        reference_path = (base / case['reference']).resolve(strict=True)
        reference = json.loads(reference_path.read_text())
        prediction = json.loads(prediction_path.read_text())
        artifacts = []
        for artifact in case.get('artifacts', []):
            path = (base / artifact['path']).resolve(strict=True)
            digest = sha256(path)
            if digest != artifact['sha256']:
                raise ValueError(f'Artifact checksum mismatch: {path.name}')
            artifacts.append({'name': path.name, 'sha256': digest})
        reviews = None
        if case.get('human_review'):
            reviews = json.loads((base / case['human_review']).read_text())
        cases.append({'id': case['id'], 'model_revision': case.get('model_revision'),
            'reference_sha256': sha256(reference_path), 'prediction_sha256': sha256(prediction_path),
            'artifacts': artifacts, 'artifacts_verified': bool(artifacts),
            'measurements': score(reference, prediction, finite(case.get('duration_seconds', 0)), reviews)})
    return {'schema': 'silkscribe.evaluation', 'version': 1, 'kind': manifest['kind'],
        'manifest_sha256': sha256(manifest_path), 'hardware': manifest.get('hardware'),
        'scorers': {name: version(name) for name in ('jiwer', 'pyannote.metrics')},
        'cases': cases, 'release_approval': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=pathlib.Path)
    parser.add_argument('--output', required=True, type=pathlib.Path)
    args = parser.parse_args()
    report = evaluate(args.manifest)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print(f'Scored {len(report["cases"])} cases ({report["kind"]}). This report is not release approval.')
