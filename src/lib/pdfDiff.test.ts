import { describe, it, expect } from "vitest";
import { diffStreams, itemStream, tokenize, tokenText } from "./pdfDiff";

describe("pdfDiff", () => {
  it("builds the stream of the text items", () => {
    const stream = itemStream([
      [{ str: "Hello", hasEOL: false }, { str: " world", hasEOL: true }, { str: "next" }],
      [{ str: "page two" }],
    ]);
    expect(stream).toBe("Hello world\nnext\fpage two\f");
  });

  it("joins a word with a hyphen at the end of a line", () => {
    const stream = "eine zusätz-\nliche 360-\nGrad-Kamera - ja -\nnein\n";
    const words = tokenize(stream).map((t) => tokenText(stream, t));
    expect(words).toEqual(["eine", "zusätz-liche", "360-Grad-Kamera", "-", "ja", "-", "nein"]);
    expect(tokenize(stream).map((t) => t.key)).toEqual(["eine", "zusätzliche", "360GradKamera", "-", "ja", "-", "nein"]);
  });

  it("splits punctuation from words", () => {
    const stream = "(Phase 2), z.B. „ja“.\n";
    expect(tokenize(stream).map((t) => tokenText(stream, t))).toEqual(["(", "Phase", "2", ")", ",", "z.B", ".", "„", "ja", "“", "."]);
    expect(diffStreams("Dieser Absatz endet anders als vorher.\n", "Dieser Absatz endet anders.\n")!.added).toEqual([]);
  });

  it("finds added and removed words", () => {
    const oldStream = "The loss decreases fast in the first epochs.\n";
    const newStream = "The loss decreases slowly in the first ten epochs.\n";
    expect(diffStreams(oldStream, newStream)).toEqual({
      added: [
        [3, 3],
        [7, 7],
      ],
      removed: [{ at: 3, text: "fast", old: [3, 3] }],
    });
  });

  it("ignores a new line break inside a word", () => {
    expect(diffStreams("eine zusätzliche Kamera\n", "eine zusätz-\nliche Kamera\n")).toEqual({ added: [], removed: [] });
  });

  it("ignores another split of the same words", () => {
    expect(diffStreams("nobis opi\nnemur. Quod\n", "nobis opi-\nnemur. Quod\n")).toEqual({ added: [], removed: [] });
  });

  it("keeps the punctuation of removed text", () => {
    expect(diffStreams("a. Dieser Satz, mit Komma, geht.\nb\n", "a. b\n")!.removed).toEqual([{ at: 2, text: "Dieser Satz, mit Komma, geht.", old: [2, 9] }]);
  });

  it("reports removed text at the end", () => {
    expect(diffStreams("a b c\n", "a b\n")).toEqual({ added: [], removed: [{ at: 2, text: "c", old: [2, 2] }] });
  });

  it("compares running headers and footers page by page", () => {
    const page = (body: string, n: number, date: string) => `Report\n${body}\nStand ${date} Seite ${n} von 3\f`;
    // The body text "c d" moves from page 2 to page 3; only the date changes.
    const oldStream = page("a b c d", 1, "09.09.") + page("e f", 2, "09.09.") + page("g", 3, "09.09.");
    const newStream = page("a b", 1, "26.10.") + page("c d e f", 2, "26.10.") + page("g", 3, "26.10.");
    const diff = diffStreams(oldStream, newStream)!;
    const words = tokenize(newStream);
    const added = diff.added.flatMap(([a, b]) => words.slice(a, b + 1).map((t) => tokenText(newStream, t)));
    expect(added).toEqual(["26.10", "26.10", "26.10"]);
    expect(diff.removed.map((r) => r.text)).toEqual(["09.09", "09.09", "09.09"]);
  });

  it("compares the headers and footers of a new page with the last old page", () => {
    const page = (body: string, n: number, of: number) => `Report\n${body}\nSeite ${n} von ${of}\f`;
    const oldStream = page("a b", 1, 2) + page("c", 2, 2);
    const newStream = page("a b", 1, 3) + page("c", 2, 3) + page("d e", 3, 3);
    const diff = diffStreams(oldStream, newStream)!;
    const words = tokenize(newStream);
    const added = diff.added.flatMap(([a, b]) => words.slice(a, b + 1).map((t) => tokenText(newStream, t)));
    // "von 3" on the pages 1 and 2, and the body of the new page 3.
    expect(added).toEqual(["3", "3", "d", "e"]);
    expect(diff.removed.map((r) => r.text)).toEqual(["2", "2"]);
  });
});
