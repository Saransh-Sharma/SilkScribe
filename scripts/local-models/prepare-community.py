#!/usr/bin/env python3
"""Publisher-only Community-1 download. Credentials are never embedded in the app.
Accept the official model terms in your HF account first and supply a read token
through HF_TOKEN or a prior `hf auth login`. Then upload the dereferenced directory
and generate its manifest with manifest.py directory.
"""
import argparse, pathlib, shutil
from huggingface_hub import HfApi, snapshot_download
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('output');args=parser.parse_args()
repo='pyannote/speaker-diarization-community-1'
info=HfApi().model_info(repo)
snapshot=pathlib.Path(snapshot_download(repo,revision=info.sha))
output=pathlib.Path(args.output)
if output.exists():raise SystemExit('Choose a new output directory to avoid mixing revisions.')
shutil.copytree(snapshot,output,symlinks=False)
(output/'SOURCE.txt').write_text(f'{repo}\nRevision: {info.sha}\nLicense: CC-BY-4.0\nhttps://huggingface.co/{repo}\n')
print('Complete offline snapshot:',output,'\nPinned revision:',info.sha)
