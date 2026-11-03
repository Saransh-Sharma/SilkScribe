#!/usr/bin/env python3
"""Build the embedded, relocatable inference worker. Run with Python 3.11–3.13.
Release builds require --identity. All nested Mach-O binaries are signed inside-out.
"""
import argparse, hashlib, json, os, pathlib, platform, shutil, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
def run(*args, **kwargs): subprocess.run([str(a) for a in args], check=True, **kwargs)
def write_manifest(bundle, kind):
    """Fingerprint shipped bytes, including dependencies and symlink targets."""
    files = []
    for path in sorted(bundle.rglob('*')):
        if path.name == 'runtime-manifest.json' and path.parent == bundle:
            continue
        relative = path.relative_to(bundle).as_posix()
        if path.is_symlink():
            files.append({'path': relative, 'symlink': os.readlink(path)})
        elif path.is_file():
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(block)
            files.append({'path': relative, 'bytes': path.stat().st_size, 'sha256': digest.hexdigest()})
    fingerprint = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    (bundle/'runtime-manifest.json').write_text(json.dumps({
        'schema': 'silkscribe.runtime', 'version': 1, 'kind': kind,
        'sha256': fingerprint, 'files': files,
    }, indent=2) + '\n')
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--identity',default=os.environ.get('APPLE_SIGNING_IDENTITY','-'))
    parser.add_argument('--sign-only',action='store_true')
    parser.add_argument('--kind',choices=['speech','notes'],default='speech')
    parser.add_argument('--resolve',action='store_true',help='Resolve and lock dependency versions before packaging')
    args=parser.parse_args()
    if platform.system()!='Darwin' or platform.machine()!='arm64': raise SystemExit('The full runtime currently targets Apple Silicon macOS.')
    if not (3,11)<=sys.version_info[:2]<=(3,13): raise SystemExit('Use Python 3.11, 3.12, or 3.13 to build the runtime.')
    work=ROOT/('.build/local-runtime-'+args.kind);work.mkdir(parents=True,exist_ok=True)
    env=work/'venv';python=env/'bin/python'
    if not python.exists():run(sys.executable,'-m','venv',env)
    destination=ROOT/'src-tauri/resources/local-runtime'
    if not args.sign_only:
        run(python,'-m','pip','install','uv')
        requirements=ROOT/('src-tauri/workers/requirements.txt' if args.kind=='speech' else 'src-tauri/workers/requirements-notes.txt')
        lock=ROOT/f'src-tauri/workers/requirements-{args.kind}-macos-arm64.lock'
        if args.resolve or not lock.exists():run(python,'-m','uv','pip','compile',requirements,'--generate-hashes','--output-file',lock,'--python',python)
        run(python,'-m','uv','pip','sync',lock,'--python',python,'--require-hashes')
        packages=['pyannote.audio','qwen_asr','transformers','tokenizers','soundfile','torchcodec','nagisa'] if args.kind=='speech' else ['mlx_lm','mlx','transformers','tokenizers']
        collect=[value for package in packages for value in ['--collect-all',package]]
        run(python,'-m','PyInstaller','--noconfirm','--onedir','--name',args.kind+'-worker','--distpath',destination,'--workpath',work/'pyinstaller','--specpath',work,
            *collect, ROOT/'src-tauri/workers/worker.py')
    bundle=destination/(args.kind+'-worker')
    # Tauri dereferences resource symlinks. Sign the top-level Python alias as
    # a standalone binary: its framework signature binds a nearby Info.plist
    # that does not exist beside the alias after copying into app resources.
    python_alias = bundle/'_internal/Python'
    if python_alias.is_symlink():
        target = python_alias.resolve(strict=True)
        python_alias.unlink()
        shutil.copy2(target, python_alias)
    # The worker loads the standalone Python above. Keep the canonical version
    # and its metadata, but omit framework aliases that Tauri would flatten into
    # additional incorrectly located signed binaries.
    framework = bundle/'_internal/Python.framework'
    for alias in framework.rglob('*'):
        if alias.is_symlink():
            alias.unlink()
    # Tauri dereferences the root libmlx symlink; MLX locates its shaders beside
    # the loaded dylib, so preserve a copy at both possible loading locations.
    if args.kind=='notes':
        shaders=bundle/'_internal/mlx/lib/mlx.metallib'
        shutil.copy2(shaders,bundle/'_internal/mlx.metallib')
    entitlements=ROOT/'src-tauri/workers/worker.entitlements'
    # Check magic rather than extension: Python executables and framework binaries have no suffix.
    magic={b'\xcf\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xca\xfe\xba\xbe',b'\xbe\xba\xfe\xca'}
    for path in sorted(bundle.rglob('*'),key=lambda p:len(p.parts),reverse=True):
        if not path.is_file() or path.is_symlink():continue
        with path.open('rb') as stream: header=stream.read(4)
        if header not in magic:continue
        command=['codesign','--force','--sign',args.identity,'--entitlements',str(entitlements)]
        if args.identity!='-':command.extend(['--options','runtime','--timestamp'])
        run(*command,path)
        run('codesign','--verify','--strict',path)
    binary=bundle/(args.kind+'-worker')
    result=subprocess.run([str(binary)],input=json.dumps({'protocol':1,'task':'health','kind':args.kind})+'\n',text=True,capture_output=True,timeout=240)
    if result.returncode:raise SystemExit('Packaged worker health check failed:\n'+result.stdout+'\n'+result.stderr[-4000:])
    response=json.loads(result.stdout)
    if response.get('protocol')!=1 or response.get('result',{}).get('ready') is not True:
        raise SystemExit('Packaged worker did not confirm runtime readiness')
    write_manifest(bundle, args.kind)
    print(result.stdout)
    print('Runtime packaged at',bundle)
    if args.identity=='-':print('Ad-hoc development signature only. Rebuild with --identity for distribution.')
if __name__=='__main__':main()
