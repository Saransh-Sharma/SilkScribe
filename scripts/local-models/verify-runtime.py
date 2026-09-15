#!/usr/bin/env python3
"""Verify exact runtime contents, Developer ID signatures and offline startup."""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import re

MAGIC = {b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf', b'\xca\xfe\xba\xbe', b'\xbe\xba\xfe\xca'}


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def verify(bundle, team, offline_health=False):
    bundle = bundle.resolve(strict=True)
    manifest = json.loads((bundle / 'runtime-manifest.json').read_text())
    if manifest['schema'] != 'silkscribe.runtime' or manifest['version'] != 1:
        raise ValueError('Unsupported runtime manifest')
    files = manifest['files']
    fingerprint = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if fingerprint != manifest['sha256']:
        raise ValueError('Runtime manifest fingerprint mismatch')
    records = {item['path']: item for item in files}
    if len(records) != len(files):
        raise ValueError('Duplicate manifest path')
    actual = {path.relative_to(bundle).as_posix() for path in bundle.rglob('*')
              if (path.is_file() or path.is_symlink()) and path != bundle/'runtime-manifest.json'}
    if actual != set(records):
        raise ValueError('Runtime contains missing or unlisted files')
    signatures = 0
    for relative, item in records.items():
        path = bundle / relative
        if pathlib.Path(relative).is_absolute() or '..' in pathlib.Path(relative).parts or not path.resolve(strict=True).is_relative_to(bundle):
            raise ValueError('Unsafe runtime path')
        if 'symlink' in item:
            if path.is_symlink():
                if os.readlink(path) != item['symlink']:
                    raise ValueError(f'Symlink mismatch: {relative}')
            else:
                # Tauri copies resource symlinks as regular files/directories.
                target = path.parent / item['symlink']
                if not target.resolve(strict=True).is_relative_to(bundle):
                    raise ValueError('Unsafe copied symlink target')
                if path.is_file() and digest(path) != digest(target):
                    raise ValueError(f'Copied symlink mismatch: {relative}')
        elif path.stat().st_size != item['bytes'] or digest(path) != item['sha256']:
            raise ValueError(f'Runtime checksum mismatch: {relative}')
        if not path.is_file() or path.is_symlink():
            continue
        with path.open('rb') as stream:
            magic = stream.read(4)
        if magic in MAGIC:
            subprocess.run(['codesign', '--verify', '--strict', str(path)], check=True, capture_output=True)
            signed = subprocess.run(['codesign', '-dv', '--verbose=4', str(path)], check=True, capture_output=True, text=True).stderr
            if f'TeamIdentifier={team}\n' not in signed or 'Authority=Developer ID Application:' not in signed:
                raise ValueError(f'Unexpected signing identity: {relative}')
            signatures += 1
    health = None
    if offline_health:
        kind = manifest['kind']
        if kind not in ('speech', 'notes'):
            raise ValueError('Unknown worker kind')
        command = ['sandbox-exec', '-p', '(version 1)(allow default)(deny network*)', str(bundle / (kind + '-worker'))]
        response = subprocess.run(command, input=json.dumps({'protocol': 1, 'task': 'health', 'kind': kind})+'\n', capture_output=True, text=True, timeout=240, check=True)
        health = json.loads(response.stdout)
        if health.get('protocol') != 1 or health.get('result', {}).get('ready') is not True:
            raise ValueError('Offline worker health failed')
    return {'schema': 'silkscribe.runtime-verification', 'version': 1,
            'runtime_sha256': fingerprint, 'team': team, 'verified_records': len(records),
            'verified_signatures': signatures, 'offline_health': health,
            'notarization_verified': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=pathlib.Path)
    identity = parser.add_mutually_exclusive_group(required=True)
    identity.add_argument('--team')
    identity.add_argument('--signed-app', type=pathlib.Path, help='Require the same Developer ID team as this signed app')
    parser.add_argument('--offline-health', action='store_true')
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    team = args.team
    if args.signed_app:
        subprocess.run(['codesign', '--verify', '--deep', '--strict', str(args.signed_app)], check=True, capture_output=True)
        signature = subprocess.run(['codesign', '-dv', '--verbose=4', str(args.signed_app)], check=True, capture_output=True, text=True).stderr
        match = re.search(r'^TeamIdentifier=([A-Z0-9]+)$', signature, re.MULTILINE)
        if not match or 'Authority=Developer ID Application:' not in signature:
            raise ValueError('App has no Developer ID team')
        team = match.group(1)
    report = verify(args.bundle, team, args.offline_health)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2)+'\n')
    print(f'Verified {report["verified_signatures"]} Developer ID signatures and {report["verified_records"]} manifest records.')
