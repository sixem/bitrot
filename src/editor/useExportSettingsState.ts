// Owns export settings state and derived output path for the editor workflow.
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import type { ExportSettings } from "@/editor/ExportModal";
import {
  buildDefaultOutputPath,
  joinOutputPath,
  resolveExtensionForFormat,
  splitOutputPath
} from "@/jobs/output";
import { DEFAULT_EXPORT_PROFILE, type ExportProfile } from "@/jobs/exportProfile";
import { DEFAULT_EXPORT_PRESET_ID } from "@/jobs/exportPresets";
import type { ModeId } from "@/modes/definitions";

type ExportSettingsStateArgs = {
  assetPath: string;
  modeId: ModeId;
  jobOutputPath?: string;
};

type ExportSettingsState = {
  exportSettings: ExportSettings;
  setExportSettings: Dispatch<SetStateAction<ExportSettings>>;
  outputPath: string;
};

// Owns export settings + output path derivation for the editor.
const useExportSettingsState = ({
  assetPath,
  modeId,
  jobOutputPath
}: ExportSettingsStateArgs): ExportSettingsState => {
  const defaultProfile: ExportProfile = useMemo(
    () =>
      modeId === "copy"
        ? { ...DEFAULT_EXPORT_PROFILE, videoMode: "copy" }
        : DEFAULT_EXPORT_PROFILE,
    [modeId]
  );

  const defaultOutputPath = useMemo(
    () =>
      buildDefaultOutputPath(
        assetPath,
        resolveExtensionForFormat(defaultProfile.format)
      ),
    [assetPath, defaultProfile.format]
  );

  const [exportSettings, setExportSettings] = useState<ExportSettings>(() => ({
    ...splitOutputPath(defaultOutputPath),
    profile: defaultProfile,
    presetId: DEFAULT_EXPORT_PRESET_ID
  }));

  useEffect(() => {
    setExportSettings((prev) => ({
      ...splitOutputPath(
        buildDefaultOutputPath(
          assetPath,
          resolveExtensionForFormat(prev.profile.format)
        )
      ),
      profile: prev.profile,
      presetId: prev.presetId
    }));
  }, [assetPath]);

  useEffect(() => {
    if (modeId === "copy") {
      return;
    }
    if (exportSettings.profile.videoMode !== "copy") {
      return;
    }
    setExportSettings((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        videoMode: "encode"
      }
    }));
  }, [exportSettings.profile.videoMode, modeId]);

  const outputPath =
    jobOutputPath ??
    joinOutputPath(
      exportSettings.folder,
      exportSettings.fileName,
      exportSettings.separator
    );

  return { exportSettings, setExportSettings, outputPath };
};

export default useExportSettingsState;
