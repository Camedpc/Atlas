import pytest

from atlas.client import ConfigurationManquante, verifier_base_locale


def test_garde_fou_base_locale(monkeypatch):
    monkeypatch.delenv("ATLAS_BASE_LOCALE", raising=False)
    verifier_base_locale("https://exemple.supabase.co")  # sans garde-fou, tout est permis

    monkeypatch.setenv("ATLAS_BASE_LOCALE", "1")
    verifier_base_locale("http://127.0.0.1:54321")
    verifier_base_locale("http://localhost:54321")
    with pytest.raises(ConfigurationManquante):
        verifier_base_locale("https://uykaupigovrvgwsckbcn.supabase.co")
