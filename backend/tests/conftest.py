import os
import tempfile

# Pixeltable reads this while modules are imported during test collection.
os.environ["PIXELTABLE_HOME"] = tempfile.mkdtemp(prefix="pixelbot-test-")
