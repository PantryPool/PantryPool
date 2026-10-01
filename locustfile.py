"""
Root Locust entrypoint delegating to tests/locust/locustfile.py
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from tests.locust.locustfile import PantryPoolUser, on_test_start

__all__ = ["PantryPoolUser", "on_test_start"]
