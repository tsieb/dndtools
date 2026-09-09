"""Parser + dispatcher tests on the real roadmap: `python3 -m unittest tools/loop/tests/test_rcloop.py`."""
import json, os, re, sys, tempfile, unittest
import contextlib, copy, io, types
import subprocess
from unittest.mock import patch
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


class RelatedSpecs(unittest.TestCase):
    def test_real_map_surfaces_include_other_stories(self):
        specs = r.related_e2e_specs(["map-editor.spec.ts"], HERE.parent.parent.parent)
        self.assertTrue({"map-editor.spec.ts", "android-quick-map.spec.ts", "atlas.spec.ts",
                         "map-tile.spec.ts", "canvas.spec.ts"} <= set(specs))

    def test_routes_ownership_and_missing_seeds(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            specs = repo / "apps/gm-react/tests/e2e"
            specs.mkdir(parents=True)
            for name, source in {
                "named": "gotoRoute(page, '/settings?tab=ai')",
                "peer": "page.goto('/#/settings?tab=general')",
                "bridge": "gotoRoute(page, '/settings'); gotoRoute(page, '/board')",
                "unrelated": "gotoRoute(page, '/board')",
                "owned": "gotoRoute(page, `/character/${id}`)",
                "character": "gotoRoute(page, '/character/new')",
            }.items():
                (specs / f"{name}.spec.ts").write_text(source)
            selected = r.related_e2e_specs(["named.spec.ts", "missing.spec.ts"], repo)
            self.assertEqual(selected, ["bridge.spec.ts", "missing.spec.ts", "named.spec.ts", "peer.spec.ts"])
            story = {"specs": ["named.spec.ts"], "owns": ["screens/Settings"]}
            peer = {"specs": ["owned.spec.ts", "future.spec.ts"], "owns": ["screens/Settings/Ai.tsx"]}
            selected = r.story_e2e_specs([story], {"a": story, "b": peer}, repo)
            self.assertIn("character.spec.ts", selected)
            self.assertNotIn("future.spec.ts", selected)
            self.assertEqual(r.related_e2e_specs([], repo), [])


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


class ModelPickup(unittest.TestCase):
    def setUp(self):
        self.cfg = copy.deepcopy(r.DEFAULT_CONFIG)
        self.cfg["usage"]["pace"] = False
        self.slot = copy.deepcopy(self.cfg["slots"][0])
        self.story = dict(id="RC-DOC-1.1", title="Document shortcuts", size="S", phase="P0", lane="DOC",
                          owns=["docs/shortcuts.md"], owns_text="`docs/shortcuts.md`", docs_only=True,
                          specs=[], attempts=0, operator=False, acceptance="List supported shortcuts", body="Small bounded guide",
                          deps=[], unlocks=0, num=(1,1), status="open", section="Shortcuts", lines=[1,2], line=1)
        self.usage = {"at":r.now(), "claude":{"ok":True,"session":{"pct":1},"weekly":{"pct":1},"scoped":{}},
                      "codex":{"ok":True,"limits":{
                          "codex:":[{"pct":5,"window_min":10080,"resets_at":r.now()+86400}],
                          "codex_bengalfox:Spark":[{"pct":99,"window_min":10080,"resets_at":r.now()+86400},
                                                  {"pct":20,"window_min":300,"resets_at":r.now()+3600}]}}}

    def routes(self, **changes):
        return r.pickup_routes(self.cfg,self.usage,{**self.story,**changes},self.slot)

    def test_astra_reasoning_and_explicit_pins(self):
        self.slot.update(backend="codex",model=r.ASTRA)
        for size,effort in [("S","medium"),("M","high"),("L","xhigh"),("XL","xhigh")]:
            self.assertEqual(self.routes(size=size,docs_only=False)[0]["effort"],effort)
        self.assertEqual(self.routes()[0]["effort"],"low")
        self.assertEqual(self.routes(attempts=1)[0]["effort"],"max")
        self.slot["effort"]="high"
        self.assertEqual(self.routes()[0]["effort"],"high")

    def test_separate_pools_and_final_weekly_percentage(self):
        self.assertEqual(self.routes()[0]["model"],r.SPARK)
        self.usage["codex"]["limits"]["codex:"][0]["pct"]=100
        self.assertEqual(self.routes()[0]["model"],r.SPARK)
        self.usage["codex"]["limits"]["codex_bengalfox:Spark"][0]["pct"]=100
        self.assertNotIn(r.SPARK,[x["model"] for x in self.routes()])
        self.usage["codex"]["limits"]["codex:"][0]["pct"]=5
        self.slot.update(backend="codex")
        self.assertEqual(self.routes()[0]["model"],r.ASTRA)

    def test_missing_empty_and_expired_quota_fail_closed(self):
        self.slot.update(backend="codex")
        for snapshot in ({"ok":False},{"ok":True,"limits":{}}):
            self.usage["codex"]=snapshot
            self.assertEqual(self.routes(),[])
        self.usage["codex"]={"ok":True,"limits":{"codex:":[{"pct":0,"window_min":10080,"resets_at":r.now()-10}]}}
        self.assertEqual(self.routes(),[])

    def test_missing_spark_weekly_never_uses_general_quota(self):
        self.usage["codex"]["limits"].pop("codex_bengalfox:Spark")
        self.assertNotIn(r.SPARK,[x["model"] for x in self.routes()])

    def test_disabled_models_pins_and_fallbacks(self):
        self.cfg["models"]={m:False for m in self.cfg["models"]}
        self.assertEqual(self.routes(),[])
        self.cfg["models"][r.ASTRA]=True
        self.assertEqual([x["model"] for x in self.routes()],[r.ASTRA])
        self.slot["model"]=r.SPARK
        self.assertEqual(self.routes(),[])

    def test_spark_capability_boundaries(self):
        for changes in ({"size":"M"},{"attempts":1},{"title":"Security policy"},{"acceptance":"Review screenshots"},
                        {"operator":True},{"owns":[]},{"body":"x"*17000},{"title":"Architecture migration"}):
            with self.subTest(changes=changes):
                self.assertNotIn(r.SPARK,[x["model"] for x in self.routes(**changes)])
        self.cfg["spark"]["specialties"]=["tests"]
        self.assertNotIn(r.SPARK,[x["model"] for x in self.routes()])
        self.assertEqual(self.routes(docs_only=False,owns=["tests/parser.test.ts"])[0]["model"],r.SPARK)

    def test_spark_catch_up_capacity_and_batch_counting(self):
        self.usage["codex"]["limits"]["codex_bengalfox:Spark"][0]["pct"]=10
        items={"a":{"status":"claimed","claim":{"slot":2,"pool":"spark","pid":os.getpid()}},
               "b":{"status":"claimed","claim":{"slot":2,"pool":"spark","pid":os.getpid()}}}
        self.assertTrue(r.spark_budget(self.cfg,self.usage)["catch_up"])
        routes=r.pickup_routes(self.cfg,self.usage,self.story,self.slot,1,items)
        self.assertEqual(routes[0]["model"],r.SPARK)
        items["c"]={"status":"claimed","claim":{"slot":3,"pool":"spark","pid":os.getpid()}}
        self.assertNotIn(r.SPARK,[x["model"] for x in r.pickup_routes(self.cfg,self.usage,self.story,self.slot,1,items)])

    def test_claude_soft_limit_is_not_absolute_slot_number(self):
        self.cfg["models"][r.SPARK]=False
        self.slot["backend"]="claude"
        self.usage["claude"]["session"]["pct"]=75
        self.assertTrue(r.pickup_routes(self.cfg,self.usage,self.story,self.slot,5,{}))
        items={"a":{"status":"claimed","claim":{"slot":2,"pool":"claude","pid":os.getpid()}}}
        self.assertEqual(r.pickup_routes(self.cfg,self.usage,self.story,self.slot,5,items),[])

    def test_normalization_preserves_null_named_pools_and_legacy(self):
        win={"usedPercent":50,"windowDurationMins":10080,"resetsAt":r.now()+1000}
        u=r.normalize_codex_usage({"rateLimitsByLimitId":{"codex":{"limitName":None,"primary":win},
                                                       "codex_bengalfox":{"limitName":"Spark","secondary":win}}})
        self.assertEqual(len(u["limits"]),2)
        self.assertEqual(len(r.codex_windows({"codex":u},True)),1)
        u=r.normalize_codex_usage({"rateLimits":{"primary":win}})
        self.assertEqual(len(r.codex_windows({"codex":u})),1)

    def test_invalid_policy_rejected_without_changing_saved_config(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(r,"CTL",Path(folder)):
            r.save_config(self.cfg)
            before=(Path(folder)/"config.json").read_text()
            for bad in ({"models":{r.ASTRA:"yes"}},{"spark":{"effort":"max"}},
                        {"spark":{"weekly_target_pct":101}},{"codex":{"effort":"none"}},
                        {"spark":{"specialties":["security"]}}):
                with self.assertRaises(ValueError):
                    r.save_config(r.deep_merge(self.cfg,bad))
                self.assertEqual((Path(folder)/"config.json").read_text(),before)

    def test_backend_forwards_model_reasoning_and_resume_thread(self):
        with tempfile.TemporaryDirectory() as folder:
            cli=Path(folder)/"codex"
            cli.write_text(f"#!{sys.executable}\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n")
            cli.chmod(0o755)
            prompt=Path(folder)/"prompt.md"
            prompt.write_text("Fixture only")
            env={**os.environ,"PATH":folder+os.pathsep+os.environ["PATH"],"LOOP_MODEL":r.ASTRA,"LOOP_EFFORT":"xhigh"}
            for verb in ("start","resume"):
                result=subprocess.run(["bash",str(HERE.parent/"lib/backend-codex.sh"),verb,"fixture-thread",str(prompt)],env=env,capture_output=True,text=True,check=True)
                args=json.loads(result.stdout)
                self.assertEqual(args[args.index("-m")+1],r.ASTRA)
                self.assertIn('model_reasoning_effort="xhigh"',args)
                if verb=="resume":
                    self.assertEqual(args[:3],["exec","resume","fixture-thread"])

    def test_quota_probe_waits_for_initialize_and_keeps_stdin_open(self):
        popen=subprocess.Popen
        script='''import json,sys
first=json.loads(sys.stdin.readline())
assert first['method']=='initialize'
print(json.dumps({'id':1,'result':{}}),flush=True)
assert json.loads(sys.stdin.readline())['method']=='initialized'
request=json.loads(sys.stdin.readline())
assert request['method']=='account/rateLimits/read'
print(json.dumps({'id':2,'result':{'rateLimits':{'primary':{'usedPercent':12,'windowDurationMins':10080,'resetsAt':9999999999}}}}),flush=True)
sys.stdin.read()
'''
        with patch.object(r.subprocess,"Popen",side_effect=lambda _args,**kwargs:popen([sys.executable,"-c",script],**kwargs)):
            snapshot=r.fetch_codex_usage()
        self.assertTrue(snapshot["ok"])
        self.assertEqual(r.codex_windows({"codex":snapshot})[0]["pct"],12)

    def test_enabling_codex_invalidates_no_slot_usage_cache(self):
        cached={"at":r.now(),"claude":{"ok":True},"codex":{"ok":False,"error":"no codex slot"}}
        with tempfile.TemporaryDirectory() as folder,patch.object(r,"USAGE",Path(folder)/"usage.json"), \
             patch.object(r,"fetch_claude_usage",return_value=self.usage["claude"]), \
             patch.object(r,"fetch_codex_usage",return_value=self.usage["codex"]) as probe:
            r.write_json(r.USAGE,cached)
            self.assertTrue(r.get_usage(self.cfg)["codex"]["ok"])
            probe.assert_called_once()

    def test_codex_metrics_do_not_report_missing_cost_as_free(self):
        result=r.metrics([{"model":r.ASTRA,"backend":"codex","outcome":"landed","size":"S","tokens_total":50}],self.cfg)
        self.assertIsNone(result["all"]["cost_per_fp"])

    def claim(self, items=None):
        buf=io.StringIO()
        with patch.object(r,"load_config",return_value=self.cfg),patch.object(r,"get_usage",return_value=self.usage), \
             patch.object(r,"load_roadmap",return_value={"stories":{self.story["id"]:self.story},"hash":"test"}), \
             patch.object(r,"load_items",return_value=items or {}),patch.object(r,"save_items"),contextlib.redirect_stdout(buf):
            rc=r.cmd_claim(types.SimpleNamespace(slot="1",run="001",repo=None))
        return rc,json.loads(buf.getvalue()) if buf.getvalue() else None

    def test_actual_claim_selects_spark_and_emits_codex_backend(self):
        rc,it=self.claim()
        self.assertEqual(rc,0)
        self.assertEqual((it["model"],it["backend"],it["pool"]),(r.SPARK,"codex","spark"))
        self.assertEqual(it["size"],"S")

    def test_crashed_spark_claim_reassigns_retry_to_general_model(self):
        items={self.story["id"]:{"status":"claimed","attempts":1,"claim":{"slot":1,"model":r.SPARK}}}
        rc,it=self.claim(items)
        self.assertEqual(rc,0)
        self.assertNotEqual(it["model"],r.SPARK)

    def test_disabled_pin_cannot_reclaim_crashed_work(self):
        self.cfg["slots"][0]["model"]=r.SPARK
        self.cfg["models"][r.SPARK]=False
        items={self.story["id"]:{"status":"claimed","attempts":1,"claim":{"slot":1,"model":r.SPARK}}}
        rc,it=self.claim(items)
        self.assertEqual(rc,3)
        self.assertIsNone(it)
        self.assertEqual(items[self.story["id"]]["status"],"open")


class Resources(unittest.TestCase):
    def test_slot_env_exports_the_machine_budget(self):
        import io, contextlib, types
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            r.cmd_slot_env(types.SimpleNamespace(slot="2"))
        env = dict(line[len("export "):].split("=", 1) for line in buf.getvalue().splitlines())
        for k in ("LOOP_HEAVY_JOBS", "LOOP_NICE", "DNDTOOLS_TEST_WORKERS", "DNDTOOLS_PW_WORKERS", "LOOP_PROMOTE_PW_WORKERS"):
            self.assertGreaterEqual(int(json.loads(env[k])), 1, k)
        self.assertEqual(json.loads(env["DNDTOOLS_E2E_PORT"]), "5293")

    def test_resource_env_clamps_and_merges_overrides(self):
        env = r.resource_env({"resources": {"pw_workers": 0, "nice": 40, "heavy_jobs": 1}})
        self.assertEqual(env["DNDTOOLS_PW_WORKERS"], 1)
        self.assertEqual(env["LOOP_NICE"], 19)
        self.assertEqual(env["LOOP_HEAVY_JOBS"], 1)
        self.assertEqual(env["DNDTOOLS_TEST_WORKERS"], r.DEFAULT_CONFIG["resources"]["test_workers"])


if __name__ == "__main__":
    unittest.main()
