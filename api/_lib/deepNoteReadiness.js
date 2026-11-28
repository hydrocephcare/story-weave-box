/** A deep note is complete only after an independent AI check and the required exam material exist. */
export function deepNoteReady(deep) {
  return Boolean(deep?.checked)
    && (deep?.sections?.length || 0) >= 7
    && ((deep?.vivas?.length || 0) >= 12 || (deep?.exam?.length || 0) >= 12)
    && (deep?.mcqs?.length || 0) >= 6
    && (deep?.cases?.length || 0) >= 2
    && (deep?.facts?.length || 0) >= 6
    && (deep?.mistakes?.length || 0) >= 5;
}

/** A published revision page must exist before deep notes can enrich it. */
export function topicBaseReady(page) {
  return Boolean(page && typeof page === "object" && !Array.isArray(page))
    && String(page.summary || "").trim().length >= 40
    && Array.isArray(page.sections)
    && page.sections.length >= 3;
}
