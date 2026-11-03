"""Smoke preparation must verify offline files and never accept unpublished packs."""
import hashlib
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('smoke', pathlib.Path(__file__).with_name('smoke.py'))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokePreparationTests(unittest.TestCase):
    def test_empty_unpublished_pack_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'no published artifacts'):
            smoke.install({'id': 'community-1', 'artifacts': []}, download=False)

    def test_offline_preparation_checks_hashes_without_fetching(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(smoke, 'ROOT', pathlib.Path(directory)), patch.object(smoke.urllib.request, 'urlopen') as fetch:
            payload = b'valid model bytes'
            pack = {'id': 'test', 'artifacts': [{'path': 'weights.bin', 'bytes': len(payload),
                    'sha256': hashlib.sha256(payload).hexdigest(), 'url': 'https://example.invalid/weights'}]}
            with self.assertRaisesRegex(ValueError, 'Missing or corrupt'):
                smoke.install(pack, download=False)
            root = pathlib.Path(directory) / '.build/model-smoke/test'
            (root / 'weights.bin').write_bytes(payload)
            self.assertEqual(smoke.install(pack, download=False), str(root))
            (root / 'weights.bin').write_bytes(b'x' * len(payload))
            with self.assertRaisesRegex(ValueError, 'Missing or corrupt'):
                smoke.install(pack, download=False)
            fetch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
