// Shared registry for the freddiefujiwara.com apps.
// The GAS deployment IDs are not secrets: the same /exec URLs ship in the
// public JavaScript bundles and workflow files of each app.
export const SITE = "https://freddiefujiwara.com";

export const GAS = {
  blog: {
    prod: "AKfycbydcnw4yt5K8lz8Wf0PCbG6Q9yD3jf1W2lsGucOor2KII7duJr7qevcMiwNHJTe8GZH",
    staging:
      "AKfycbxjBvowI9VBP4wIn_OpGolXW-pVZxKhigby68gGuplNGdyYPcn9GEcFYZhPzGJ9ipJK",
  },
  list: {
    prod: "AKfycbwUMhAHJDzp_mtR12fbHJlzNTptpSH78LNJAr9i9SXBdn_BUAwWJTtb1g",
    staging:
      "AKfycbwtdRN75mh4OlKQXM_JQlIRoO7OdB4BxtATgsnD0tnTUT2B02HUewbsd2cecycmUi1f",
  },
  tweet: {
    prod: "AKfycbzuui1RIL3ZqOiYPC5KiLUvp165u-rf9jT5XmQrdW9rgpEoqaTSQmbyCW31O9is6i-X",
    staging:
      "AKfycbzzDOks_JT7YtfWufq15ERqQHqd1144s23YNa0-ZsFPnjOwAn_v_-m0kRVqAlKsGcKNug",
  },
  alarm: {
    prod: "AKfycbyGtgeNC_rHFxPvSj7XjO5GdM6awoqlxJ7PDmfcadghjZshQ8Y",
    staging:
      "AKfycbww5dt-zvQcTCEqGYwypbpJkafRSWo40XJAx4ZhNgi37VD3zsLYVP5Pf6aFShZXhMM",
  },
  health: {
    prod: "AKfycbxGka-swbhzKbZsVUVzCbIpFHkkBf1Wr8DDsyBsHJtWhZv0LLWjlMqOSQbHHP2Cc3-O",
    staging:
      "AKfycbxnOtsPnn7_DXU-WsgKCxSlFcOvK0xO0IoTx1i3gNkMNMQ8duaMa0fyeSW_dDaZE3pv",
  },
  asset: {
    prod: "AKfycbxjQAp6rtSCUTz4T5J96_-zCs9Vrae-7uhZXY7ZIukOZP5fs_HIf44aOAfcN3XfPkis",
    staging:
      "AKfycbwaNgQjqAJCOKt8ReWAE6uhEZzEBuRRsnRbRFsa16RpVQSs6KSRVCPNZnalOXZWy0CE",
  },
  ga: {
    prod: "AKfycbypis7IqAtM2u0_h7ysiZ5UgztUEwNYJ1zPMnr8IbTBXiyfiapfRMtD_9CxVpc5G8YVzQ",
    staging:
      "AKfycbyRCLUuKbRElDdlUc0Rqh6Qxdfxd5R8hICpRe-keEyGCe1z-mC9gfN798MlXfQgY8kw",
  },
  bucket: {
    prod: "AKfycbwUF0Lt3OG5kE0IqTyrkciEcUFIXZULI7aM-xJtR_4nrvqOSlIOVKADtFolAvSwFko6Vw",
    staging:
      "AKfycbylntjD8K8_9bIHFy2edMYYXoufciAFL5uxKcGiHuqKujif8nGoWu7HKoXG7t2p-Lcg",
  },
};

export const execUrl = (id) => `https://script.google.com/macros/s/${id}/exec`;

// dataOnLoad: the app calls its GAS endpoint as soon as the page opens, so
// tests can require the call. Otherwise tests only require that the page
// never calls the OTHER environment's backend.
export const APPS = [
  { name: "top", path: "/", gas: null, dataOnLoad: false },
  { name: "blog", path: "/blog/", gas: "blog", dataOnLoad: true },
  { name: "list", path: "/list-of-stuff-admin/", gas: "list", dataOnLoad: false },
  { name: "tweet", path: "/tweet/", gas: "tweet", dataOnLoad: false },
  { name: "alarm", path: "/alarm/", gas: "alarm", dataOnLoad: false },
  { name: "health", path: "/health/", gas: "health", dataOnLoad: true },
  { name: "asset", path: "/asset/", gas: "asset", dataOnLoad: true },
  { name: "ga", path: "/social/", gas: "ga", dataOnLoad: true },
  { name: "bucket", path: "/bucket-list-admin/", gas: "bucket", dataOnLoad: false },
];

export const stagingPath = (app) => `${app.path}staging/`;
