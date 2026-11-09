import { describe, it, expect } from "vitest";
import {
  isStagingBuild,
  productionUrl,
  showStagingBanner,
} from "../src/staging-banner.js";

describe("isStagingBuild", () => {
  it("is true only when VITE_STAGING is exactly '1'", () => {
    expect(isStagingBuild({ VITE_STAGING: "1" })).toBe(true);
    expect(isStagingBuild({ VITE_STAGING: "true" })).toBe(false);
    expect(isStagingBuild({})).toBe(false);
    expect(isStagingBuild(undefined)).toBe(false);
  });
});

describe("showStagingBanner", () => {
  it("prepends a banner naming the staging environment", () => {
    document.body.innerHTML = "<main id=\"app\"></main>";
    const el = showStagingBanner();
    expect(document.body.firstChild).toBe(el);
    expect(el.textContent).toContain("STAGING");
    expect(el.textContent).toContain("STAGING｜");
  });

  it("links to every staging environment", () => {
    document.body.innerHTML = "<main id=\"app\"></main>";
    const el = showStagingBanner();
    const hrefs = [...el.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.slice(0, 8)).toEqual([
      "/staging/",
      "/blog/staging/",
      "/list-of-stuff-admin/staging/",
      "/tweet/staging/",
      "/alarm/staging/",
      "/health/staging/",
      "/asset/staging/",
      "/social/staging/",
    ]);
  });

  it("ends with a red, bold link to this app's production top", () => {
    document.body.innerHTML = "<main id=\"app\"></main>";
    const el = showStagingBanner();
    const links = [...el.querySelectorAll("a")];
    const prod = links[links.length - 1];
    expect(prod.textContent).toBe("本番");
    expect(prod.getAttribute("href")).toBe(productionUrl());
    expect(prod.getAttribute("style")).toContain("color:#c62828");
    expect(prod.getAttribute("style")).toContain("font-weight:700");
    expect(prod.style.fontWeight).toBe("700");
    expect(el.textContent).toContain("｜ 本番");
  });
});

describe("productionUrl", () => {
  it("drops the trailing staging segment from the base", () => {
    expect(productionUrl({ BASE_URL: "/blog/staging/" })).toBe("/blog/");
    expect(productionUrl({ BASE_URL: "/blog/" })).toBe("/blog/");
    expect(productionUrl({})).toBe("/");
  });
});
