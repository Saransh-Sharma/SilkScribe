#!/usr/bin/env python3
"""Generate reviewable workspace localization drafts using an installed local MLX model.
This is a development tool, never part of the app's runtime or first-run setup.
Results are cached by source hash; keys and interpolation placeholders are validated.
"""
import argparse, hashlib, json, os, pathlib, re, time
os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1')
ROOT = pathlib.Path(__file__).resolve().parents[2]
LANGUAGES = {'ar':'Arabic','cs':'Czech','de':'German','es':'Spanish','fr':'French','it':'Italian','ja':'Japanese','ko':'Korean','pl':'Polish','pt':'Portuguese','ru':'Russian','tr':'Turkish','uk':'Ukrainian','vi':'Vietnamese','zh':'Simplified Chinese','zh-TW':'Traditional Chinese'}

# Editorial translations of the three-placeholder merge instruction keep source
# and target unambiguous across languages, where generation often drops one.
MERGE = {
'ar':'إسناد {{count}} مقاطع من {{from}} إلى {{to}}. يمكنك التراجع عن هذا الدمج.',
'cs':'Přiřadit {{count}} promluv od {{from}} k {{to}}. Toto sloučení lze vrátit zpět.',
'de':'{{count}} Beiträge von {{from}} zu {{to}} zuordnen. Diese Zusammenführung lässt sich rückgängig machen.',
'es':'Asignar {{count}} intervenciones de {{from}} a {{to}}. Puedes deshacer esta combinación.',
'fr':'Attribuer {{count}} interventions de {{from}} à {{to}}. Vous pouvez annuler cette fusion.',
'it':'Assegna {{count}} interventi da {{from}} a {{to}}. Puoi annullare questa unione.',
'ja':'{{from}} の発言 {{count}} 件を {{to}} に割り当てます。この統合は取り消せます。',
'ko':'{{from}}의 발언 {{count}}개를 {{to}}에게 할당합니다. 이 병합은 취소할 수 있습니다.',
'pl':'Przypisz {{count}} wypowiedzi od {{from}} do {{to}}. To scalenie można cofnąć.',
'pt':'Atribuir {{count}} falas de {{from}} a {{to}}. Você pode desfazer esta mesclagem.',
'ru':'Назначить {{count}} реплик от {{from}} участнику {{to}}. Это объединение можно отменить.',
'tr':'{{from}} kişisine ait {{count}} konuşma bölümünü {{to}} kişisine atayın. Bu birleştirmeyi geri alabilirsiniz.',
'uk':'Призначити {{count}} реплік від {{from}} учаснику {{to}}. Це об’єднання можна скасувати.',
'vi':'Gán {{count}} lượt nói từ {{from}} cho {{to}}. Bạn có thể hoàn tác việc hợp nhất này.',
'zh':'将 {{from}} 的 {{count}} 段发言分配给 {{to}}。你可以撤销此次合并。',
'zh-TW':'將 {{from}} 的 {{count}} 段發言指派給 {{to}}。你可以復原此次合併。',
}

def flatten(obj, prefix=''):
    out = {}
    for key, value in obj.items():
        path = prefix + key
        if isinstance(value,dict): out.update(flatten(value,path+'.'))
        else: out[path] = value
    return out

def validate(source, result):
    if not isinstance(result,dict) or result.keys() != source.keys(): raise ValueError('Translation keys changed')
    for key, value in result.items():
        if not isinstance(value,str) or not value.strip(): raise ValueError('Empty translation: '+key)
        if sorted(re.findall(r'\{\{[^}]+\}\}', value)) != sorted(re.findall(r'\{\{[^}]+\}\}', source[key])):
            raise ValueError('Interpolation placeholders changed: '+key)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--languages',nargs='*',default=list(LANGUAGES))
    parser.add_argument('--missing-only',action='store_true',help='Fill missing keys across the app without replacing existing translations')
    parser.add_argument('--model',type=pathlib.Path,default=ROOT/'.build/model-smoke/qwen3.5-9b')
    args=parser.parse_args()
    from mlx_lm import load, generate
    model, tokenizer=load(str(args.model.resolve(strict=True)))
    english=json.loads((ROOT/'src/i18n/locales/en/translation.json').read_text())
    source=flatten({key:english[key] for key in ('workspace','audioPlayer')})
    if args.missing_only:
        all_keys=flatten(english)
        missing=set()
        for language in args.languages:
            existing=flatten(json.loads((ROOT/'src/i18n/locales'/language/'translation.json').read_text()))
            missing.update(all_keys.keys()-existing.keys())
        source={key:value for key,value in all_keys.items() if key in missing}
    digest=hashlib.sha256(json.dumps(source,sort_keys=True).encode()).hexdigest()[:16]
    cache=ROOT/'.build/workspace-translations'/digest;cache.mkdir(parents=True,exist_ok=True)
    keys=list(source)
    for language in args.languages:
        name=LANGUAGES[language]
        translated={}
        for index in range(0,len(keys),28):
            chunk={key:source[key] for key in keys[index:index+28]}
            checkpoint=cache/f'{language}-{index}.json'
            if checkpoint.exists():
                result=json.loads(checkpoint.read_text());validate(chunk,result)
            else:
                instruction=(f'Translate all UI values into {name} for SilkScribe, a desktop dictation and meeting transcription app. '
                    'Use concise, natural interface language. Return only one JSON object with EXACTLY the supplied keys. '
                    'Never translate keys or interpolation placeholders such as {{model}}, {{count}}, {{title}}, {{gb}}. '
                    'Keep model/product names (Qwen, Whisper, pyannote, Community-1, Parakeet, MLX, SilkScribe), format names, and keyboard names unchanged. '
                    'Translate every other value, including button labels and help text. Preserve the meaning of local-only processing. No Markdown or explanations.')
                placeholders=sorted(set(re.findall(r'\{\{[^}]+\}\}',json.dumps(chunk))))
                masks={value:f'SS_P{index}_TOKEN' for index,value in enumerate(placeholders)}
                payload={key:value for key,value in chunk.items()}
                for key,value in payload.items():
                    for original,mask in masks.items():value=value.replace(original,mask)
                    payload[key]=value
                instruction+=' Keep every SS_P0_TOKEN-style token exactly unchanged. They are app-inserted names or numbers.'
                for attempt in range(3):
                    prompt=tokenizer.apply_chat_template([{'role':'system','content':instruction},{'role':'user','content':json.dumps(payload,ensure_ascii=False)}],tokenize=False,add_generation_prompt=True,enable_thinking=False)
                    text=generate(model,tokenizer,prompt=prompt,max_tokens=8192,verbose=False)
                    try:
                        text=text.split('</think>')[-1].strip()
                        if text.startswith('```'):text=text.split('\n',1)[1].rsplit('```',1)[0]
                        result=json.loads(text)
                        if isinstance(result,dict):
                            for key,value in result.items():
                                if isinstance(value,str):
                                    for original,mask in masks.items():value=value.replace(mask,original)
                                    result[key]=value
                        if isinstance(result,dict) and 'workspace.mergePreview' in chunk:
                            result['workspace.mergePreview']=MERGE[language]
                        validate(chunk,result)
                        checkpoint.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');break
                    except (ValueError,TypeError) as error:
                        if attempt == 2: raise
                        instruction+=' Previous output failed validation: '+str(error)+'. Correct that problem.'
            translated.update(result)
            print(f'{language}: {min(index+28,len(keys))}/{len(keys)} strings validated',flush=True)
        validate(source,translated)
        path=ROOT/'src/i18n/locales'/language/'translation.json'
        data=json.loads(path.read_text())
        for key,value in translated.items():
            parts=key.split('.');parent=data
            for part in parts[:-1]:parent=parent.setdefault(part,{})
            if args.missing_only and parts[-1] in parent:continue
            parent[parts[-1]]=value
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
        print(f'{language}: saved for language review',flush=True)

if __name__=='__main__':main()
