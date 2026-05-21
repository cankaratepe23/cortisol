// "Import Template" — form: URL or file picker + name + optional trim/crop.

import { useState } from "react";
import {
  ActionPanel,
  Action,
  Form,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";

import { runCli } from "./cli";

interface Values {
  source: string;
  files: string[];
  name: string;
  start: string;
  end: string;
  crop: string;
  scale: string;
}

export default function ImportTemplate() {
  const [submitting, setSubmitting] = useState(false);
  const { pop } = useNavigation();

  async function onSubmit(v: Values) {
    const source = v.source.trim() || v.files[0];
    if (!source) {
      await showToast({ style: Toast.Style.Failure, title: "Provide a URL or pick a file" });
      return;
    }
    if (!v.name.trim()) {
      await showToast({ style: Toast.Style.Failure, title: "Name is required" });
      return;
    }

    setSubmitting(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Importing "${v.name}"…`,
    });
    try {
      const args = ["templates", "import", source, "--name", v.name.trim()];
      if (v.start.trim()) args.push("--start", v.start.trim());
      if (v.end.trim()) args.push("--end", v.end.trim());
      if (v.crop.trim()) args.push("--crop", v.crop.trim());
      if (v.scale.trim()) args.push("--scale", v.scale.trim());

      const { stdout } = await runCli(args);
      toast.style = Toast.Style.Success;
      toast.title = "Template imported";
      toast.message = stdout.trim();
      pop();
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Import failed";
      toast.message = (e as Error).message;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={submitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Import" onSubmit={onSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="source" title="URL" placeholder="https://… (leave empty to use file picker)" />
      <Form.FilePicker
        id="files"
        title="Or pick a local file"
        allowMultipleSelection={false}
      />
      <Form.Separator />
      <Form.TextField
        id="name"
        title="Name"
        placeholder='e.g. "ryan gosling low cortisol beach"'
      />
      <Form.TextField id="start" title="Trim start (optional)" placeholder="00:00:03" />
      <Form.TextField id="end" title="Trim end (optional)" placeholder="00:00:16" />
      <Form.TextField
        id="crop"
        title="Crop (optional)"
        placeholder="W:H:X:Y, e.g. 1080:1080:0:420"
      />
      <Form.TextField
        id="scale"
        title="Scale (optional)"
        placeholder='e.g. 1080:-2'
      />
    </Form>
  );
}
