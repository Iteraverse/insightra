import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from app import main


class ApplicationTest(unittest.TestCase):
    def test_startup_health_and_reopen(self):
        previous = main.DATABASE
        with tempfile.TemporaryDirectory() as directory:
            main.DATABASE = Path(directory) / "nested" / "test.sqlite3"
            try:
                for _ in range(2):
                    with TestClient(main.app) as client:
                        response = client.get("/api/health")
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response.json(), {"status": "ok", "database": "sqlite", "schema_version": 2})
                        self.assertEqual(client.get("/openapi.json").status_code, 200)
                self.assertTrue(main.DATABASE.exists())
            finally:
                main.DATABASE = previous

    def test_startup_without_local_industry_material(self):
        with patch('app.datasets.Path.is_file', return_value=False):
            self.test_startup_health_and_reopen()
