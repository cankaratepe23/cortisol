// "Generate Today's Clip" — list templates, hit Enter to render today's
// date onto the selected one (Cmd+G also emits a GIF). Reveals the output
// in Finder when done.

import { useEffect, useState } from "react";
import {
  ActionPanel,
  Action,
  List,
  Toast,
  showToast,
  showInFinder,
  Icon,
} from "@raycast/api";

import { getOutDir, listTemplates, runCli, type TemplateMeta } from "./cli";

export default function Generate() {
  const [templates, setTemplates] = useState<TemplateMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) {
    return (
      <List>
        <List.EmptyView title="Could not load templates" description={error} icon={Icon.Warning} />
      </List>
    );
  }

  return (
    <List isLoading={templates === null} searchBarPlaceholder="Search templates by name">
      {(templates ?? []).map((t) => (
        <List.Item
          key={t.slug}
          title={t.name}
          subtitle={`${t.width}×${t.height} + band ${t.bandHeight}px`}
          icon={Icon.Video}
          actions={
            <ActionPanel>
              <Action title="Render MP4 (today)" icon={Icon.Play} onAction={() => render(t, { gif: false })} />
              <Action
                title="Render MP4 + GIF (today)"
                icon={Icon.Stars}
                shortcut={{ modifiers: ["cmd"], key: "g" }}
                onAction={() => render(t, { gif: true })}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

async function render(t: TemplateMeta, opts: { gif: boolean }) {
  const toast = await showToast({ style: Toast.Style.Animated, title: `Rendering "${t.name}"…` });
  try {
    const args = ["render", t.slug, "--out", getOutDir()];
    if (opts.gif) args.push("--gif");
    const { stdout } = await runCli(args);
    const lines = stdout.trim().split("\n").filter(Boolean);
    const mp4 = lines.find((l) => l.endsWith(".mp4"));
    toast.style = Toast.Style.Success;
    toast.title = `Rendered "${t.name}"`;
    toast.message = lines.join("\n");
    if (mp4) await showInFinder(mp4);
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Render failed";
    toast.message = (e as Error).message;
  }
}
