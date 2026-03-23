import os

os.environ["PRESET_PROFILE"] = "breaker"

with open("app.py") as f:
    exec(compile(f.read(), "app.py", "exec"))
