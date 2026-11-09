// Staging-only banner.
//
// The staging build sets VITE_STAGING=1 (see the staging steps in the
// GitHub Pages workflows); production builds leave it unset, so this
// banner can never appear in production. It exists so the staging
// environment is never mistaken for production at a glance.

export function isStagingBuild(env = import.meta.env) {
  return env?.VITE_STAGING === "1";
}

// Links between the staging environments, shown inside the banner so
// every staging page can reach the others without touching the app's
// own navigation (which keeps pointing at production).
export const STAGING_LINKS = [
  ["トップ", "/staging/"],
  ["ブログ", "/blog/staging/"],
  ["持ち物", "/list-of-stuff-admin/staging/"],
  ["ツイート", "/tweet/staging/"],
  ["アラーム", "/alarm/staging/"],
  ["健康", "/health/staging/"],
  ["資産", "/asset/staging/"],
  ["SNS Analytics", "/social/staging/"],
  ["バケットリスト", "/bucket-list-admin/staging/"],
];

// The production root of this app. The staging build's base is
// "/<app>/staging/" (see build:staging), so dropping the trailing
// "staging/" segment leaves the production root. Derived from
// BASE_URL so this file can stay identical in every app.
export function productionUrl(env = import.meta.env) {
  const base = env?.BASE_URL ?? "/";
  return base.endsWith("staging/")
    ? base.slice(0, -"staging/".length)
    : base;
}

export function showStagingBanner(doc = document) {
  const el = doc.createElement("div");
  el.setAttribute(
    "style",
    "background:#f7e9e2;color:#8f2a12;text-align:center;font-size:12px;line-height:2.2;letter-spacing:.06em;"
  );
  const label = doc.createElement("span");
  label.textContent = "STAGING｜";
  el.appendChild(label);
  STAGING_LINKS.forEach(([text, href], index) => {
    if (index > 0) {
      el.appendChild(doc.createTextNode(" ・ "));
    }
    const a = doc.createElement("a");
    a.href = href;
    a.textContent = text;
    a.setAttribute("style", "color:#8f2a12;");
    el.appendChild(a);
  });
  // One link back to this app's own production top, after the
  // staging links. It is red and bold on purpose: production is the
  // dangerous side, and the link must never be mistaken for one of
  // the staging links above.
  el.appendChild(doc.createTextNode("｜ "));
  const prod = doc.createElement("a");
  prod.href = productionUrl();
  prod.textContent = "本番";
  prod.setAttribute("style", "color:#c62828;font-weight:700;");
  el.appendChild(prod);
  doc.body.prepend(el);
  return el;
}
