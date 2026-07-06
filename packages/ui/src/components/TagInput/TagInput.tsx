'use client';

import type { KeyboardEvent, ClipboardEvent } from 'react';
import { useMemo, useState } from 'react';
import styles from './TagInput.module.css';

export interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
  validateTag?: (tag: string, currentTags: string[]) => string | undefined;
  separators?: RegExp;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
}

const DEFAULT_SEPARATORS = /[\n,]+/;

const splitTags = (value: string, separators: RegExp) =>
  value
    .split(separators)
    .map((tag) => tag.trim())
    .filter(Boolean);

/**
 * TagInput — controlled multi-value input for frontmatter tags, labels, and
 * lightweight taxonomies. Use inside FormField just like a native input.
 */
export function TagInput({
  value,
  onChange,
  id,
  name,
  placeholder = 'Add tag',
  disabled = false,
  required = false,
  error,
  hint,
  validateTag,
  separators = DEFAULT_SEPARATORS,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | undefined>();
  const message = error ?? localError ?? hint;
  const messageId = message && id ? `${id}-tag-message` : undefined;
  const describedBy = [ariaDescribedBy, messageId].filter(Boolean).join(' ') || undefined;
  const normalized = useMemo(() => new Set(value.map((tag) => tag.toLocaleLowerCase())), [value]);

  const addTags = (tags: string[]) => {
    const next = [...value];
    const nextNormalized = new Set(normalized);

    for (const tag of tags) {
      const normalizedTag = tag.toLocaleLowerCase();
      const duplicate = nextNormalized.has(normalizedTag);
      const validationMessage = duplicate
        ? 'Tag already exists.'
        : (validateTag?.(tag, next) ?? undefined);

      if (validationMessage) {
        setLocalError(validationMessage);
        return;
      }

      next.push(tag);
      nextNormalized.add(normalizedTag);
    }

    setLocalError(undefined);
    setDraft('');
    onChange(next);
  };

  const commitDraft = () => {
    const tags = splitTags(draft, separators);
    if (tags.length === 0) {
      return;
    }
    addTags(tags);
  };

  const removeTag = (index: number) => {
    setLocalError(undefined);
    onChange(value.filter((_, tagIndex) => tagIndex !== index));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
    }

    if (event.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      event.preventDefault();
      removeTag(value.length - 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    const tags = splitTags(text, separators);
    if (tags.length <= 1) {
      return;
    }
    event.preventDefault();
    addTags(tags);
  };

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <div
        className={[
          styles.control,
          disabled ? styles.disabled : undefined,
          error || localError || ariaInvalid ? styles.invalid : undefined,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value.map((tag, index) => (
          <span key={`${tag}-${index}`} className={styles.tag}>
            <span className={styles.tagLabel}>{tag}</span>
            <button
              type="button"
              className={styles.removeButton}
              onClick={() => removeTag(index)}
              disabled={disabled}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          name={name}
          className={styles.input}
          value={draft}
          placeholder={value.length === 0 ? placeholder : undefined}
          disabled={disabled}
          required={required && value.length === 0}
          aria-describedby={describedBy}
          aria-invalid={ariaInvalid ?? (Boolean(error || localError) || undefined)}
          aria-label={ariaLabel}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          onPaste={handlePaste}
        />
      </div>
      {message && (
        <p
          id={messageId}
          className={error || localError ? styles.error : styles.hint}
          role={error || localError ? 'alert' : undefined}
        >
          {message}
        </p>
      )}
    </div>
  );
}
