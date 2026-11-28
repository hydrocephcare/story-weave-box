const CANONICAL_HOSTS = new Set(["ompathstudy.com", "www.ompathstudy.com"]);
const isCanonicalPair = (a, b) => CANONICAL_HOSTS.has(a.toLowerCase()) && CANONICAL_HOSTS.has(b.toLowerCase());
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** POST JSON while preserving POST across same-site canonical-host redirects. */
export async function postJsonPreservingRedirect(url, body, headers, timeoutMs = 55_000, fetchImpl = fetch) {
  let target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password) {
    throw new Error("Refusing to send workflow credentials to an insecure or invalid endpoint.");
  }

  let redirects = 0;
  while (true) {
    const response = await fetchImpl(target, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (REDIRECTS.has(response.status)) {
      if (redirects >= 2) throw new Error("Too many same-site redirects from the publishing API.");
      const location = response.headers.get("location");
      if (!location) return { response, data: {}, finalUrl: target.toString(), redirects };
      const next = new URL(location, target);
      if (next.protocol !== "https:"
          || next.username
          || next.password
          || (next.origin !== target.origin && !isCanonicalPair(target.hostname, next.hostname))
          || next.pathname !== target.pathname
          || next.search !== target.search) {
        throw new Error("Publishing API redirected outside its approved same-site endpoint.");
      }
      target = next;
      redirects++;
      continue;
    }

    const data = await response.json().catch(() => ({}));
    return { response, data, finalUrl: target.toString(), redirects };
  }
}
