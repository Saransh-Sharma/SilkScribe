import unittest
from evaluate import score


class EvaluationTests(unittest.TestCase):
    def test_word_errors_and_timing_use_only_real_matched_word_boundaries(self):
        result = score({'text': 'hello brave world', 'words': [
            {'text': 'hello', 'start': 0, 'end': 1},
            {'text': 'brave', 'start': 1, 'end': 2},
            {'text': 'world', 'start': 2, 'end': 3}]}, {'result': {'segments': [
            {'text': 'hello', 'start': .1, 'end': 1.1},
            {'text': 'world', 'start': 2.1, 'end': 3.1}]}}, 4)
        self.assertAlmostEqual(result['transcription']['wer'], 1 / 3)
        self.assertEqual(result['timing']['matched_words'], 2)
        self.assertAlmostEqual(result['timing']['boundary_mae_seconds'], .1)

    def test_diarization_maps_speakers_globally_and_scores_overlap(self):
        reference = {'turns': [{'start': 0, 'end': 3, 'speaker': 'Alice'}, {'start': 1, 'end': 2, 'speaker': 'Bob'}]}
        perfect = {'result': {'turns': [{'start': 0, 'end': 3, 'speaker': 'speaker-9'}, {'start': 1, 'end': 2, 'speaker': 'speaker-2'}]}}
        self.assertEqual(score(reference, perfect, 3)['diarization']['diarization error rate'], 0)
        missing_overlap = {'result': {'turns': perfect['result']['turns'][:1]}}
        self.assertAlmostEqual(score(reference, missing_overlap, 3)['diarization']['diarization error rate'], .25)

    def test_phrase_timestamps_are_not_expanded_to_words(self):
        result = score({'words': [{'text': 'hello', 'start': 0, 'end': 1}]}, {'segments': [{'text': 'hello world', 'start': 0, 'end': 2}]}, 2)
        self.assertFalse(result['timing']['available'])

    def test_citations_are_not_treated_as_proof_of_factuality(self):
        reference = {'segments': [{'id': 's0', 'text': 'A meeting happened.'}]}
        prediction = {'notes': {'summary': [{'text': 'Invented claim', 'sources': ['s0']}], 'decisions': [], 'actions': []}}
        result = score(reference, prediction, 0)
        self.assertEqual(result['notes']['invalid_source_references'], 0)
        self.assertIsNone(result['notes']['human_supported_fraction'])
        reviewed = score(reference, prediction, 0, [{'section': 'summary', 'index': 0, 'supported': False}])
        self.assertEqual(reviewed['notes']['human_supported_fraction'], 0)
        with self.assertRaises(ValueError):
            score(reference, prediction, 0, [])

    def test_failed_and_fallback_outputs_are_not_scored(self):
        with self.assertRaises(ValueError):
            score({}, {'error': 'worker crashed'}, 1)
        with self.assertRaises(ValueError):
            score({}, {'result': {'fallback': 'large'}}, 1)


if __name__ == '__main__':
    unittest.main()
