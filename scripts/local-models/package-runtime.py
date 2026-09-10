#!/usr/bin/env python3
"""Build the embedded, relocatable inference worker. Run with Python 3.11–3.13.
Release builds require --identity. All nested Mach-O binaries are signed inside-out.
"""
import argparse, json, os, pathlib, platform, shutil, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
def run(*args, **kwargs): subprocess.run([str(a) for a in args], check=True, **kwargs)
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
    binary=bundle/(args.kind+'-worker')
    result=subprocess.run([str(binary)],input=json.dumps({'protocol':1,'task':'health','kind':args.kind})+'\n',text=True,capture_output=True,timeout=240)
    if result.returncode:raise SystemExit('Packaged worker health check failed:\n'+result.stdout+'\n'+result.stderr[-4000:])
    print(result.stdout)
    print('Runtime packaged at',bundle)
    if args.identity=='-':print('Ad-hoc development signature only. Rebuild with --identity for distribution.')
if __name__=='__main__':main()
