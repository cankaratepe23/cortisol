// "Preview Template" — list templates, Enter renders a PNG preview for
// today and shows it in a Detail view. The same PNG is also opened in
// macOS Preview (via the CLI's `open` call) for closer inspection.

import { useEffect, useState } from "react";
import {
  ActionPanel,
  Action,
  List,
  Detail,
  Toast,
  showToast,
  Icon,
  useNavigation,
} from "@raycast/api";

import { listTemplates, runCli, type TemplateMeta } from "./cli";

export default function Preview() {
  const [templates, setTemplates] = useState<TemplateMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { push } = useNavigation();

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
          subtitle={`${t.width}×${t.height}`}
          icon={Icon.Image}
          actions={
            <ActionPanel>
              <Action
                title="Show Preview"
                icon={Icon.Eye}
                onAction={() => push(<PreviewDetail template={t} />)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function PreviewDetail({ template }: { template: TemplateMeta }) {
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const toast = await showToast({ style: Toast.Style.Animated, title: "Rendering preview…" });
      try {
        // `--no-open` so we don't also pop macOS Preview behind Raycast.
        const { stdout } = await runCli(["preview", template.slug, "--no-open"]);
        if (!cancelled) {
          setPng(stdout.trim());
          toast.style = Toast.Style.Success;
          toast.title = "Preview ready";
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          toast.style = Toast.Style.Failure;
          toast.title = "Preview failed";
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [template.slug]);

  if (error) {
    return <Detail markdown={`# Preview failed\n\n\`\`\`\n${error}\n\`\`\``} />;
  }
  if (!png) {
    return <Detail isLoading markdown={`# ${template.name}\n\nRendering…`} />;
  }
  return (
    <Detail
      markdown={`# ${template.name}\n\n![preview](file://${png})`}
      actions={
        <ActionPanel>
          <Action.Open title="Open PNG in Preview" target={png} />
          <Action.ShowInFinder path={png} />
        </ActionPanel>
      }
    />
  );
}
