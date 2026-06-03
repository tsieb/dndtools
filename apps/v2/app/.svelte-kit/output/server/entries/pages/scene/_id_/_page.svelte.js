import { w as attr, x as ensure_array_like } from "../../../../chunks/index.js";
import { j as useRuntime } from "../../../../chunks/runtime-context.js";
import { g as getSceneForActor } from "../../../../chunks/scene.js";
import { e as escape_html } from "../../../../chunks/context.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const { data } = $$props;
    const runtime = useRuntime();
    const sceneId = data.id;
    const summary = getSceneForActor(runtime.state.scenes, runtime.state.permissions, runtime.defaultActorId, sceneId);
    let widgetType = "note";
    let widgetVersion = "1.0.0";
    let widgetX = 40;
    let widgetY = 40;
    let widgetW = 240;
    let widgetH = 160;
    if ("kind" in summary) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="error" role="alert" data-testid="scene-denied">Cannot open scene: ${escape_html(summary.reason)}</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<section class="scene-editor" data-testid="scene-editor"><header><a href="../../" data-testid="back-to-scenes">← Back</a> <h2 data-testid="scene-name">${escape_html(summary.name)}</h2> <p class="meta">visibility ${escape_html(summary.visibility)} • rev ${escape_html(summary.ownership.revision)} •
				${escape_html(summary.widgets.length)} widget${escape_html(summary.widgets.length === 1 ? "" : "s")}</p> <div class="row-actions"><button class="button secondary" data-testid="save-template">Save as Template</button></div></header> <section><h3>Add widget</h3> <form class="form" aria-label="Add widget"><label><span>Type</span> <input${attr("value", widgetType)} data-testid="widget-type" required=""/></label> <label><span>Version</span> <input${attr("value", widgetVersion)} data-testid="widget-version" required=""/></label> <label><span>x</span> <input type="number"${attr("value", widgetX)} data-testid="widget-x"/></label> <label><span>y</span> <input type="number"${attr("value", widgetY)} data-testid="widget-y"/></label> <label><span>w</span> <input type="number" min="1"${attr("value", widgetW)} data-testid="widget-w"/></label> <label><span>h</span> <input type="number" min="1"${attr("value", widgetH)} data-testid="widget-h"/></label> <button class="button" type="submit" data-testid="widget-add">Add widget</button></form></section> <section><h3>Widgets</h3> <div class="widget-grid" data-testid="widget-grid"><!--[-->`);
      const each_array = ensure_array_like(summary.widgets);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let payload = each_array[$$index];
        if (payload.kind === "available") {
          $$renderer2.push("<!--[-->");
          const w = payload.widget;
          $$renderer2.push(`<article class="widget-row"${attr("data-testid", `widget-${w.id}`)}><div><strong>${escape_html(w.type)}</strong> <span class="meta">v${escape_html(w.version)}</span> <div class="layout">x ${escape_html(w.layout.x.toFixed(0))} • y ${escape_html(w.layout.y.toFixed(0))} • w ${escape_html(w.layout.w.toFixed(0))} • h ${escape_html(w.layout.h.toFixed(0))} • z ${escape_html(w.layout.z)} `);
          if (w.layout.pinned) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`• pinned`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div></div> <div class="row-actions"><button type="button" aria-label="Move widget left">←</button> <button type="button" aria-label="Move widget right">→</button> <button type="button" aria-label="Move widget up">↑</button> <button type="button" aria-label="Move widget down">↓</button> <button type="button">${escape_html(w.layout.pinned ? "Unpin" : "Pin")}</button> <button type="button"${attr("data-testid", `destroy-${w.id}`)}>Remove</button></div></article>`);
        } else if (payload.kind === "missing") {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<article class="widget-row"${attr("data-testid", `missing-${payload.widgetInstanceId}`)}><div><strong>${escape_html(payload.type)}</strong> <div class="layout">binding missing</div></div></article>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<article class="widget-row"${attr("data-testid", `hidden-${payload.widgetInstanceId}`)}><div><strong>${escape_html(payload.type)}</strong> <div class="layout">hidden in this view</div></div></article>`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--> `);
      if (summary.widgets.length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<p class="meta">No widgets yet — add one above.</p>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div></section></section>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
