import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS serverless file
import { kindOf, parseFolder } from "../../api/drive-notes.js";
import { flattenDrive } from "@/lib/driveNotes";

const page = `<html><head><title>Ompath notes</title></head><body>
<div class="flip-entry" id="entry-FOLD1"><a href="https://drive.google.com/drive/folders/FOLD1"><div class="flip-entry-title">Year 4 &amp; 5</div></a></div>
<div class="flip-entry" id="entry-FILE1"><a href="https://drive.google.com/file/d/FILE1/view"><img src="https://drive-thirdparty.googleusercontent.com/16/type/application/pdf"/><div class="flip-entry-title">Cardiology notes.pdf</div></a><div class="flip-entry-last-modified"><div>Oct 7, 2026</div></div></div>
</body></html>`;

describe("drive notes", () => {
  it("reads a Drive folder page", () => {
    const r = parseFolder(page);
    expect(r.title).toBe("Ompath notes");
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ id: "FOLD1", name: "Year 4 & 5", mime: "folder" });
    expect(r.items[1]).toMatchObject({ id: "FILE1", name: "Cardiology notes.pdf", mime: "application/pdf", modified: "Oct 7, 2026" });
  });
  it("names the kind of file", () => {
    expect(kindOf("a.pdf", "application/pdf")).toBe("pdf");
    expect(kindOf("a.pptx", "application/octet-stream")).toBe("ppt");
    expect(kindOf("a.docx", "application/octet-stream")).toBe("doc");
    expect(kindOf("a.mp4", "video/mp4")).toBe("video");
  });
  it("lists every file with the folder it is in", () => {
    const rows = flattenDrive({ id: "r", name: "Root", folders: [{ id: "f", name: "Year 4", folders: [], files: [{ id: "2", name: "b.pdf", kind: "pdf", modified: "" }] }], files: [{ id: "1", name: "a.pdf", kind: "pdf", modified: "" }] });
    expect(rows.map((r) => [r.file[1], r.where.join("/")])).toEqual([["a.pdf", ""], ["b.pdf", "Year 4"]]);
  });
});
