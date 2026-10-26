import { useId } from "react";
import type { Post } from "./types";
export function PostFields({
  post,
  errors = {},
}: {
  post?: Partial<Post>;
  errors?: Record<string, string[]>;
}) {
  const id = useId();
  const feedback = (name: string) =>
    errors[name] && (
      <span id={`${id}-${name}`} className="field-error">
        {errors[name].join(" ")}
      </span>
    );
  const validation = (name: string) => ({
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${id}-${name}` : undefined,
  });
  return (
    <>
      <label className="field">
        Title
        <input
          name="title"
          {...validation("title")}
          required
          maxLength={200}
          defaultValue={post?.title || ""}
          placeholder="Give your idea a name"
        />
        {feedback("title")}
      </label>
      <label className="field">
        Description
        <textarea
          name="description"
          {...validation("description")}
          maxLength={5000}
          defaultValue={post?.description || ""}
          placeholder="What caught your eye?"
          rows={4}
        />
        {feedback("description")}
      </label>
      <label className="field">
        Tags
        <input
          name="tags"
          aria-label="Tags"
          {...validation("tags")}
          maxLength={400}
          defaultValue={post?.tags?.join(", ") || ""}
          placeholder="blue, architecture, nature"
        />
        <small>Up to 8 tags, separated by commas.</small>
        {feedback("tags")}
      </label>
      <label className="field">
        Source link <span className="optional">optional</span>
        <input
          name="source_url"
          {...validation("source_url")}
          type="url"
          maxLength={500}
          defaultValue={post?.source_url || ""}
          placeholder="https://..."
        />
        {feedback("source_url")}
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          name="allow_download"
          defaultChecked={post?.allow_download !== false}
        />
        <span>
          Allow downloads<small>Let people download the full-size image.</small>
        </span>
      </label>
      <label className="field">
        Alt text <span className="optional">recommended</span>
        <input
          name="alt_text"
          aria-label="Alt text"
          {...validation("alt_text")}
          maxLength={500}
          defaultValue={post?.alt_text || ""}
          placeholder="Describe the image for someone who cannot see it"
        />
        <small>
          A short description helps people using screen readers enjoy your pin.
        </small>
        {feedback("alt_text")}
      </label>
    </>
  );
}
