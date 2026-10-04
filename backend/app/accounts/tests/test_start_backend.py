"""Tests for the shared local and container backend start command."""

import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_start_backend_help_lists_supported_flags():
    """Callers must be able to see --local and --install without starting the server."""
    result = subprocess.run(
        ["sh", "scripts/start-backend.sh", "--help"],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert "--local" in result.stdout
    assert "--install" in result.stdout


def test_start_backend_rejects_install_without_local_mode():
    """Keep installation out of the production container start path."""
    result = subprocess.run(
        ["sh", "scripts/start-backend.sh", "--install"],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "--install requires --local" in result.stderr


def test_start_backend_local_uses_project_venv(tmp_path):
    """Local mode must run Django through backend/.venv, not the caller shell."""
    scripts_dir = tmp_path / "scripts"
    backend_dir = tmp_path / "backend"
    scripts_dir.mkdir()
    backend_dir.mkdir()
    shutil.copy(REPO_ROOT / "scripts" / "start-backend.sh", scripts_dir / "start-backend.sh")
    (backend_dir / "requirements.txt").write_text("")
    (backend_dir / "manage.py").write_text("import sys\nprint(sys.executable)\n")

    result = subprocess.run(
        ["sh", str(scripts_dir / "start-backend.sh"), "--local"],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )

    venv_python = backend_dir / ".venv" / "bin" / "python"
    assert result.returncode == 0
    assert venv_python.exists()
    assert str(venv_python) in result.stdout
