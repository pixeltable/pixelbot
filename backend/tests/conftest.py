import os
import subprocess
import tempfile
from importlib.util import find_spec
from pathlib import Path

# Pixeltable reads this while modules are imported during test collection.
TEST_CATALOG = Path(tempfile.mkdtemp(prefix="pixelbot-test-"))
os.environ["PIXELTABLE_HOME"] = str(TEST_CATALOG)


def pytest_sessionfinish(session, exitstatus) -> None:
    """Stop the temporary PostgreSQL server that Pixeltable keeps persistent."""
    pgdata = TEST_CATALOG / "pgdata"
    if not (pgdata / "postmaster.pid").exists():
        return
    package = find_spec("pixeltable_pgserver")
    if package is None or package.submodule_search_locations is None:
        return
    executable = Path(next(iter(package.submodule_search_locations))) / "pginstall" / "bin" / "pg_ctl"
    subprocess.run(
        [str(executable), "-D", str(pgdata), "stop", "-m", "fast"],
        capture_output=True,
        check=False,
        timeout=30,
    )
