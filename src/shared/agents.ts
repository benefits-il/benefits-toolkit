/**
 * The coding agents the toolkit serves, and how each is shown: Claude Code,
 * and the agents built into Cursor and Antigravity. Wherever a conversation
 * or an alert appears, it carries its agent's own mark, so the source is
 * clear at a glance.
 *
 * The marks are the agents' own artwork:
 * - Claude: Simple Icons (CC0), in Claude's terracotta.
 * - Cursor: the 2D cube from cursor.com/brand, drawn in the text color.
 * - Antigravity: antigravity-gradient-logo.svg from the Antigravity app.
 */

export type AgentId = "claude" | "cursor" | "antigravity";

export const AGENT_IDS: readonly AgentId[] = ["claude", "cursor", "antigravity"];

/** The name a popup, a list row or the viewer shows for the agent. */
export const AGENT_NAMES: Readonly<Record<AgentId, string>> = {
  claude: "Claude",
  cursor: "Cursor",
  antigravity: "Antigravity",
};

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && (AGENT_IDS as readonly string[]).includes(value);
}

/**
 * The agent built into the editor the toolkit runs in, from the editor's URL
 * scheme (vscode.env.uriScheme): "cursor", "antigravity" or "antigravity-ide".
 * Any other editor gets Claude.
 */
export function editorAgent(uriScheme: string): AgentId {
  if (uriScheme === "cursor") return "cursor";
  if (uriScheme === "antigravity" || uriScheme.startsWith("antigravity-")) return "antigravity";
  return "claude";
}

export const CLAUDE_COLOR = "#D97757";

/** Each mark as a standalone SVG document (for a data: URI or a rendered PNG). */
export const AGENT_MARK_SVG: Readonly<Record<AgentId, string>> = {
  claude:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000"><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>',
  cursor:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="388 394.6 190.8 190.8" fill="#000"><path d="M563.463 439.971L487.344 396.057C484.899 394.646 481.883 394.646 479.439 396.057L403.323 439.971C401.269 441.156 400 443.349 400 445.723V534.276C400 536.647 401.269 538.843 403.323 540.029L479.443 583.943C481.887 585.353 484.903 585.353 487.347 583.943L563.466 540.029C565.521 538.843 566.79 536.651 566.79 534.276V445.723C566.79 443.352 565.521 441.156 563.466 439.971H563.463ZM558.681 449.273L485.199 576.451C484.703 577.308 483.391 576.958 483.391 575.966V492.691C483.391 491.027 482.501 489.488 481.058 488.652L408.887 447.016C408.03 446.52 408.38 445.209 409.373 445.209H556.337C558.424 445.209 559.728 447.47 558.685 449.276H558.681V449.273Z"/></svg>',
  antigravity:
    '<svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#a)"><path d="M85.973 89.344c5.25 3.937 13.125 1.312 5.907-5.906-21.657-21-17.063-78.75-43.97-78.75-26.905 0-22.312 57.75-43.968 78.75-7.875 7.874.656 9.843 5.906 5.906C30.192 75.563 28.88 51.28 47.911 51.28c19.031 0 17.719 24.282 38.062 38.063Z" fill="#3186FF"/><mask id="b" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="4" width="95" height="88"><path d="M85.973 89.344c5.25 3.937 13.125 1.312 5.907-5.906-21.657-21-17.063-78.75-43.97-78.75-26.905 0-22.312 57.75-43.968 78.75-7.875 7.874.656 9.843 5.906 5.906C30.192 75.563 28.88 51.28 47.911 51.28c19.031 0 17.719 24.282 38.062 38.063Z" fill="#000"/></mask><g mask="url(#b)"><g filter="url(#c)"><ellipse cx="25.636" cy="30.161" rx="25.636" ry="30.161" transform="rotate(96.476 44.769 9.835)" fill="#FFE432"/></g><g filter="url(#d)"><ellipse cx="93.614" cy="23.451" rx="33.188" ry="33.918" transform="rotate(76.924 93.614 23.45)" fill="#FC413D"/></g><g filter="url(#e)"><ellipse cx="-4.781" cy="30.81" rx="34.686" ry="44.934" transform="rotate(74.126 -4.78 30.81)" fill="#00B95C"/></g><g filter="url(#f)"><ellipse cx="-4.781" cy="30.81" rx="34.686" ry="44.934" transform="rotate(74.126 -4.78 30.81)" fill="#00B95C"/></g><g filter="url(#g)"><ellipse cx="-2.314" cy="32.19" rx="33.998" ry="37.428" transform="rotate(45.606 -2.314 32.19)" fill="#00B95C"/></g><g filter="url(#h)"><ellipse cx="70.286" cy="101.861" rx="32.645" ry="31.436" transform="rotate(76.924 70.286 101.861)" fill="#3186FF"/></g><g filter="url(#i)"><ellipse cx="37.762" cy="39.83" rx="37.762" ry="39.83" transform="rotate(114.176 60.204 15.464)" fill="#FBBC04"/></g><g filter="url(#j)"><path d="M-12.05 152.344c-20.676-8.117 14.66-74.901 23.447-97.284 8.787-22.383 32.672-33.948 53.35-25.83 20.677 8.117 45.185 52.825 36.398 75.208C92.358 126.8 8.6 160.461-12.049 152.344Z" fill="#3186FF"/></g><g filter="url(#k)"><path d="M113.238 69.22c-5.536 6.462-19.982 3.167-32.266-7.358-12.285-10.525-17.756-24.295-12.22-30.756 5.536-6.46 19.982-3.166 32.266 7.359 12.284 10.525 17.755 24.295 12.22 30.756Z" fill="#749BFF"/></g><g filter="url(#l)"><ellipse cx="89.249" cy="10.708" rx="49.771" ry="30.939" transform="rotate(34.076 89.25 10.708)" fill="#FC413D"/></g><g filter="url(#m)"><ellipse cx="11.494" cy="17.224" rx="26.671" ry="15.51" transform="rotate(112.516 11.494 17.224)" fill="#FFEE48"/></g></g></g><defs><filter id="c" x="-12.133" y="-45.923" width="77.726" height="68.909" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="4.377" result="effect1_foregroundBlur_6153_71"/></filter><filter id="d" x="17.408" y="-52.101" width="152.412" height="151.102" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="21.159" result="effect1_foregroundBlur_6153_71"/></filter><filter id="e" x="-85.014" y="-40.729" width="160.467" height="143.078" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="17.987" result="effect1_foregroundBlur_6153_71"/></filter><filter id="f" x="-85.014" y="-40.729" width="160.467" height="143.078" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="17.987" result="effect1_foregroundBlur_6153_71"/></filter><filter id="g" x="-74.079" y="-39.502" width="143.529" height="143.384" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="17.987" result="effect1_foregroundBlur_6153_71"/></filter><filter id="h" x="4.594" y="35.084" width="131.384" height="133.554" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="17.093" result="effect1_foregroundBlur_6153_71"/></filter><filter id="i" x="-23.316" y="-84.096" width="140.966" height="138.215" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="15.491" result="effect1_foregroundBlur_6153_71"/></filter><filter id="j" x="-46.111" y="-1.033" width="176.759" height="182.283" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="13.834" result="effect1_foregroundBlur_6153_71"/></filter><filter id="k" x="41.834" y="3.041" width="98.322" height="94.246" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="12.379" result="effect1_foregroundBlur_6153_71"/></filter><filter id="l" x="23.605" y="-48.077" width="131.289" height="117.57" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="10.456" result="effect1_foregroundBlur_6153_71"/></filter><filter id="m" x="-31.984" y="-34.006" width="86.956" height="102.461" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="12.941" result="effect1_foregroundBlur_6153_71"/></filter><clipPath id="a"><path fill="#fff" d="M0 0h96v96H0z"/></clipPath></defs></svg>',
};

/** Marks drawn as one-color shapes, in a color the page picks (the rest carry their own colors). */
const TINTED: Readonly<Record<AgentId, boolean>> = { claude: true, cursor: true, antigravity: false };

function dataUri(svg: string): string {
  return `url("data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}")`;
}

/**
 * The CSS behind agentMark(): each mark is defined once, so a list of a
 * thousand rows carries a short tag per row, not a thousand SVGs. A tinted
 * mark is a mask over its color: Claude's terracotta, Cursor's the text color.
 */
export function agentMarkCss(): string {
  const rules = AGENT_IDS.map((id) => {
    const uri = dataUri(AGENT_MARK_SVG[id]);
    return TINTED[id]
      ? `.mark-${id} { background-color: ${id === "claude" ? CLAUDE_COLOR : "currentColor"}; -webkit-mask: ${uri} center / contain no-repeat; mask: ${uri} center / contain no-repeat; }`
      : `.mark-${id} { background: ${uri} center / contain no-repeat; }`;
  });
  return [".mark { display: inline-block; flex: none; width: 16px; height: 16px; }", ...rules].join("\n");
}

/** An agent's mark, sized by the surrounding CSS (16px unless a rule says otherwise). */
export function agentMark(agent: AgentId, title?: string): string {
  const label = title ? ` role="img" aria-label="${title}" title="${title}"` : ' aria-hidden="true"';
  return `<i class="mark mark-${agent}"${label}></i>`;
}
