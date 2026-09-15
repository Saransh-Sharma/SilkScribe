#!/usr/bin/env python3
"""Download a pinned pack into build artifacts, verify it, and run the shipped worker offline.
Examples: smoke.py --task notes --download
          smoke.py --task transcribe --audio /absolute/fixture.wav --download
"""
import argparse, hashlib, json, pathlib, subprocess, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2]
def install(pack, download=True):
    if not pack['artifacts']: raise ValueError('This pack has no published artifacts: ' + pack['id'])
    root=ROOT/'.build/model-smoke'/pack['id'];root.mkdir(parents=True,exist_ok=True)
    for artifact in pack['artifacts']:
        path=root/artifact['path'];path.parent.mkdir(parents=True,exist_ok=True)
        if path.exists() and path.stat().st_size==artifact['bytes']:
            digest=hashlib.sha256()
            with path.open('rb') as f:
                for block in iter(lambda:f.read(1024*1024),b''):digest.update(block)
            if digest.hexdigest()==artifact['sha256']:continue
        if not download: raise ValueError('Missing or corrupt artifact; rerun with --download: ' + artifact['path'])
        print('Downloading',artifact['path'],flush=True)
        temporary=path.with_suffix(path.suffix+'.partial');digest=hashlib.sha256();size=0
        with urllib.request.urlopen(artifact['url'],timeout=120) as response,temporary.open('wb') as f:
            while True:
                block=response.read(1024*1024)
                if not block:break
                f.write(block);digest.update(block);size+=len(block)
        if size!=artifact['bytes'] or digest.hexdigest()!=artifact['sha256']:raise RuntimeError('Artifact verification failed')
        temporary.replace(path)
    (root/'installed.json').write_text(json.dumps(pack))
    return str(root)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--task',choices=['notes','transcribe','diarize'],required=True);p.add_argument('--download',action='store_true');p.add_argument('--notes-model',choices=['qwen3.5-9b','qwen3.6-27b'],default='qwen3.5-9b');p.add_argument('--section',choices=['summary','decisions','actions']);p.add_argument('--audio');p.add_argument('--step',action='store_true');p.add_argument('--start',type=float,default=0);p.add_argument('--end',type=float);p.add_argument('--runtime-root',type=pathlib.Path,default=ROOT/'src-tauri/resources/local-runtime');args=p.parse_args()
    if args.section and args.task != 'notes': p.error('--section applies only to notes')
    packs={p['id']:p for p in json.loads((ROOT/'src-tauri/resources/local-models.json').read_text())}
    def model(id):
        return install(packs[id], download=args.download)
    request={'protocol':1,'task':args.task}
    if args.step:request['step']=True
    if args.section:request['section']=args.section
    if args.task=='notes':
        request.update(model_path=model(args.notes_model),segments=[{'id':'s0','text':'Priya: The design review is on Friday.','speaker':'Priya'},{'id':'s1','text':'Sam: I will send the revised screens tomorrow.','speaker':'Sam'}])
        binary=args.runtime_root/'notes-worker/notes-worker'
    else:
        if not args.audio:p.error('--audio is required')
        request.update(audio_path=str(pathlib.Path(args.audio).resolve()))
        if args.task=='diarize':
            if args.start or args.end is not None: p.error('Diarization uses the full recording for consistent speaker identities')
            request.update(model_path=model('community-1'))
        else:
            request.update(model_path=model('qwen3-asr'),aligner_path=model('qwen3-aligner'),language='English')
        request['start_seconds']=args.start
        if args.end is not None:request['end_seconds']=args.end
        binary=args.runtime_root/'speech-worker/speech-worker'
    command=['/usr/bin/sandbox-exec','-p','(version 1) (allow default) (deny network*)',str(binary)]
    result=subprocess.run(command,input=json.dumps(request)+'\n',text=True,capture_output=True,timeout=900)
    label=args.notes_model if args.task=='notes' else args.task
    if args.section: label += '-' + args.section
    output=ROOT/'.build'/f'{label}-smoke-result.json';output.write_text(result.stdout)
    if result.returncode:raise SystemExit(result.stdout+'\n'+result.stderr[-5000:])
    response=json.loads(result.stdout)
    if 'error' in response:raise SystemExit(response['error'])
    if response.get('protocol') != 1 or not isinstance(response.get('result'), dict): raise SystemExit('Invalid worker protocol response')
    if args.task=='diarize':
        for key in ('turns', 'exclusive'):
            if not isinstance(response['result'].get(key), list): raise SystemExit('Missing diarization output: ' + key)
    if args.task=='transcribe':
        for segment in response['result'].get('segments',[]):
            midpoint=(segment['start']+segment['end'])/2
            if midpoint < args.start or (args.end is not None and midpoint >= args.end):
                raise SystemExit('A timestamp escaped the requested chunk core')
    print(json.dumps(response,indent=2));print('Offline packaged inference passed. Output:',output)
if __name__=='__main__':main()
