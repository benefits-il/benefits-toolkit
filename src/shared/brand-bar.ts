/**
 * The Benefits brand bar, shared by every webview in the toolkit. It is the
 * same mark, tagline and link as the bar over md-he (benefits-il.dev/md-he),
 * so the toolkit reads as one of the course's tools.
 *
 * Colors are fixed brand tokens rather than VS Code theme variables: the bar
 * is a dark badge, legible on light and dark themes alike.
 */

export const BENEFITS_URL = "https://benefits-il.dev/";

export const BENEFITS_TAGLINE =
  "הכלי הזה הוא חלק מ-Benefits — הקורס שמלמד לעבוד נכון עם בינה מלאכותית";

/** Verbatim copy of md-he/benefits-logo.svg (cream rounded square, green B). */
export const BENEFITS_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Benefits logo — rounded-square"><rect x="44" y="44" width="424" height="424" rx="104" fill="#FFFBEB" stroke="#0F172A" stroke-width="12"/><svg x="113" y="113" width="286" height="286" viewBox="824 453 2250 2991" preserveAspectRatio="xMidYMid meet" overflow="visible"><path d="M826.492 3236.77C825.424 3122.47 824.356 2449.49 824.356 1741.27L824 453 1531.56 453C2204.58 453 2241.97 453.356 2291.11 459.765 2399.72 474.008 2482.33 498.221 2570.64 542.018 2723.41 617.505 2837 715.78 2927.09 850.376 2960.56 900.582 3002.58 982.834 3022.88 1038.74 3040.69 1086.45 3058.13 1157.67 3065.97 1213.57 3074.16 1269.47 3075.23 1407.63 3068.1 1460.68 3041.75 1653.32 2948.1 1834.56 2806.02 1968.44L2765.78 2006.54 2787.5 2024.7C2937.77 2149.32 3036.77 2323.8 3066.32 2514.65 3075.23 2572.69 3075.23 2703.73 3066.32 2759.99 3030.71 2986.09 2906.44 3178.73 2714.15 3307.27 2618.36 3371.01 2506.54 3414.45 2383.69 3435.45 2348.79 3441.51 2298.94 3442.22 1587.47 3442.93L828.63 3444 826.492 3236.77ZM2375.15 3229.65C2591.65 3181.22 2762.58 3034.87 2835.57 2835.83 2900.03 2659.93 2876.88 2476.91 2769.34 2315.61 2684.24 2188.14 2552.48 2099.47 2390.81 2061.73L2356.98 2053.9 1783.67 2051.76 1210.36 2049.98 1209.29 1442.17 1208.58 833.996 1706.04 833.996C2245.88 833.996 2233.06 833.64 2308.56 853.581 2498 904.143 2632.6 1041.59 2676.4 1229.24 2685.66 1269.12 2689.22 1378.07 2682.81 1431.84 2671.77 1527.62 2637.23 1617.71 2585.95 1684.3 2573.13 1700.67 2569.93 1702.81 2558.53 1702.81 2551.41 1702.81 2540.02 1701.03 2533.25 1699.25 2510.46 1692.48 2439.6 1681.45 2382.98 1675.39L2326.72 1669.34 2326.72 1657.95C2326.72 1649.04 2329.21 1644.42 2338.47 1638.36 2413.25 1585.66 2464.88 1501.63 2479.84 1406.2 2485.18 1372.73 2482.69 1310.78 2474.85 1281.22 2442.45 1161.94 2357.7 1079.69 2232.71 1046.57 2203.86 1038.74 2203.15 1038.74 1808.6 1038.74L1413.34 1038.74 1412.27 1414.39C1411.56 1620.91 1412.27 1803.22 1413.34 1819.25L1415.83 1848.44 1895.13 1849.87C2318.88 1850.94 2379.06 1851.65 2410.4 1856.63 2458.12 1864.47 2505.48 1875.15 2538.24 1885.83L2565.66 1894.38 2594.86 1872.66C2635.81 1842.39 2703.82 1775.09 2734.8 1734.15 2781.8 1671.48 2810.29 1618.07 2836.29 1542.58 2882.94 1407.27 2882.58 1273.39 2835.22 1136.66 2775.4 964.319 2649.34 818.329 2490.52 736.433 2426.78 703.674 2393.66 690.5 2342.74 677.325 2251.22 653.824 2286.48 654.892 1628.06 653.468L1030.53 652.044 1030.53 1946.72 1030.53 3241.04 1681.47 3239.97 2332.06 3238.9 2375.15 3229.65Z" fill="#047857" fill-rule="evenodd"/><path d="M1213 2646.36 1213 2226.07 1314.43 2226.07 1415.86 2226.07 1415.86 2544.85 1415.86 2863.62 1845.79 2863.62C2328.76 2863.62 2301.35 2865.05 2358.65 2836.55 2447.27 2792.74 2498.88 2697.29 2481.79 2608.96 2463.29 2511.37 2384.63 2440.84 2282.84 2430.51L2259.35 2428.02 2259.35 2326.51 2259.35 2225 2301.35 2227.14C2375.02 2230.7 2457.24 2257.41 2515.6 2297.3 2528.06 2305.85 2550.84 2324.73 2566.14 2339.33 2629.14 2399.53 2663.66 2462.21 2681.45 2548.41 2689.29 2587.23 2690.35 2688.39 2683.23 2724.71 2666.51 2810.91 2628.07 2882.5 2566.5 2942.34 2505.64 3001.46 2440.51 3036.73 2353.67 3057.03 2321.99 3064.51 2317.01 3064.51 1767.5 3065.58L1213 3067 1213 2646.36Z" fill="#047857" fill-rule="evenodd"/></svg></svg>`;

const EXTERNAL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

/**
 * "panel": a rounded card for the narrow sidebar views; the tagline gets its
 * own full-width line so it is never cut off.
 * "viewer": a single full-width strip above the conversation viewer header.
 */
export type BrandBarVariant = "panel" | "viewer";

export function brandBarHtml(variant: BrandBarVariant): string {
  return `<div class="benefits-bar benefits-bar--${variant}">
  <a class="benefits-brand" href="${BENEFITS_URL}" data-brand-link title="benefits-il.dev">
    <span class="benefits-mark" aria-hidden="true">${BENEFITS_LOGO_SVG}</span>
    <span class="benefits-name">Benefits</span>
  </a>
  <span class="benefits-tagline" dir="rtl">${BENEFITS_TAGLINE}</span>
  <a class="benefits-link" href="${BENEFITS_URL}" data-brand-link>${EXTERNAL_ICON}<span dir="rtl">לאתר הקורס</span></a>
</div>`;
}

export function brandBarCss(): string {
  return `
  .benefits-bar {
    --bb-bg: #022C22;
    --bb-cream: #FFFBEB;
    --bb-mint: #6EE7B7;
    --bb-sun: #FCD34D;
    --bb-sun-deep: #FBBF24;
    --bb-ink: #022C22;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    background: var(--bb-bg);
    color: var(--bb-cream);
    font-family: var(--vscode-font-family);
    line-height: 1.4;
  }
  .benefits-bar--viewer {
    flex-wrap: nowrap;
    padding: 6px 24px;
    border-bottom: 1px solid rgba(255, 251, 235, 0.12);
  }
  .benefits-bar--panel {
    border-radius: 8px;
    padding: 10px 12px;
    margin-top: 14px;
  }
  .benefits-brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    color: var(--bb-cream);
    text-decoration: none;
  }
  .benefits-mark { display: inline-flex; width: 24px; height: 24px; }
  .benefits-mark svg { display: block; width: 100%; height: 100%; }
  .benefits-name { font-weight: 800; font-size: 1.05em; letter-spacing: -0.01em; }
  .benefits-tagline { color: var(--bb-mint); font-size: 0.85em; }
  .benefits-bar--viewer .benefits-tagline {
    flex: 0 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .benefits-bar--panel .benefits-tagline { order: 3; flex-basis: 100%; }
  .benefits-link {
    margin-inline-start: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
    padding: 3px 10px;
    border: 1.5px solid var(--bb-ink);
    border-radius: 999px;
    background: var(--bb-sun);
    color: var(--bb-ink);
    font-size: 0.8em;
    font-weight: 600;
    text-decoration: none;
  }
  .benefits-link:hover { background: var(--bb-sun-deep); }
  .benefits-link svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  @media (max-width: 600px) {
    .benefits-bar--viewer .benefits-tagline { display: none; }
  }`;
}

/**
 * Client-side handler for the sidebar panels: routes brand-link clicks to the
 * extension host as { type: "openBrand" }, which opens the site externally.
 * Expects the panel script to define post(message).
 */
export const BRAND_CLICK_SCRIPT = `
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[data-brand-link]') : null;
    if (!a) return;
    e.preventDefault();
    post({ type: 'openBrand' });
  });`;
