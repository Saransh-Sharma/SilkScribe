import { expect, test } from "bun:test";
import { continueList } from "../../src/components/workspace/UserNotes";

test("Enter continues a bulleted list", () => {
  expect(continueList("- Ship Friday", 13)).toEqual({
    text: "- Ship Friday\n- ",
    caret: 16,
  });
});

test("Enter continues a numbered list with the next number", () => {
  expect(continueList("1. First", 8)).toEqual({
    text: "1. First\n2. ",
    caret: 12,
  });
});

test("Enter on an empty item ends the list", () => {
  expect(continueList("- One\n- ", 8)).toEqual({ text: "- One\n", caret: 6 });
});

test("Enter outside a list types normally", () => {
  expect(continueList("Plain text", 10)).toBeNull();
});
