"""Isolated dashboard HTTP fixture: real handlers/config, fake usage, no workers or network."""
import copy
import json
import os
import sys
import tempfile
import types
from pathlib import Path

os.environ["LOOP_CTL"] = tempfile.mkdtemp(prefix="rcloop-dashboard-")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import rcloop as r

cfg = copy.deepcopy(r.DEFAULT_CONFIG)
r.save_config(cfg)
usage = {"at":r.now(),"claude":{"ok":True,"session":{"pct":42,"resets_at":r.now()+7200},
         "weekly":{"pct":61,"resets_at":r.now()+86400},"scoped":{}},"codex":{"ok":True,"limits":{
         "codex:":[{"pct":24,"window_min":10080,"resets_at":r.now()+86400*3}],
         "codex_bengalfox:Spark":[{"pct":18,"window_min":300,"resets_at":r.now()+3600},
                                 {"pct":35,"window_min":10080,"resets_at":r.now()+86400}]}}}
r.get_usage = lambda *args, **kwargs: usage
r.Supervisor.run = lambda self: None
r.git = lambda *args, **kwargs: ""
roadmap = r.parse_roadmap((r.MAIN / r.ROADMAP_REL).read_text())
r.load_roadmap = lambda *args: roadmap
r.write_json(r.STATE / "supervisor.json", {"pid":os.getpid()})
log = r.CTL / "worker log.jsonl"
log.write_text('Fixture worker log. <script>not markup</script>\n')
r.write_json(r.STATE / "slot-1" / "runner.json", {"pid":os.getpid()})
r.write_json(r.STATE / "slot-1" / "heartbeat.json", {"state":"working","item":"RC-STB-2.1","log":str(log),"since":r.now()-240})
items = {sid:{"status":"done"} for sid in list(roadmap["stories"])[:8]}
r.save_items(items)
r.RUNS.write_text(json.dumps({"at":r.now(),"id":"RC-STB-1.1","slot":1,"model":r.ASTRA,"backend":"codex",
                             "effort":"medium","outcome":"landed","size":"S","tokens_total":4800,"tokens_out":800,
                             "seconds":130,"attempts":1,"commit":"abc1234"})+'\n')
r.cmd_serve(types.SimpleNamespace(port=int(sys.argv[1])))
