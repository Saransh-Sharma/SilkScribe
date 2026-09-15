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
    def test_each_generation_can_only_cite_its_input_evidence(self):
        import json, tempfile, pathlib, types
        from unittest.mock import patch
        from worker import notes
        class Tokenizer:
            def encode(self,text): return list(text)
            def apply_chat_template(self,messages,**kwargs): return messages[-1]['content']
        with tempfile.TemporaryDirectory() as directory:
            pathlib.Path(directory,'installed.json').write_text('{}')
            bad={'summary':[{'text':'Unsupported','sources':['s1']}],'decisions':[],'actions':[]}
            runtime=types.SimpleNamespace(load=lambda _: (object(),Tokenizer()),generate=lambda *args,**kwargs:json.dumps(bad))
            request={'model_path':directory,'step':True,'segments':[{'id':'s0','text':'x'*6000},{'id':'s1','text':'y'*6000}]}
            with patch.dict('sys.modules',{'mlx_lm':runtime}):
                with self.assertRaises(ValueError): notes(request)
                # Consolidation cannot reach evidence absent from the supplied notes.
                request['continuation']={'chunk':2,'partial':[{'summary':[{'text':'Claim','sources':['s0']}],'decisions':[],'actions':[]}]*2}
                with self.assertRaises(ValueError): notes(request)
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
            prompt = kwargs['prompt']
            if prompt.startswith('Consolidate'):
                source = json.loads(prompt.split('\n',1)[1])[0]['summary'][0]['sources'][0]
            else:
                source = json.loads(prompt.split('\n')[0])['id']
            return json.dumps({'summary':[{'text':'Supported claim','sources':[source]}], 'decisions':[], 'actions':[]})
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
                self.assertTrue(result['notes']['summary'][0]['sources'][0] in {'s0','s1','s2'})

class SectionGenerationTests(unittest.TestCase):
    def test_only_requested_section_is_required_and_retained(self):
        for section in ('summary', 'decisions', 'actions'):
            result = validate_notes({section: [{'text': 'Supported', 'sources': ['s0']}]}, {'s0'}, section)
            self.assertEqual(len(result[section]), 1)
            self.assertTrue(all(not entries for key, entries in result.items() if key != section))
        with self.assertRaises(ValueError): validate_notes({}, {'s0'}, 'all')

    def test_section_scope_survives_chunking_and_rejects_wrong_checkpoint(self):
        import json, tempfile, pathlib, types
        from unittest.mock import patch
        from worker import notes
        class Tokenizer:
            def encode(self, text): return list(text)
            def apply_chat_template(self, messages, **kwargs): return messages[-1]['content']
        for section in ('summary', 'decisions', 'actions'):
            calls = []
            def generate(*args, **kwargs):
                content = kwargs['prompt']; calls.append(content)
                if content.startswith('Consolidate'):
                    source = json.loads(content.split('\n', 1)[1])[0][section][0]['sources'][0]
                else: source = json.loads(content.split('\n')[0])['id']
                return json.dumps({section: [{'text': 'Supported', 'sources': [source]}]})
            with tempfile.TemporaryDirectory() as directory:
                pathlib.Path(directory, 'installed.json').write_text('{}')
                runtime = types.SimpleNamespace(load=lambda _: (object(), Tokenizer()), generate=generate)
                request = {'model_path': directory, 'step': True, 'section': section,
                           'segments': [{'id': 's0', 'text': 'x'*6000}, {'id': 's1', 'text': 'y'*6000}]}
                with patch.dict('sys.modules', {'mlx_lm': runtime}):
                    first = notes(request)
                    request['continuation'] = json.loads(json.dumps(first['continuation']))
                    self.assertEqual(request['continuation']['section'], section)
                    other = 'actions' if section != 'actions' else 'summary'
                    with self.assertRaisesRegex(ValueError, 'different section'):
                        notes({**request, 'section': other})
                    second = notes(request)
                    request['continuation'] = second['continuation']
                    result = notes(request)['notes']
                    self.assertEqual(len(calls), 3)
                    self.assertEqual(len(result[section]), 1)
                    self.assertTrue(all(not entries for key, entries in result.items() if key != section))

if __name__=='__main__':unittest.main()
