/** The attribution line shown on content pages: small, left-aligned, under the page title. */
export default function ContentCredit() {
  return (
    <p className="my-2 text-left text-xs text-muted-foreground">
      Compiled by <span className="font-semibold text-foreground">Abongo</span>
      <span aria-hidden="true"> · </span>
      Ompath Study
    </p>
  );
}
