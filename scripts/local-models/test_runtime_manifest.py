import importlib.util
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('package_runtime', pathlib.Path(__file__).with_name('package-runtime.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RuntimeManifestTests(unittest.TestCase):
    def test_dependency_bytes_and_symlinks_affect_fingerprint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'worker').write_bytes(b'executable')
            (root / 'dependency').write_bytes(b'first')
            (root / 'alias').symlink_to('dependency')
            def fingerprint():
                module.write_manifest(root, 'notes')
                return json.loads((root / 'runtime-manifest.json').read_text())['sha256']
            first = fingerprint()
            self.assertEqual(first, fingerprint())
            (root / 'dependency').write_bytes(b'other')
            second = fingerprint()
            self.assertNotEqual(first, second)
            (root / 'alias').unlink()
            (root / 'alias').symlink_to('worker')
            self.assertNotEqual(second, fingerprint())


if __name__ == '__main__':
    unittest.main()
