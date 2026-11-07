import { useId, type FormEvent, type KeyboardEvent } from "react";

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** Stops sending only. The draft stays editable and keeps focus while offline or mid-send. */
  disabled: boolean;
  label: string;
  placeholder?: string;
  sendLabel?: string;
}

export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  label,
  placeholder,
  sendLabel = "Send",
}: ComposerProps) {
  const id = useId();
  const canSend = !disabled && value.trim() !== "";

  function trySend() {
    if (canSend) onSend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // During IME composition, as when typing Bangla, Enter accepts the word rather than sending.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    trySend();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    trySend();
  }

  return (
    <form className="mt-composer" onSubmit={handleSubmit}>
      <label htmlFor={id} className="mt-sr-only">
        {label}
      </label>
      <textarea
        id={id}
        className="mt-composer__input"
        rows={1}
        value={value}
        {...(placeholder === undefined ? {} : { placeholder })}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={handleKeyDown}
      />
      <button type="submit" className="mt-icon-button" aria-label={sendLabel} disabled={!canSend}>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>
    </form>
  );
}
