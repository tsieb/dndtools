"""Parser + dispatcher tests on the real roadmap: `python3 -m unittest tools/loop/tests/test_rcloop.py`."""
import json, os, re, sys, tempfile, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.environ["LOOP_CTL"] = tempfile.mkdtemp(prefix="rcloop-test-")
sys.path.insert(0, str(HERE.parent))
import rcloop as r  # noqa: E402

TEXT = (HERE.parent.parent.parent / "docs/planning/RC_ROADMAP.md").read_text()


class Parse(unittest.TestCase):
    def setUp(self):
        self.rm = r.parse_roadmap(TEXT)
        self.S = self.rm["stories"]

    def test_every_index_row_is_a_story(self):
        ids = {m.group(1) for m in r.INDEX_RE.finditer(TEXT)}
        self.assertTrue(ids <= set(self.S))
        self.assertGreater(len(self.S), 240)

    def test_fields(self):
        s = self.S["RC-STB-2.1"]
        self.assertEqual((s["size"], s["phase"], s["lane"]), ("L", "P0", "STB"))
        self.assertIn("screens/Settings.tsx", s["owns"])
        self.assertIn("settings.spec.ts", s["specs"])
        self.assertTrue(s["acceptance"])

    def test_deps_resolve_relative_and_cross_lane(self):
        self.assertEqual(self.S["RC-SYS-1.1"]["deps"], ["RC-STB-4.1"])
        self.assertEqual(self.S["RC-WID-1.3"]["deps"], ["RC-STB-4.2", "RC-WID-1.1"])
        self.assertEqual(self.S["RC-STB-2.7"]["deps"], [f"RC-STB-2.{i}" for i in range(1, 7)])

    def test_external_deps_mark_operator(self):
        self.assertTrue(self.S["RC-CLD-2.1"]["operator"])

    def test_owns_are_paths_not_identifiers(self):
        for s in self.S.values():
            for o in s["owns"]:
                self.assertFalse(re.match(r"^[A-Za-z]*[A-Z]\w*$", o), (s["id"], o))  # no CamelCase identifiers


class Dispatch(unittest.TestCase):
    def setUp(self):
        self.S = r.parse_roadmap(TEXT)["stories"]
        self.cfg = json.loads(json.dumps(r.DEFAULT_CONFIG))

    def test_phase_gate_starts_at_p0(self):
        self.assertEqual(r.open_phase_limit(self.S, {}, self.cfg), 0)
        c = r.candidates(self.S, {}, self.cfg)
        self.assertTrue(c and all(x["phase"] == "P0" for x in c))

    def test_deps_block(self):
        c = {x["id"] for x in r.candidates(self.S, {}, self.cfg)}
        self.assertNotIn("RC-STB-2.7", c)
        items = {f"RC-STB-2.{i}": {"status": "done"} for i in range(1, 7)}
        c = {x["id"] for x in r.candidates(self.S, items, self.cfg)}
        self.assertIn("RC-STB-2.7", c)

    def test_lane_cap_and_owns_overlap(self):
        items = {"RC-STB-2.1": {"status": "claimed", "claim": {"slot": 1, "since": r.now(), "pid": os.getpid()}}}
        c = {x["id"] for x in r.candidates(self.S, items, self.cfg)}
        self.assertNotIn("RC-STB-2.2", c)  # max_per_lane=1
        self.cfg["max_per_lane"] = 5
        c = {x["id"] for x in r.candidates(self.S, items, self.cfg)}
        self.assertIn("RC-STB-2.2", c)

    def test_soft_phase_mode_opens_p1_with_met_deps(self):
        self.cfg["phase"]["mode"] = "soft"
        items = {"RC-STB-4.1": {"status": "done"}}
        c = {x["id"] for x in r.candidates(self.S, items, self.cfg)}
        self.assertIn("RC-SYS-1.1", c)

    def test_usage_verdict(self):
        u = {"claude": {"ok": True, "session": {"pct": 50, "resets_at": r.now() + 3600}, "weekly": {"pct": 10, "resets_at": r.now() + 6 * 86400}, "scoped": {}}}
        self.assertEqual(r.usage_verdict(self.cfg, u, "claude")["allowed_slots"], 99)
        u["claude"]["session"]["pct"] = 75
        self.assertEqual(r.usage_verdict(self.cfg, u, "claude")["allowed_slots"], 1)
        u["claude"]["session"]["pct"] = 95
        self.assertEqual(r.usage_verdict(self.cfg, u, "claude")["allowed_slots"], 0)
        u["claude"]["session"]["pct"] = 10
        u["claude"]["weekly"] = {"pct": 60, "resets_at": r.now() + 6 * 86400}  # far ahead of pace
        self.assertEqual(r.usage_verdict(self.cfg, u, "claude")["allowed_slots"], 1)

    def test_routing(self):
        u = {"claude": {"ok": True, "scoped": {"fable": {"pct": 99}}}}
        self.assertEqual(r.route_model(self.cfg, u, self.S["RC-STB-2.1"], {"model": "auto"}), ("opus", "high"))
        self.assertEqual(r.route_model(self.cfg, u, self.S["RC-STB-3.1"], {"model": "auto"})[0], "sonnet")  # docs-only
        self.assertEqual(r.route_model(self.cfg, u, self.S["RC-STB-2.1"], {"model": "fable"})[0], "opus")  # scoped limit hit


class Result(unittest.TestCase):
    def test_claude_result_and_limit(self):
        d = tempfile.mkdtemp()
        p = Path(d, "a.log")
        p.write_text('{"type":"assistant"}\n{"type":"result","is_error":false,"result":"done","total_cost_usd":1.5,"num_turns":9,"duration_ms":100,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":30,"cache_creation_input_tokens":40},"modelUsage":{"claude-opus-5":{"inputTokens":10,"outputTokens":20,"costUSD":1.5}}}\n')
        x = r.parse_result(p, "claude")
        self.assertTrue(x["found"]); self.assertEqual(x["tokens_out"], 20); self.assertFalse(x["limit"])
        p.write_text('{"type":"result","is_error":true,"result":"You\'ve hit your session limit · resets 4:20am (America/Vancouver)"}\n')
        x = r.parse_result(p, "claude")
        self.assertTrue(x["limit"])
        p.write_text("I told my subagents: You've hit your session limit is what they saw\n" + '{"type":"result","is_error":false,"result":"ok"}\n')
        self.assertFalse(r.parse_result(p, "claude")["limit"])  # prose never trips the detector once a result exists


if __name__ == "__main__":
    unittest.main()
