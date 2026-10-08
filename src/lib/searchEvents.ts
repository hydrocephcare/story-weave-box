export const OPEN_SEARCH_EVENT = "ompath:open-search";
export const openSearch = (initial = "") => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT, { detail: initial }));
