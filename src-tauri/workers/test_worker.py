import unittest
from worker import validate_notes, chunk_bounds
class NotesTests(unittest.TestCase):
    def test_rejects_hallucinated_and_missing_sources(self):
        for sources in [[],['invented']]:
            with self.assertRaises(ValueError): validate_notes({'summary':[{'text':'Claim','sources':sources}],'decisions':[],'actions':[]},{'s1'})
    def test_does_not_invent_owners_or_dates(self):
        result=validate_notes({'summary':[],'decisions':[],'actions':[{'text':'Send draft','sources':['s1','s1']}]},{'s1'})
        self.assertIsNone(result['actions'][0]['owner']);self.assertIsNone(result['actions'][0]['due']);self.assertEqual(result['actions'][0]['sources'],['s1'])
    def test_rejects_wrong_output_shape(self):
        for output in [[],{}, {'summary':'no','decisions':[],'actions':[]}]:
            with self.assertRaises(ValueError):validate_notes(output,{'s1'})
class ChunkTests(unittest.TestCase):
    def test_original_offsets_and_last_partial_chunk(self):
        self.assertEqual(chunk_bounds({'start_seconds':120,'end_seconds':240}, 200*16000,16000),(120*16000,200*16000))
    def test_rejects_invalid_boundaries(self):
        for start,end in [(-1,120),(120,120),(float('nan'),120),(0,float('inf'))]:
            with self.assertRaises(ValueError): chunk_bounds({'start_seconds':start,'end_seconds':end},16000,16000)

class NotesContinuationTests(unittest.TestCase):
    def test_one_generation_per_step_and_resumable_reduction(self):
        import json, tempfile, pathlib, types
        from unittest.mock import patch
        from worker import notes
        class Tokenizer:
            def encode(self, text): return list(text)
            def apply_chat_template(self, messages, **kwargs): return messages[-1]['content']
        calls=[]
        def generate(*args, **kwargs):
            calls.append(kwargs['prompt'])
            return json.dumps({'summary':[{'text':'Supported claim','sources':['s0']}], 'decisions':[], 'actions':[]})
        with tempfile.TemporaryDirectory() as directory:
            pathlib.Path(directory,'installed.json').write_text('{}')
            request={'model_path':directory,'step':True,'segments':[{'id':f's{i}','text':'x'*6000} for i in range(3)]}
            runtime=types.SimpleNamespace(load=lambda _: (object(),Tokenizer()),generate=generate)
            with patch.dict('sys.modules', {'mlx_lm':runtime}):
                for _ in range(5):
                    before=len(calls)
                    result=notes(request)
                    self.assertEqual(len(calls)-before,1)
                    if 'notes' in result:break
                    # JSON round trip models writing and reloading the durable checkpoint.
                    request['continuation']=json.loads(json.dumps(result['continuation']))
                else:self.fail('Reduction did not finish')
                self.assertEqual(len(calls),5)
                self.assertEqual(result['notes']['summary'][0]['sources'],['s0'])

if __name__=='__main__':unittest.main()
