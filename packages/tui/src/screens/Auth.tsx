import {
  type Api,
  ApiRequestError,
  type MeResponse,
  USERNAME_MAX,
  USERNAME_MIN,
} from "@agentic-wordle/core";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { TextField } from "../components/TextField.js";
import { ACCENT } from "../theme.js";

function message(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "username_taken") return "That username is taken. Try another.";
    if (error.code === "unauthorized") return "That key was not recognised.";
    return error.message || "Something went wrong.";
  }
  return "Something went wrong.";
}

export function SignUp({
  api,
  onDone,
  onCancel,
}: {
  api: Api;
  onDone: (result: { username: string; key: string }) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <TextField
      title="Choose a username"
      hint={`${USERNAME_MIN}-${USERNAME_MAX} letters, digits or underscores. You get a login key next, no email or password.`}
      allowed={/[A-Za-z0-9_]/}
      maxLength={USERNAME_MAX}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onSubmit={async (username) => {
        setBusy(true);
        setError(null);
        try {
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
          onDone(await api.register(username, timezone));
        } catch (e) {
          setError(message(e));
          setBusy(false);
        }
      }}
    />
  );
}

export function SignIn({
  api,
  onDone,
  onCancel,
}: {
  api: Api;
  onDone: (key: string, me: MeResponse) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <TextField
      title="Paste your login key"
      hint="The key you were shown when you created your account."
      allowed={/[A-Za-z0-9\- ]/}
      maxLength={60}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onSubmit={async (key) => {
        setBusy(true);
        setError(null);
        try {
          onDone(key, await api.me(key));
        } catch (e) {
          setError(message(e));
          setBusy(false);
        }
      }}
    />
  );
}

export function KeyShown({
  username,
  keyText,
  onContinue,
}: {
  username: string;
  keyText: string;
  onContinue: () => void;
}) {
  useInput((_input, key) => {
    if (key.return) onContinue();
  });
  return (
    <Box flexDirection="column" alignItems="flex-start">
      <Text bold color="green">
        Welcome, {username}!
      </Text>
      <Text>Your login key:</Text>
      <Box marginY={1} borderStyle="round" borderColor={ACCENT} paddingX={2}>
        <Text bold>{keyText}</Text>
      </Box>
      <Text color="yellow">Save it somewhere safe. It is shown only once.</Text>
      <Text dimColor>
        There is no email or password reset: if you lose the key, you lose the account.
      </Text>
      <Text dimColor>It is already saved on this computer, so you stay signed in here.</Text>
      <Box marginTop={1}>
        <Text dimColor>press enter to continue</Text>
      </Box>
    </Box>
  );
}
