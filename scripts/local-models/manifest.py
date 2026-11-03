#!/usr/bin/env python3
"""Generate pinned download manifests, without downloading gated weights in the app.
HF: manifest.py hf REPO PACK_ID --purpose asr --name NAME --output FILE
Mirror: manifest.py directory DIRECTORY PACK_ID --base-url URL --revision REV --output FILE
The directory must contain the complete offline pipeline, including dependent weights.
"""
import argparse, hashlib, json, pathlib, urllib.request, urllib.parse

def get_json(url):
    with urllib.request.urlopen(url) as response:
        return json.load(response)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', choices=['hf', 'directory'])
    parser.add_argument('location'); parser.add_argument('id')
    parser.add_argument('--name', default=''); parser.add_argument('--purpose', default='speakers')
    parser.add_argument('--base-url'); parser.add_argument('--revision', default='')
    parser.add_argument('--license', default=''); parser.add_argument('--languages', default='')
    parser.add_argument('--memory-gb', type=int, default=0); parser.add_argument('--output', required=True)
    args = parser.parse_args()
    artifacts = []
    if args.source == 'hf':
        info = get_json('https://huggingface.co/api/models/' + args.location + '?blobs=true')
        if info.get('gated'):
            raise SystemExit('Repository is gated. Download as publisher, then generate a directory manifest for your server.')
        revision = info['sha']
        license_name = args.license or info.get('cardData', {}).get('license', '')
        for entry in info['siblings']:
            name = entry['rfilename']
            if not name.endswith(('.json', '.safetensors', '.txt', '.model', '.yaml', '.bin', '.tiktoken', '.jinja')):
                continue
            url = f'https://huggingface.co/{args.location}/resolve/{revision}/{urllib.parse.quote(name)}'
            lfs = entry.get('lfs')
            if lfs:
                digest, size = lfs['sha256'], lfs['size']
            else:
                with urllib.request.urlopen(url) as response: data = response.read()
                digest, size = hashlib.sha256(data).hexdigest(), len(data)
            artifacts.append(dict(path=name, url=url, sha256=digest, bytes=size))
    else:
        if not args.base_url or not args.revision or not args.license:
            parser.error('directory requires --base-url, --revision and --license')
        revision, license_name = args.revision, args.license
        root = pathlib.Path(args.location).resolve()
        for path in sorted(root.rglob('*')):
            if path.is_symlink(): raise SystemExit('Dereference model symlinks before packaging: ' + str(path))
            if not path.is_file() or path.name == 'installed.json': continue
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(1024*1024), b''): digest.update(block)
            name = path.relative_to(root).as_posix()
            artifacts.append(dict(path=name, url=args.base_url.rstrip('/')+'/'+urllib.parse.quote(name), sha256=digest.hexdigest(), bytes=path.stat().st_size))
    pack = dict(id=args.id, name=args.name or args.id, purpose=args.purpose, revision=revision, license=license_name, languages=args.languages.split(',') if args.languages else [], minimum_memory_gb=args.memory_gb, artifacts=artifacts)
    pathlib.Path(args.output).write_text(json.dumps(pack, indent=2)+'\n')
if __name__ == '__main__': main()
