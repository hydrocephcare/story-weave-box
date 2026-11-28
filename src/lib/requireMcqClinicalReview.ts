type ReviewClient = {
  functions: {
    invoke: (name: string, options?: { body?: unknown }) => Promise<{ data: any; error: any }>;
  };
};

/** Require an independent Gemini check before an admin-generated question bank is published. */
export async function requireMcqClinicalReview(
  client: ReviewClient,
  questions: unknown[],
  title = "Medical question bank",
) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("There are no questions to send for independent clinical review.");
  }

  const { data, error } = await client.functions.invoke("generate-content", {
    body: {
      type: "review-mcqs",
      title,
      notes: JSON.stringify(questions),
    },
  });

  if (error) {
    throw new Error(error.message || "Independent Gemini clinical review is unavailable.");
  }
  if (data?.validated !== true || !data?.reviewModel) {
    const detail = Array.isArray(data?.issues)
      ? data.issues.slice(0, 3).map((x: any) => x.problem).filter(Boolean).join("; ")
      : "";
    throw new Error(detail
      ? "The question bank did not pass independent Gemini review: " + detail
      : "The question bank did not pass independent Gemini review. Nothing was published.");
  }
  return { model: String(data.reviewModel), reviewedAt: String(data.reviewedAt || "") };
}
