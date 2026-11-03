import unittest
from worker import validate_notes, chunk_bounds, as_document, validate_answer
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
class EnhanceTests(unittest.TestCase):
    def test_keeps_the_persons_points_without_sources(self):
        result=validate_notes({'summary':[{'text':'Ship Friday','sources':[],'origin':'user'},{'text':'Budget agreed','sources':['s1'],'origin':'ai'}],'decisions':[],'actions':[]},{'s1'})
        self.assertEqual(result['summary'][0],{'text':'Ship Friday','sources':[],'origin':'user'})
        self.assertEqual(result['summary'][1],{'text':'Budget agreed','sources':['s1']})
    def test_drops_invented_sources_from_the_persons_points(self):
        result=validate_notes({'summary':[{'text':'Ship Friday','sources':['invented','s1'],'origin':'user'}],'decisions':[],'actions':[]},{'s1'})
        self.assertEqual(result['summary'][0]['sources'],['s1'])
    def test_ai_points_still_need_sources(self):
        with self.assertRaises(ValueError): validate_notes({'summary':[{'text':'Claim','sources':[],'origin':'ai'}],'decisions':[],'actions':[]},{'s1'})
    def test_the_persons_notes_reach_every_chunk_prompt(self):
        import json, tempfile, pathlib, types
        from unittest.mock import patch
        from worker import notes
        class Tokenizer:
            def encode(self,text): return list(text)
            def decode(self,tokens): return ''.join(tokens)
            def apply_chat_template(self,messages,**kwargs): return messages[0]['content']+'\n'+messages[-1]['content']
        prompts=[]
        def generate(*args,**kwargs):
            prompts.append(kwargs['prompt'])
            return json.dumps({'summary':[{'text':'Ship Friday','sources':[],'origin':'user'}],'decisions':[],'actions':[]})
        with tempfile.TemporaryDirectory() as directory:
            pathlib.Path(directory,'installed.json').write_text('{}')
            runtime=types.SimpleNamespace(load=lambda _: (object(),Tokenizer()),generate=generate)
            request={'model_path':directory,'segments':[{'id':'s0','text':'We ship on Friday.'}],'user_notes':'- ship friday'}
            with patch.dict('sys.modules',{'mlx_lm':runtime}):
                result=notes(request)
        self.assertIn('<user_notes>\n- ship friday\n</user_notes>',prompts[0])
        self.assertIn('"origin":"user"',prompts[0])
        self.assertEqual(result['summary'][0],{'text':'Ship Friday','sources':[],'origin':'user'})

STANDUP={'id':'standup','meeting':'a team standup','decisions':False,'sections':[
    {'id':'done','title':'Done','guidance':'finished work'},{'id':'blockers','title':'Blockers','guidance':'what is in the way'}]}
class TemplateTests(unittest.TestCase):
    def test_template_sections_are_cited_like_any_other(self):
        result=validate_notes({'summary':[],'actions':[],'blockers':[{'text':'Waiting on design','sources':['s1']}]},{'s1'},template=STANDUP)
        self.assertEqual(result['blockers'],[{'text':'Waiting on design','sources':['s1']}])
        # Left-out sections are empty; decisions aren't required by a standup.
        self.assertEqual(result['done'],[]);self.assertEqual(result['decisions'],[])
        with self.assertRaises(ValueError):
            validate_notes({'summary':[],'actions':[],'blockers':[{'text':'Claim','sources':['invented']}]},{'s1'},template=STANDUP)
    def test_general_notes_still_need_every_core_section(self):
        with self.assertRaises(ValueError): validate_notes({'summary':[],'actions':[]},{'s1'})
    def test_templates_cannot_shadow_core_sections(self):
        for bad in [{'sections':[{'id':'summary','title':'x'}]},{'sections':[{'id':'a'},{'id':'a'}]},{'sections':'no'}]:
            with self.assertRaises(ValueError): validate_notes({'summary':[],'actions':[]},{'s1'},template=bad)
    def test_template_notes_reach_the_app_as_ordered_sections(self):
        flat=validate_notes({'summary':[],'actions':[],'done':[{'text':'Shipped','sources':['s1']}]},{'s1'},template=STANDUP)
        document=as_document(flat,STANDUP)
        self.assertEqual([s['id'] for s in document['sections']],['done','blockers'])
        self.assertEqual(document['sections'][0]['title'],'Done')
        self.assertEqual(document['sections'][0]['items'][0]['text'],'Shipped')
        self.assertNotIn('done',document)
    def test_the_prompt_asks_for_the_templates_sections(self):
        import json, tempfile, pathlib, types
        from unittest.mock import patch
        from worker import notes
        class Tokenizer:
            def encode(self,text): return list(text)
            def decode(self,tokens): return ''.join(tokens)
            def apply_chat_template(self,messages,**kwargs): return messages[0]['content']+'\n'+messages[-1]['content']
        prompts=[]
        def generate(*args,**kwargs):
            prompts.append(kwargs['prompt'])
            return json.dumps({'summary':[],'actions':[],'blockers':[{'text':'Waiting on design','sources':['s0']}]})
        with tempfile.TemporaryDirectory() as directory:
            pathlib.Path(directory,'installed.json').write_text('{}')
            runtime=types.SimpleNamespace(load=lambda _: (object(),Tokenizer()),generate=generate)
            request={'model_path':directory,'segments':[{'id':'s0','text':'Still waiting on design.'}],'template':STANDUP}
            with patch.dict('sys.modules',{'mlx_lm':runtime}):
                result=notes(request)
        self.assertIn('a team standup',prompts[0]);self.assertIn('"blockers": what is in the way',prompts[0])
        self.assertNotIn('"decisions"',prompts[0])
        self.assertEqual(result['sections'][1]['items'][0]['text'],'Waiting on design')
class AskTests(unittest.TestCase):
    def test_answers_cite_only_the_passages_given(self):
        result=validate_answer({'answer':'Pricing ships Friday [p1], legal reviews it [p9].','citations':['p1','p9','p2']},{'p1','p2'})
        self.assertEqual(result['answer'],'Pricing ships Friday [p1], legal reviews it.')
        self.assertEqual(result['citations'],['p1','p2'])
    def test_inline_markers_count_as_citations(self):
        result=validate_answer({'answer':'Monday [p3].'},{'p3'})
        self.assertEqual(result['citations'],['p3'])
    def test_rejects_answers_without_text(self):
        for bad in [[], {'citations':['p1']}, {'answer':3}]:
            with self.assertRaises(ValueError): validate_answer(bad,{'p1'})
    def test_the_question_and_passages_reach_the_model(self):
        import json, tempfile, pathlib, types
        from unittest.mock import patch
        from worker import ask
        class Tokenizer:
            def encode(self,text): return list(text)
            def apply_chat_template(self,messages,**kwargs): return messages[0]['content']+'\n'+messages[-1]['content']
        prompts=[]
        def generate(*args,**kwargs):
            prompts.append(kwargs['prompt'])
            return json.dumps({'answer':'Friday [p1].','citations':['p1']})
        with tempfile.TemporaryDirectory() as directory:
            pathlib.Path(directory,'installed.json').write_text('{}')
            runtime=types.SimpleNamespace(load=lambda _: (object(),Tokenizer()),generate=generate)
            request={'model_path':directory,'question':'When does pricing ship?','passages':[{'id':'p1','title':'Design review','date':'2026-10-01','text':'Pricing ships Friday.'}]}
            with patch.dict('sys.modules',{'mlx_lm':runtime}):
                result=ask(request)
        self.assertIn('When does pricing ship?',prompts[0]);self.assertIn('Pricing ships Friday.',prompts[0])
        self.assertEqual(result,{'answer':'Friday [p1].','citations':['p1']})
class RecipeTests(unittest.TestCase):
    def test_writes_from_passages_and_keeps_only_real_citations(self):
        import tempfile, pathlib, types
        from unittest.mock import patch
        from worker import recipe
        class Tokenizer:
            def encode(self,text): return list(text)
            def apply_chat_template(self,messages,**kwargs): return messages[0]['content']+'\n'+messages[-1]['content']
        prompts=[]
        def generate(*args,**kwargs):
            prompts.append(kwargs['prompt'])
            return 'Thanks for today.\n- Sam sends the screens Friday [p1]\n- Budget approved [p9]'
        with tempfile.TemporaryDirectory() as directory:
            pathlib.Path(directory,'installed.json').write_text('{}')
            runtime=types.SimpleNamespace(load=lambda _: (object(),Tokenizer()),generate=generate)
            request={'model_path':directory,'instruction':'Write a follow-up email.','passages':[{'id':'p1','title':'Design review','date':'2026-10-01','text':'Sam will send the screens Friday.'}]}
            with patch.dict('sys.modules',{'mlx_lm':runtime}):
                result=recipe(request)
        self.assertIn('<recipe>\nWrite a follow-up email.',prompts[0]);self.assertIn('untrusted data',prompts[0])
        self.assertEqual(result['citations'],['p1'])
        self.assertNotIn('[p9]',result['answer'])
        self.assertFalse(result['truncated'])
    def test_needs_an_instruction(self):
        from worker import recipe
        with self.assertRaises(ValueError): recipe({'instruction':' ','passages':[]})

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
