import { Box, Text, useInput } from "ink";
import { useState } from "react";

interface Props {
  title: string;
  hint?: string;
  error?: string | null;
  busy?: boolean;
  /** Characters allowed in the field. Others are ignored. */
  allowed?: RegExp;
  maxLength?: number;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** A one-line text prompt. Pasted text arrives as one chunk and is accepted whole. */
export function TextField({
  title,
  hint,
  error,
  busy,
  allowed = /./,
  maxLength = 80,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState("");
  useInput((input, key) => {
    if (busy) return;
    if (key.escape) return onCancel();
    if (key.return) return value.trim() ? onSubmit(value.trim()) : undefined;
    if (key.backspace || key.delete) return setValue((v) => v.slice(0, -1));
    if (key.ctrl || key.meta || key.tab) return;
    const kept = [...input].filter((ch) => allowed.test(ch)).join("");
    if (kept) setValue((v) => (v + kept).slice(0, maxLength));
  });
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      {hint ? <Text dimColor>{hint}</Text> : null}
      <Box marginTop={1}>
        <Text>
          {"> "}
          {value}
          <Text inverse> </Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        {busy ? <Text dimColor>Working…</Text> : error ? <Text color="red">{error}</Text> : null}
      </Box>
      <Text dimColor>enter confirm · esc back</Text>
    </Box>
  );
}
