import { w as attr, x as ensure_array_like } from "../../chunks/index.js";
import { j as useRuntime } from "../../chunks/runtime-context.js";
import { l as listScenesForActor } from "../../chunks/scene.js";
import { e as escape_html } from "../../chunks/context.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const runtime = useRuntime();
    let name = "";
    let description = "";
    let visibility = "dm-only";
    let tagsRaw = "";
    let submitting = false;
    const scenes = listScenesForActor(runtime.state.scenes, runtime.state.permissions, runtime.defaultActorId);
    $$renderer2.push(`<section><h2>Create a Scene</h2> <form class="form" aria-label="Create Scene"><label><span>Name</span> <input name="name" data-testid="scene-name" required=""${attr("value", name)} autocomplete="off"/></label> <label><span>Description</span> <textarea name="description" data-testid="scene-description" rows="2">`);
    const $$body = escape_html(description);
    if ($$body) {
      $$renderer2.push(`${$$body}`);
    }
    $$renderer2.push(`</textarea></label> <label><span>Tags (comma separated)</span> <input name="tags" data-testid="scene-tags"${attr("value", tagsRaw)} placeholder="prep, dungeon"/></label> <label><span>Visibility</span> `);
    $$renderer2.select(
      {
        name: "visibility",
        "data-testid": "scene-visibility",
        value: visibility
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "dm-only" }, ($$renderer4) => {
          $$renderer4.push(`DM only`);
        });
        $$renderer3.option({ value: "shared" }, ($$renderer4) => {
          $$renderer4.push(`Shared`);
        });
        $$renderer3.option({ value: "player-visible" }, ($$renderer4) => {
          $$renderer4.push(`Player visible`);
        });
      }
    );
    $$renderer2.push(`</label> <button class="button" type="submit" data-testid="scene-create"${attr("disabled", submitting, true)}>Create Scene</button></form> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></section> <section><h2>Scenes</h2> <p class="meta">${escape_html(scenes.length)} scene${escape_html(scenes.length === 1 ? "" : "s")} in this vault</p> <ul class="scene-list" data-testid="scene-list"><!--[-->`);
    const each_array = ensure_array_like(scenes);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let scene = each_array[$$index];
      $$renderer2.push(`<li class="scene-card"${attr("data-testid", `scene-card-${scene.id}`)}><div><a${attr("href", `scene/${scene.id}/`)}${attr("data-testid", `scene-link-${scene.id}`)}><strong>${escape_html(scene.name)}</strong></a> <div class="meta">visibility ${escape_html(scene.visibility)} • updated ${escape_html(scene.updatedAt)}</div> `);
      if (scene.isTemplate) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="meta">template</div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div></li>`);
    }
    $$renderer2.push(`<!--]--> `);
    if (scenes.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<li class="meta" data-testid="scene-list-empty">No scenes yet — create one above.</li>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></ul></section>`);
  });
}
export {
  _page as default
};
