import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "update_links", Path(__file__).resolve().parents[1] / "update_links.py"
)
links = importlib.util.module_from_spec(spec)
spec.loader.exec_module(links)


class LinkPublishingTests(unittest.TestCase):
    def test_rejects_api_hosts_and_unrelated_destinations(self):
        for value in ["https://api.trycloudflare.com", "https://api.trycloudflare.com/tunnel",
                      "https://example.com", "http://new-public-hub-link.trycloudflare.com"]:
            self.assertFalse(links.valid_tunnel_url(value))
        self.assertTrue(links.valid_tunnel_url("https://new-public-hub-link.trycloudflare.com"))

    def test_retries_previously_committed_push_without_new_file_changes(self):
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            output = "1\n" if args[:3] == ("git", "rev-list", "--count") else ""
            return subprocess.CompletedProcess(args, 0, output, "")

        with patch.object(links, "SERVICES", []), patch.object(links, "STATIC_SERVICES", []), \
                patch.object(links.subprocess, "run", side_effect=run):
            links.main()
        self.assertEqual(calls[-2], ("/usr/bin/python3", links.GUARD, "preflight"))
        self.assertEqual(calls[-1], ("git", "push", "origin", "main"))

    def test_unreachable_replacement_preserves_published_address(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "mfk").mkdir()
            destination = root / "mfk/url.txt"
            destination.write_text("https://old-public-hub-link.trycloudflare.com")
            source = root / "new-url.txt"
            source.write_text("https://new-public-hub-link.trycloudflare.com")
            with patch.object(links, "HERE", tmp), \
                    patch.object(links, "SERVICES", [("mfk", "MFK", str(source))]), \
                    patch.object(links, "STATIC_SERVICES", []), \
                    patch.object(links, "reachable", return_value=False), \
                    patch.object(links.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "0\n", "")):
                links.main()
            self.assertEqual(destination.read_text(), "https://old-public-hub-link.trycloudflare.com")


if __name__ == "__main__":
    unittest.main()
