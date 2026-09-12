import os
import socket
import subprocess
import sys
from pathlib import Path


def test_schema_check_uses_an_isolated_catalog() -> None:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(Path(__file__).parents[1])
    with socket.socket() as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        env["PXT_PORT"] = str(port_socket.getsockname()[1])
    pxt = str(Path(sys.executable).with_name("pxt"))
    result = subprocess.run(
        [pxt, "schema", "check", "pixelbot/app.py"],
        cwd=Path(__file__).parents[1],
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    subprocess.run(
        [pxt, "daemon", "stop"],
        cwd=Path(__file__).parents[1],
        env=env,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
