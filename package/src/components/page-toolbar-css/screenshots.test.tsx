import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const capture = vi.hoisted(() => vi.fn());
vi.mock("../../utils/annotation-screenshot", () => ({ captureAnnotationScreenshot: capture }));

import { PageFeedbackToolbarCSS } from "./index";

const originalPoint = document.elementFromPoint;
const originalStack = document.elementsFromPoint;
const root = () => document.querySelector("agentation-toolbar")!.shadowRoot! as unknown as HTMLElement;
const popup = () => root().querySelector("[data-annotation-popup]") as HTMLElement | null;
const PICTURE = "data:image/png;base64,c2NyZWVuc2hvdA==";

function pickButton(props: Parameters<typeof PageFeedbackToolbarCSS>[0] = {}) {
  render(<><button>Save changes</button><PageFeedbackToolbarCSS {...props} /></>);
  const target = screen.getByText("Save changes");
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 60, 120, 32));
  document.elementFromPoint = () => target;
  document.elementsFromPoint = () => [target, document.body];
  fireEvent.keyDown(document, { key: "f", ctrlKey: true, shiftKey: true });
  fireEvent.click(target, { clientX: 50, clientY: 70 });
  return target;
}

async function writeNote(text: string) {
  const field = popup()!.querySelector("textarea")!;
  fireEvent.change(field, { target: { value: text } });
  fireEvent.keyDown(field, { key: "Enter" });
  await waitFor(() => expect(popup()).toBeNull(), { timeout: 2000 });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  capture.mockReset();
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() }, userAgent: "test-agent" });
});
afterEach(() => {
  cleanup();
  document.elementFromPoint = originalPoint;
  document.elementsFromPoint = originalStack;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("annotation screenshots", () => {
  it("captures the picked element in viewport coordinates and shows it in the popup", async () => {
    capture.mockResolvedValue(PICTURE);
    pickButton();
    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0][0].rect).toEqual({ x: 40, y: 60, width: 120, height: 32 });
    await waitFor(() => expect(popup()!.querySelector("img")?.getAttribute("src")).toBe(PICTURE));
  });

  it("sends the screenshot with the annotation and names it in the markdown", async () => {
    capture.mockResolvedValue(PICTURE);
    const onSubmit = vi.fn();
    const onAnnotationAdd = vi.fn();
    pickButton({ onSubmit, onAnnotationAdd, screenshotReference: (a, n) => `[Image #${n}](shot:${a.id})` });
    await waitFor(() => expect(popup()!.querySelector("img")).not.toBeNull());
    await writeNote("Make the label bolder");
    expect(onAnnotationAdd.mock.calls[0][0].screenshot).toBe(PICTURE);
    const send = within(root()).getByText("Send Annotations").parentElement!.querySelector("button")!;
    fireEvent.click(send);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const [output, annotations] = onSubmit.mock.calls[0];
    expect(annotations[0].screenshot).toBe(PICTURE);
    expect(output).toContain(`**Screenshot:** [Image #1](shot:${annotations[0].id})`);
    expect(output).toContain("Make the label bolder");
  });

  it("waits for a capture that is still running when Send is pressed", async () => {
    let finish: (value: string) => void = () => {};
    capture.mockReturnValue(new Promise<string>((resolve) => { finish = resolve; }));
    const onSubmit = vi.fn();
    pickButton({ onSubmit });
    await writeNote("Too much padding");
    const send = within(root()).getByText("Send Annotations").parentElement!.querySelector("button")!;
    fireEvent.click(send);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => finish(PICTURE));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][1][0].screenshot).toBe(PICTURE);
    expect(onSubmit.mock.calls[0][0]).not.toContain("Screenshot");
  });

  it("takes no picture when captureScreenshots is off", () => {
    pickButton({ captureScreenshots: false });
    expect(popup()).not.toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });
});
