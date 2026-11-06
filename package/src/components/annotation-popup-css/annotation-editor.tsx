import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { AnnotationPopupCSSProps } from "./index";
import { originalSetTimeout } from "../../utils/freeze-animations";
import styles from "./styles.module.scss";

/** Focus an element while temporarily blocking focus-trap libraries (e.g. Radix
 *  FocusScope) from reclaiming focus via focusin/focusout handlers. */
function focusBypassingTraps(el: HTMLElement | null) {
  if (!el) return;
  const trap = (e: Event) => e.stopImmediatePropagation();
  document.addEventListener("focusin", trap, true);
  document.addEventListener("focusout", trap, true);
  try {
    el.focus({ preventScroll: true });
  } finally {
    document.removeEventListener("focusin", trap, true);
    document.removeEventListener("focusout", trap, true);
  }
}

export type AnnotationEditorProps = Pick<
  AnnotationPopupCSSProps,
  | "element"
  | "timestamp"
  | "selectedText"
  | "screenshot"
  | "placeholder"
  | "initialValue"
  | "submitLabel"
  | "onSubmit"
  | "onCancel"
  | "onDelete"
  | "onOpenSource"
  | "allowEmpty"
  | "accentColor"
  | "computedStyles"
> & {
  disabled?: boolean;
  preview?: boolean;
  resetOnPreview?: boolean;
  variant?: "popup" | "card";
};

export type AnnotationEditorHandle = { focus: () => void };

/** The form is shared by new-note popups and the saved-note preview card. */
export const AnnotationEditor = forwardRef<
  AnnotationEditorHandle,
  AnnotationEditorProps
>(function AnnotationEditor(
  {
    element,
    timestamp,
    selectedText,
    screenshot,
    placeholder = "What should change?",
    initialValue = "",
    submitLabel = "Add",
    onSubmit,
    onCancel,
    onDelete,
    onOpenSource,
    allowEmpty = false,
    accentColor = "#3c82f7",
    computedStyles,
    disabled = false,
    preview = false,
    resetOnPreview = true,
    variant = "popup",
  },
  ref,
) {
  const isCard = variant === "card";
  const [text, setText] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const [isStylesExpanded, setIsStylesExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const previewExcerpt = selectedText
    ? ` "${selectedText.slice(0, 30)}${selectedText.length > 30 ? "..." : ""}"`
    : "";
  useLayoutEffect(() => {
    const form = formRef.current;
    const textarea = textareaRef.current;
    if (!isCard || !form || !textarea) return;
    const measure = () => {
      form.style.setProperty(
        "--editor-field-height",
        `${textarea.offsetHeight}px`,
      );
    };
    measure();
    // Canvas measures the existing text without adding a second renderer.
    if ("CanvasRenderingContext2D" in window) {
      const context = document.createElement("canvas").getContext("2d");
      if (context) {
        const family = getComputedStyle(textarea).fontFamily;
        context.font = `13px ${family}`;
        const noteWidth = context.measureText(
          initialValue.replace(/\s+/g, " "),
        ).width;
        context.font = `italic 12px ${family}`;
        const headingWidth = context.measureText(
          element + previewExcerpt,
        ).width;
        const width = Math.min(
          200,
          Math.max(120, Math.ceil(Math.max(noteWidth, headingWidth)) + 24),
        );
        form
          .closest<HTMLElement>("[data-annotation-card]")
          ?.style.setProperty("--preview-width", `${width}px`);
        const note = form.querySelector<HTMLElement>("[data-shared-note]");
        if (note)
          note.toggleAttribute("data-truncated", noteWidth > width - 24);
      }
    }
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    observer?.observe(textarea);
    return () => observer?.disconnect();
  }, [isCard, element, initialValue, previewExcerpt]);
  useLayoutEffect(() => {
    if (preview && resetOnPreview) {
      setText(initialValue);
      setIsStylesExpanded(false);
      if (textareaRef.current) {
        textareaRef.current.scrollTop = 0;
        textareaRef.current.scrollLeft = 0;
      }
    }
  }, [preview, resetOnPreview, initialValue]);
  useImperativeHandle(
    ref,
    () => ({
      focus() {
        const textarea = textareaRef.current;
        focusBypassingTraps(textarea);
        if (textarea) {
          textarea.selectionStart = textarea.selectionEnd =
            textarea.value.length;
          textarea.scrollTop = isCard ? 0 : textarea.scrollHeight;
        }
      },
    }),
    [isCard],
  );

  const handleSubmit = useCallback(() => {
    if (disabled || (!text.trim() && !allowEmpty)) return;
    onSubmit(text.trim());
  }, [disabled, text, allowEmpty, onSubmit]);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
    if (event.key === "Escape") onCancel();
  };

  return (
    <div
      ref={formRef}
      className={isCard ? styles.sharedForm : undefined}
      style={isCard ? undefined : { display: "contents" }}
      data-annotation-editor
      data-preview={preview || undefined}
    >
      <div className={styles.header} data-editor-heading>
        {computedStyles && Object.keys(computedStyles).length > 0 ? (
          <button
            className={styles.headerToggle}
            onClick={() => {
              const wasExpanded = isStylesExpanded;
              setIsStylesExpanded(!isStylesExpanded);
              if (wasExpanded) {
                // Refocus textarea when closing
                originalSetTimeout(
                  () => focusBypassingTraps(textareaRef.current),
                  0,
                );
              }
            }}
            type="button"
          >
            <svg
              className={`${styles.chevron} ${isStylesExpanded ? styles.expanded : ""}`}
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5.5 10.25L9 7.25L5.75 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.element}>
              {element}
              {isCard && previewExcerpt && (
                <span className={styles.previewExcerpt}>{previewExcerpt}</span>
              )}
            </span>
          </button>
        ) : (
          <span className={styles.element}>
            {element}
            {isCard && previewExcerpt && (
              <span className={styles.previewExcerpt}>{previewExcerpt}</span>
            )}
          </span>
        )}
        {timestamp && <span className={styles.timestamp}>{timestamp}</span>}
      </div>

      {onOpenSource && (
        <div
          className={isCard ? styles.sharedExtra : undefined}
          style={isCard ? undefined : { display: "contents" }}
        >
          <div
            className={isCard ? styles.sharedExtraInner : undefined}
            style={isCard ? undefined : { display: "contents" }}
          >
            <button
              type="button"
              className={styles.sourceAction}
              onClick={onOpenSource}
            >
              Open in editor
            </button>
          </div>
        </div>
      )}

      {/* Collapsible computed styles section - uses grid-template-rows for smooth animation */}
      {computedStyles && Object.keys(computedStyles).length > 0 && (
        <div
          className={`${styles.stylesWrapper} ${isStylesExpanded ? styles.expanded : ""}`}
        >
          <div className={styles.stylesInner}>
            <div className={styles.stylesBlock}>
              {Object.entries(computedStyles).map(([key, value]) => (
                <div key={key} className={styles.styleLine}>
                  <span className={styles.styleProperty}>
                    {key.replace(/([A-Z])/g, "-$1").toLowerCase()}
                  </span>
                  : <span className={styles.styleValue}>{value}</span>;
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedText && (
        <div
          className={isCard ? styles.sharedExtra : undefined}
          style={isCard ? undefined : { display: "contents" }}
        >
          <div
            className={isCard ? styles.sharedExtraInner : undefined}
            style={isCard ? undefined : { display: "contents" }}
          >
            <div className={styles.quote}>
              &ldquo;{selectedText.slice(0, 80)}
              {selectedText.length > 80 ? "..." : ""}&rdquo;
            </div>
          </div>
        </div>
      )}

      {screenshot && (
        <img
          className={styles.screenshot}
          src={screenshot}
          alt="Screenshot sent with this note"
          title="This picture is sent with the note"
          draggable={false}
        />
      )}

      <div
        data-shared-note
        className={isCard ? styles.sharedNote : undefined}
        style={
          isCard
            ? ({
                "--field-border": isFocused ? accentColor : undefined,
              } as React.CSSProperties)
            : { display: "contents" }
        }
      >
        <div
          className={isCard ? styles.sharedNoteContent : undefined}
          style={isCard ? undefined : { display: "contents" }}
        >
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            readOnly={preview}
            aria-hidden={preview}
            style={
              isCard
                ? undefined
                : { borderColor: isFocused ? accentColor : undefined }
            }
            placeholder={placeholder}
            value={preview ? text.replace(/\s+/g, " ") : text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            rows={2}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <div
        data-editor-actions
        className={isCard ? styles.sharedActions : undefined}
        style={isCard ? undefined : { display: "contents" }}
      >
        <div className={styles.actions}>
          {onDelete && (
            <div className={styles.deleteWrapper}>
              <button
                className={styles.deleteButton}
                onClick={onDelete}
                type="button"
                aria-label="Delete annotation"
              >
                Delete
              </button>
            </div>
          )}
          <button className={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={styles.submit}
            style={{
              backgroundColor: accentColor,
              opacity: text.trim() || allowEmpty ? 1 : 0.4,
            }}
            onClick={handleSubmit}
            disabled={disabled || (!text.trim() && !allowEmpty)}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
});
