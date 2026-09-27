import { App, ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinition, SettingDefinitionItem, SettingGroup } from "obsidian";
import QuranLifePlugin from "./main";
import { ACTIVE_PART_OPTIONS, ALL_QURAN_PART, QuranPart } from "@/lib/types";
import { getSurahsByPart } from "@/lib/quranData";
import { clampDailyTargetMinutes, DEFAULT_DAILY_TARGET_MINUTES, estimateEligibleCycleDays, getEligibleVerseCount } from "@/lib/dailyPortionUtils";
import { ALLOWED_RECITERS, getAudioPlayerReciters, Reciter } from "@/lib/audio";
import { readStored, writeStored } from "@/lib/pluginStorage";
import {
  getTotalOfflineStorageUsage,
  downloadPartAudio,
  deletePartAudio,
  deleteAllOfflineAudioForReciter,
  scanOfflineAudioForReciter,
  sumOfflineSizes,
  formatBytes,
  getOfflineAudioRoot,
} from "./offlineAudio";
import type { OfflineDownloadProgress, OfflinePartScan, OfflineReciterScan } from "./offlineAudio";
import { LEGACY_DATA_ROOT, VAULT_PATHS, asRecord } from "./storage/vaultAdapter";
import { normalizeAnkiExportPrefs, DEFAULT_ANKI_EXPORT_PREFS } from "@/lib/anki/ankiExportPrefs";
import type { AnkiExportPrefs } from "@/lib/anki/ankiExportPrefs";
import { confirmAction } from "./lib/confirm";

// Keys shared with the player (see AudioPlayerLocal) so the settings tab can tell
// the user which reciter playback actually uses, and switch it in one click.
const PLAYER_RECITER_STORAGE_KEY = "selected_reciter_id";
const DOWNLOAD_RECITER_STORAGE_KEY = "offline_download_reciter_id";
const PLAYER_RECITER_EVENT = "quran-life:player-reciter-changed";

// One offline download at a time, tracked at module scope: the tab re-renders
// whenever any related setting changes, and the re-rendered rows must still see the
// running download (to show its state, block a second one and offer Cancel).
let offlineDownloadInFlight: QuranPart | null = null;
let offlineDownloadAbort: AbortController | null = null;
let offlineDownloadSettled: (() => void) | null = null;

export interface QuranLifePluginSettings {
  autoSyncDebounceMs: number;
}

// The data folder is not configurable: everything lives in the plugin's own data
// folder (`<configDir>/plugins/quran-life/data`, resolved at runtime because the
// configuration folder itself is user-configurable). A leftover `dataRoot` key
// in an old data.json is ignored on load.
export const DEFAULT_SETTINGS: QuranLifePluginSettings = {
  autoSyncDebounceMs: 700,
};

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'string' ? e : "unknown error";
}

type DailyPortionMode = 'audio' | 'reading';
type DailyReadingStyle = 'line_by_line' | 'paragraph';
interface DailySettings {
  activePart: QuranPart;
  dailyTargetMinutes: number;
  dailyPortionMode: DailyPortionMode;
  dailyReadingStyle: DailyReadingStyle;
  skippedSurahs: number[];
}

const DEFAULT_DAILY: DailySettings = {
  activePart: ALL_QURAN_PART,
  dailyTargetMinutes: DEFAULT_DAILY_TARGET_MINUTES,
  dailyPortionMode: 'audio',
  dailyReadingStyle: 'paragraph',
  skippedSurahs: [],
};

function isValidQuranPart(v: unknown): v is QuranPart {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= ALL_QURAN_PART;
}
function normalizeSkipped(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const s = new Set<number>();
  for (const x of v) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 1 && n <= 114) s.add(n);
  }
  return Array.from(s).sort((a, b) => a - b);
}
function parseDaily(raw: unknown): DailySettings {
  const record = asRecord(raw);
  if (!record) return { ...DEFAULT_DAILY };
  return {
    activePart: isValidQuranPart(record.activePart) ? record.activePart : DEFAULT_DAILY.activePart,
    dailyTargetMinutes: Number.isFinite(Number(record.dailyTargetMinutes)) ? clampDailyTargetMinutes(Number(record.dailyTargetMinutes)) : DEFAULT_DAILY.dailyTargetMinutes,
    dailyPortionMode: record.dailyPortionMode === 'reading' ? 'reading' : 'audio',
    dailyReadingStyle: record.dailyReadingStyle === 'line_by_line' ? 'line_by_line' : 'paragraph',    skippedSurahs: normalizeSkipped(record.skippedSurahs),
  };
}

/**
 * Settings tab built on Obsidian's declarative settings API (1.13+),
 * `getSettingDefinitions()`.
 *
 * Every row is a `render` definition carrying a real name + description, so all
 * settings are indexed by Obsidian's settings search while the row contents stay
 * the exact imperative components this tab always used (sliders, dynamic
 * descriptions, the offline-audio library manager, …).
 *
 * `display()` is only the fallback for Obsidian < 1.13: it renders the very same
 * definitions imperatively, so both paths stay in sync by construction.
 */
export class QuranLifeSettingTab extends PluginSettingTab {
  plugin: QuranLifePlugin;
  private displayGeneration = 0;
  /** Async-loaded values the (synchronous) definition builder reads from. */
  private dailyCache: DailySettings | null = null;
  private ankiPrefsCache: AnkiExportPrefs | null = null;
  private recitersCache: Reciter[] | null = null;
  private cachesRequested = false;

  constructor(app: App, plugin: QuranLifePlugin) {
    super(app, plugin);
    this.plugin = plugin;
    // Mobile CSS is scoped under this class; the declarative renderer keeps the
    // container element, so setting the class once here covers both paths.
    try { this.containerEl.addClass("quran-life-settings"); } catch { /* container not ready */ }
  }

  /** Obsidian < 1.13 fallback (on 1.13+ the tab renders from the definitions). */
  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("quran-life-settings");
    this.renderDefinitionItems(this.containerEl, this.getSettingDefinitions());
  }

  /**
   * Declarative settings (Obsidian 1.13+): the same rows as `display()`, each
   * with a name/description so they appear in settings search.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const myGen = ++this.displayGeneration;
    this.requestCaches(myGen);

    const offlineRoot = getOfflineAudioRoot(this.app);
    const dataRoot = this.plugin.dataRootPath();
    const offlineReciters: Reciter[] = this.recitersCache ?? ALLOWED_RECITERS;
    const ankiPrefs: AnkiExportPrefs = this.ankiPrefsCache ?? { ...DEFAULT_ANKI_EXPORT_PREFS };
    let daily: DailySettings = this.dailyCache ? { ...this.dailyCache } : { ...DEFAULT_DAILY };

    // Rows that change when the daily settings change; each row's render callback
    // registers the refresher that belongs to it (all optional).
    const refreshers: {
      minutesDesc?: () => void;
      surahList?: () => void;
      surahCount?: () => void;
      offline?: () => void;
    } = {};

    /** A declarative row whose contents are built imperatively. */
    const row = (name: string, desc: string | undefined, build: (setting: Setting) => void): SettingDefinition =>
      ({
        name,
        ...(desc ? { desc } : {}),
        render: (setting: Setting) => {
          // Keep label/description identical on both render paths (the
          // declarative framework may or may not pre-fill them).
          setting.setName(name);
          if (desc) setting.setDesc(desc);
          build(setting);
        },
      });

    /** A custom block: replaces the row chrome and draws its own content. */
    const block = (name: string, build: (el: HTMLElement) => void): SettingDefinition =>
      ({
        name,
        render: (setting: Setting) => {
          setting.settingEl.empty();
          setting.settingEl.removeClass("setting-item");
          setting.settingEl.addClass("quran-life-block");
          build(setting.settingEl);
        },
      });

    const saveDaily = async (patch: Partial<DailySettings>): Promise<void> => {
      daily = { ...daily, ...patch };
      if (patch.skippedSurahs !== undefined) daily.skippedSurahs = normalizeSkipped(patch.skippedSurahs);
      if (patch.dailyTargetMinutes !== undefined) daily.dailyTargetMinutes = clampDailyTargetMinutes(Number(patch.dailyTargetMinutes));
      if (patch.activePart !== undefined && !isValidQuranPart(patch.activePart)) {
        daily.activePart = parseDaily(await this.plugin.vaultStore.loadSettings<unknown>(null)).activePart;
      }
      this.dailyCache = { ...daily };
      const payload = { ...daily, updatedAt: new Date().toISOString() };
      await this.plugin.vaultStore.saveSettings(payload);
      try { window.dispatchEvent(new CustomEvent('quran-life:daily-settings-changed')); } catch { /* no listeners */ }
      try { refreshers.surahList?.(); } catch { /* list not rendered yet */ }
      try { refreshers.surahCount?.(); } catch { /* heading not rendered yet */ }
      try { refreshers.minutesDesc?.(); } catch { /* slider not rendered yet */ }
      try { refreshers.offline?.(); } catch { /* offline section not rendered yet */ }
    };

    // ---------- Storage & sync ----------
    const storageGroup: SettingDefinitionItem = {
      type: "group",
      heading: "Storage & sync",
      items: [
        // Read-only on purpose: a fixed folder means every vault (and every
        // device using it) syncs exactly one predictable directory.
        row("Data folder", `Always the plugin's own data folder: ${dataRoot}`, () => {}),
        row("Autobackup", "Keep on for instant saves.", (setting) => {
          setting.addToggle((toggle) =>
            toggle
              .setValue(this.plugin.settings.autoSyncDebounceMs > 0)
              .onChange(async (value) => {
                this.plugin.settings.autoSyncDebounceMs = value ? 700 : 0;
                await this.plugin.saveSettings();
              })
          );
        }),
        row("Migrate legacy backup", "Import legacy JSON backup.", (setting) => {
          setting.addButton((btn) =>
            btn.setButtonText("Migrate").onClick(() => { void this.plugin.promptLegacyMigration(); })
          );
        }),
      ],
    };

    // ---------- Daily portion ----------
    let updateMinutesDesc: () => void = () => {};
    let renderSurahList: () => void = () => {};
    let updateSurahCount: () => void = () => {};
    let readingStyleEl: HTMLElement | null = null;
    const syncReadingStyleVisibility = (mode: DailyPortionMode): void => {
      readingStyleEl?.toggleClass("quran-life-hidden", mode !== 'reading');
    };

    const minutesRow: SettingDefinitionItem = row("Daily target", `${daily.dailyTargetMinutes} min`, (setting) => {
      updateMinutesDesc = () => {
        const eligible = getSurahsByPart(daily.activePart).filter(s => !daily.skippedSurahs.includes(s.id));
        const totalVerses = getEligibleVerseCount(eligible);
        const days = estimateEligibleCycleDays(eligible, daily.dailyTargetMinutes, daily.dailyPortionMode);
        const versesPerDay = totalVerses && days ? Math.ceil(totalVerses / days) : 0;
        if (eligible.length === 0) {
          setting.setDesc(`${daily.dailyTargetMinutes} min • no surahs selected`);
        } else {
          setting.setDesc(`${daily.dailyTargetMinutes} min • ~${versesPerDay} verses/day • ~${days} days • ${totalVerses} verses in scope • ${daily.dailyPortionMode === 'audio' ? 'Listening' : 'Reading'}`);
        }
      };
      refreshers.minutesDesc = updateMinutesDesc;
      updateMinutesDesc();
      setting.addSlider((slider) => {
        slider.setLimits(5, 180, 5);
        slider.setValue(daily.dailyTargetMinutes);
        slider.onChange(async (v) => {
          daily.dailyTargetMinutes = clampDailyTargetMinutes(v);
          updateMinutesDesc();
          await saveDaily({ dailyTargetMinutes: v });
          updateMinutesDesc();
        });
      });
    });

    const dailyGroup: SettingDefinitionItem = {
      type: "group",
      heading: "Daily portion",
      items: [
        row("Part", "Qur'an part", (setting) => {
          setting.addDropdown((drop) => {
            for (const opt of ACTIVE_PART_OPTIONS) drop.addOption(String(opt.id), opt.name);
            drop.setValue(String(daily.activePart));
            drop.onChange((v) => {
              void (async () => {
                const part = Number(v);
                await saveDaily({ activePart: isValidQuranPart(part) ? part : DEFAULT_DAILY.activePart });
                updateMinutesDesc();
              })();
            });
          });
        }),
        minutesRow,
        row("Reading style", undefined, (setting) => {
          readingStyleEl = setting.settingEl;
          setting.addDropdown((drop) => {
            drop.addOption("paragraph", "Paragraph");
            drop.addOption("line_by_line", "Line by line");
            drop.setValue(daily.dailyReadingStyle);
            drop.onChange(async (v) => { await saveDaily({ dailyReadingStyle: v === 'line_by_line' ? 'line_by_line' : 'paragraph' }); });
          });
          syncReadingStyleVisibility(daily.dailyPortionMode);
        }),
        row("Mode", undefined, (setting) => {
          setting.addDropdown((drop) => {
            drop.addOption("audio", "Listening");
            drop.addOption("reading", "Reading");
            drop.setValue(daily.dailyPortionMode);
            drop.onChange(async (v) => {
              const mode: DailyPortionMode = v === 'reading' ? 'reading' : 'audio';
              syncReadingStyleVisibility(mode);
              await saveDaily({ dailyPortionMode: mode });
            });
          });
          syncReadingStyleVisibility(daily.dailyPortionMode);
        }),
      ],
    };

    // ---------- Surahs ----------
    const surahsGroup: SettingDefinitionItem = {
      type: "group",
      heading: "Surahs",
      items: [
        block("Selection summary", (el) => {
          const skippedDesc = el.createEl("p", { cls: "setting-item-description" });
          updateSurahCount = () => {
            const eligible = getSurahsByPart(daily.activePart).filter(s => !daily.skippedSurahs.includes(s.id));
            skippedDesc.setText(`${eligible.length}/${getSurahsByPart(daily.activePart).length} selected`);
          };
          refreshers.surahCount = updateSurahCount;
          updateSurahCount();
        }),
        row("Filter", undefined, (setting) => {
          setting
            .addButton((btn) => btn.setButtonText("All").onClick(async () => { await saveDaily({ skippedSurahs: [] }); }))
            .addButton((btn) => btn.setButtonText("None").onClick(async () => {
              await saveDaily({ skippedSurahs: getSurahsByPart(daily.activePart).map(s => s.id) });
            }));
        }),
        block("Surah selection", (el) => {
          const listContainer = el.createDiv({ cls: "quran-life-daily-surah-list" });
          renderSurahList = () => {
            listContainer.empty();
            const surahs = getSurahsByPart(daily.activePart);
            for (const surah of surahs) {
              const isSelected = !daily.skippedSurahs.includes(surah.id);
              const surahRow = listContainer.createDiv({ cls: "setting-item quran-life-surah-row" });
              surahRow.toggleClass("is-selected", isSelected);
              const cb = surahRow.createEl("input", { type: "checkbox" });
              cb.checked = isSelected;
              cb.addEventListener("change", () => {
                void (async () => {
                  const set = new Set(daily.skippedSurahs);
                  if (cb.checked) set.delete(surah.id);
                  else set.add(surah.id);
                  await saveDaily({ skippedSurahs: Array.from(set) });
                })();
              });
              const label = surahRow.createDiv({ cls: "quran-life-surah-main" });
              label.addEventListener("click", () => cb.click());
              label.createSpan({ cls: "quran-life-surah-name", text: `${surah.id}. ${surah.arabicName}` });
              label.createSpan({ cls: "quran-life-surah-sub", text: ` (${surah.name})` });
              if (isSelected) {
                surahRow.createSpan({ cls: "quran-life-surah-check", text: "✓" });
              }
            }
          };
          refreshers.surahList = renderSurahList;
          renderSurahList();
        }),
      ],
    };

    // ---------- Reset ----------
    const resetGroup: SettingDefinitionItem = {
      type: "group",
      heading: "Reset",
      items: [
        row("Current part", undefined, (setting) => {
          setting.addButton((btn) => btn.setButtonText("Reset").onClick(async () => {
            const confirmed = await confirmAction(this.app, `Reset part ${daily.activePart}?`, "Reset");
            if (!confirmed) return;
            try {
              for (const p of this.progressPathsForPart(daily.activePart)) {
                await this.deleteVaultPath(p);
              }
              new Notice(`Reset part ${daily.activePart}`);
            } catch (e) { new Notice(`Reset failed: ${errorText(e)}`); }
          }));
        }),
        row("All parts", undefined, (setting) => {
          setting.addButton((btn) => btn.setButtonText("Reset all").onClick(async () => {
            btn.buttonEl.addClass("mod-warning");
            const confirmed = await confirmAction(this.app, "Reset all progress?", "Reset all");
            if (!confirmed) return;
            for (let pid = 1; pid <= 8; pid++) {
              for (const p of this.progressPathsForPart(pid)) {
                await this.deleteVaultPath(p);
              }
            }
            new Notice("All reset");
          }));
        }),
      ],
    };

    // ---------- Anki Export — part order + surah-within-part order ----------
    let updateAnkiInfo: () => void = () => {};
    const ankiGroup: SettingDefinitionItem = {
      type: "group",
      heading: "Anki export",
      items: [
        block("Anki export order", (el) => {
          const ankiExportDesc = el.createEl("p", { cls: "setting-item-description quran-life-desc-spaced" });
          ankiExportDesc.setText("New-card `due` order: Meta mindmap first, then parts, then per part: part mindmap (always first) → surah mindmaps → each surah's verse groups chronological (startVerse asc). Only part order and surah-within-part order are configurable. Applies to next Export → .apkg.");
          const ankiPrefsInfo = el.createEl("p", { cls: "setting-item-description quran-life-prefs-info" });
          updateAnkiInfo = () => {
            if (!this.ankiPrefsCache) {
              ankiPrefsInfo.setText("Loading Anki preferences…");
              return;
            }
            ankiPrefsInfo.setText(`partOrder=${ankiPrefs.partOrder} (${ankiPrefs.partOrder === 'asc' ? '1→7' : '7→1'}) • surahOrder=${ankiPrefs.surahOrder} (${ankiPrefs.surahOrder === 'asc' ? 'first→last' : 'last→first'}) • file: ${VAULT_PATHS.ankiExport(this.plugin.vaultStore.root)}`);
          };
          updateAnkiInfo();
        }),
        row("Part order", "1→7 vs 7→1 — which Quran part appears first after Meta", (setting) => {
          setting.addDropdown((drop) => {
            drop.addOption("asc", "asc — Part 1 → Part 7");
            drop.addOption("desc", "desc — Part 7 → Part 1 (default)");
            drop.setValue(ankiPrefs.partOrder);
            drop.onChange(async (v) => {
              ankiPrefs.partOrder = v === 'asc' ? 'asc' : 'desc';
              this.ankiPrefsCache = { ...ankiPrefs };
              await this.plugin.vaultStore.saveAnkiExportPrefs(ankiPrefs);
              updateAnkiInfo();
              new Notice(`Anki export: Part order → ${ankiPrefs.partOrder}`);
            });
          });
          setting.settingEl.addClass("quran-life-anki-row");
        }),
        row("Surah within part order", "first→last vs last→first — controls surah mindmaps order inside each part", (setting) => {
          setting.addDropdown((drop) => {
            drop.addOption("asc", "asc — first surah → last (default)");
            drop.addOption("desc", "desc — last surah → first");
            drop.setValue(ankiPrefs.surahOrder);
            drop.onChange(async (v) => {
              ankiPrefs.surahOrder = v === 'asc' ? 'asc' : 'desc';
              this.ankiPrefsCache = { ...ankiPrefs };
              await this.plugin.vaultStore.saveAnkiExportPrefs(ankiPrefs);
              updateAnkiInfo();
              new Notice(`Anki export: Surah within part → ${ankiPrefs.surahOrder}`);
            });
          });
          setting.settingEl.addClass("quran-life-anki-row");
        }),
        row("Reset Anki export order", "Default: parts desc (7→1), surahs asc (first→last)", (setting) => {
          setting.addButton((btn) => btn.setButtonText("Reset to default").onClick(async () => {
            ankiPrefs.partOrder = DEFAULT_ANKI_EXPORT_PREFS.partOrder;
            ankiPrefs.surahOrder = DEFAULT_ANKI_EXPORT_PREFS.surahOrder;
            this.ankiPrefsCache = { ...ankiPrefs };
            await this.plugin.vaultStore.saveAnkiExportPrefs(ankiPrefs);
            this.rerender();
            new Notice("Anki export order reset to default");
          }));
          setting.settingEl.addClass("quran-life-anki-reset-row");
        }),
      ],
    };

    // ---------- Offline Audio — library manager (one row per Quran part) ----------
    // The old flow was: pick a reciter → pick a part → wait for an async probe → then
    // press a button and hope it acted on that exact pair. The whole library is now laid
    // out as rows (state and actions together), so what a button will do is always visible.
    type OfflineRowRefs = {
      settingEl: HTMLElement;
      descEl: HTMLElement;
      progressWrap: HTMLElement;
      progressFill: HTMLElement;
      progressText: HTMLElement;
      downloadBtn: ButtonComponent;
      cancelBtn: ButtonComponent;
      deleteBtn: ButtonComponent;
    };

    let offlineReciter: Reciter | null = offlineReciters[0] ?? null;
    let playerReciterId = readStored(PLAYER_RECITER_STORAGE_KEY) ?? "";
    try {
      // Prefer the reciter last used for downloads, then the one playback uses.
      const savedDownload = readStored(DOWNLOAD_RECITER_STORAGE_KEY) ?? "";
      const preferred = offlineReciters.find(r => r.id === savedDownload)
        || offlineReciters.find(r => r.id === playerReciterId);
      if (preferred) offlineReciter = preferred;
    } catch { /* keep the first reciter */ }

    let scan: OfflineReciterScan | null = null;
    let isScanning = false;
    // Adopt a download started before this render, if any.
    let activeDownloadPart: QuranPart | null = offlineDownloadInFlight;
    let abortController: AbortController | null = offlineDownloadAbort;
    offlineDownloadSettled = () => {
      activeDownloadPart = null;
      abortController = null;
      void rescan();
    };
    let reciterTotalBytes: number | null = null;
    let sizeTaskToken = 0;
    const sizesByPart = new Map<number, number>();
    const rows = new Map<number, OfflineRowRefs>();
    let storageSetting: Setting | null = null;
    let reciterHintEl: HTMLElement | null = null;
    let activeHintSetting: Setting | null = null;
    let libraryHeader: Setting | null = null;

    // ---- helpers ----
    const partLabel = (partId: QuranPart): string => {
      const opt = ACTIVE_PART_OPTIONS.find(o => o.id === partId);
      if (!opt) return `Part ${partId}`;
      return partId === ALL_QURAN_PART ? `All Quran · ${opt.name}` : `Part ${partId} · ${opt.name}`;
    };
    const partScan = (partId: QuranPart): OfflinePartScan | null =>
      scan?.parts.find(p => p.partId === partId) ?? null;
    const eligibleSurahCount = (partId: QuranPart): number =>
      getSurahsByPart(partId).filter(s => !daily.skippedSurahs.includes(s.id)).length;
    const busyElsewhere = (partId: QuranPart): boolean =>
      activeDownloadPart !== null && activeDownloadPart !== partId;

    const describePart = (partId: QuranPart): string => {
      if (eligibleSurahCount(partId) === 0) return "Every surah here is unselected in Daily Portion — nothing to download";
      const p = partScan(partId);
      if (!p) return isScanning ? "Scanning downloaded files…" : "Not scanned yet";
      const size = sizesByPart.has(partId) ? ` • ${formatBytes(sizesByPart.get(partId) || 0)}` : (p.existingFiles > 0 ? " • measuring size…" : "");
      const skipped = p.skippedFiles > 0 ? ` • ${p.skippedFiles} file${p.skippedFiles === 1 ? "" : "s"} skipped (unselected)` : "";
      if (p.isComplete) return `Complete — ${p.existingFiles}/${p.totalFiles} files on disk${size}${skipped}`;
      if (p.isPartial) return `Partial — ${p.existingFiles}/${p.totalFiles} files${size} • ${p.totalFiles - p.existingFiles} missing${skipped}`;
      return `Not downloaded — ${p.totalFiles} files needed${skipped}`;
    };

    const updateRow = (partId: QuranPart) => {
      const rowRefs = rows.get(partId);
      if (!rowRefs) return;
      const p = partScan(partId);
      const downloadingHere = activeDownloadPart === partId;
      if (!downloadingHere) {
        rowRefs.progressWrap.toggleClass("quran-life-hidden", true);
        rowRefs.descEl.setText(describePart(partId));
      }
      const canDownload = !!offlineReciter && eligibleSurahCount(partId) > 0 && !downloadingHere
        && !busyElsewhere(partId) && !isScanning && !(p?.isComplete ?? false);
      rowRefs.downloadBtn.setDisabled(!canDownload);
      if (downloadingHere) rowRefs.downloadBtn.setButtonText("Downloading…");
      else if (!p || p.existingFiles === 0) rowRefs.downloadBtn.setButtonText("Download");
      else if (p.isComplete) rowRefs.downloadBtn.setButtonText("Downloaded ✓");
      else rowRefs.downloadBtn.setButtonText(`Download ${p.totalFiles - p.existingFiles} missing`);
      rowRefs.deleteBtn.setDisabled(!(p && p.existingFiles > 0) || downloadingHere || busyElsewhere(partId));
      rowRefs.cancelBtn.buttonEl.toggleClass("quran-life-hidden", !downloadingHere);
      rowRefs.cancelBtn.setDisabled(!downloadingHere);
      rowRefs.settingEl.toggleClass("quran-life-offline-row-active", downloadingHere);
      rowRefs.settingEl.toggleClass("quran-life-offline-row-complete", !!p?.isComplete);
    };
    const updateAllRows = () => { rows.forEach((_row, partId) => updateRow(partId as QuranPart)); };

    const showRowProgress = (partId: QuranPart, text: string, progress: OfflineDownloadProgress | null = null) => {
      const rowRefs = rows.get(partId);
      if (!rowRefs) return;
      rowRefs.progressWrap.toggleClass("quran-life-hidden", false);
      const pct = progress ? Math.max(0, Math.min(100, progress.percent)) : 0;
      rowRefs.progressFill.setCssStyles({ width: `${pct}%` });
      const detail = progress
        ? `${pct}% • ${progress.completedFiles}/${progress.totalFiles} files • ${formatBytes(progress.downloadedBytes)}${progress.failedFiles ? ` • ${progress.failedFiles} failed` : ""}`
        : text;
      rowRefs.progressText.setText(detail);
      rowRefs.descEl.setText(detail);
    };

    const updateReciterHint = () => {
      if (!reciterHintEl) return;
      const selected = offlineReciter;
      if (!selected) { reciterHintEl.setText("No reciter available for offline download."); return; }
      const player = offlineReciters.find(r => r.id === playerReciterId) || null;
      if (player && player.id === selected.id) reciterHintEl.setText(`✓ Playback uses ${selected.name}, so these downloads play offline straight away.`);
      else if (player) reciterHintEl.setText(`⚠ Playback currently uses ${player.name}. The downloads below are for ${selected.name} — press “Use in player” to switch, otherwise the player keeps streaming.`);
      else reciterHintEl.setText(`The downloads below are for ${selected.name}. Press “Use in player” so playback uses the same voice offline.`);
    };

    const updateLibraryHeader = () => {
      if (!libraryHeader) return;
      libraryHeader.setName(`Library — ${offlineReciter?.name ?? "—"}`);
      if (!scan) { libraryHeader.setDesc("Scanning downloaded files…"); return; }
      const sizeText = reciterTotalBytes !== null ? `${formatBytes(reciterTotalBytes)} • ` : "";
      libraryHeader.setDesc(`${sizeText}${scan.fileCount} files on disk for this reciter. Each row below acts only on its own part.`);
    };

    const updateActiveHint = () => {
      if (!activeHintSetting) return;
      const partId = daily.activePart;
      const p = partScan(partId);
      const missing = p ? p.totalFiles - p.existingFiles : 0;
      const show = !!scan && !!p && missing > 0 && eligibleSurahCount(partId) > 0 && activeDownloadPart === null;
      activeHintSetting.settingEl.toggleClass("quran-life-hidden", !show);
      if (!show || !p) return;
      activeHintSetting.setName(`Daily Portion plays ${partLabel(partId)} — not fully offline yet`);
      activeHintSetting.setDesc(`${missing} of ${p.totalFiles} files missing${p.existingFiles > 0 ? ` • ${formatBytes(sizesByPart.get(partId) || 0)} already downloaded` : ""}. Download it so today's listening works without a connection.`);
    };

    let refreshStorageInfo: () => void = () => {};
    refreshStorageInfo = () => {
      const setting = storageSetting;
      if (!setting) return;
      setting.setDesc(`Scanning ${offlineRoot}…`);
      void (async () => {
        try {
          const usage = await getTotalOfflineStorageUsage(this.app);
          if (usage.fileCount === 0) setting.setDesc(`No downloads yet • files go to ${offlineRoot}`);
          else setting.setDesc(`${usage.fileCount} files • ${formatBytes(usage.totalBytes)} across all reciters • stored in ${offlineRoot}`);
        } catch { setting.setDesc(`Could not read storage usage • files live in ${offlineRoot}`); }
      })();
    };

    const fillSizes = async (result: OfflineReciterScan, reciterId: string): Promise<void> => {
      const token = ++sizeTaskToken;
      const alive = () => token === sizeTaskToken && myGen === this.displayGeneration && offlineReciter?.id === reciterId;
      try {
        const total = await sumOfflineSizes(result.allFiles, this.app, (partial) => {
          if (!alive()) return;
          reciterTotalBytes = partial;
          updateLibraryHeader();
        });
        if (!alive()) return;
        reciterTotalBytes = total;
        updateLibraryHeader();
        for (const option of ACTIVE_PART_OPTIONS) {
          if (!alive()) return;
          const partId = option.id;
          const files = result.filesByPart[partId] || [];
          if (files.length === 0) { sizesByPart.set(partId, 0); updateRow(partId); continue; }
          const bytes = await sumOfflineSizes(files, this.app, (partial) => {
            if (!alive()) return;
            sizesByPart.set(partId, partial);
            updateRow(partId);
          });
          if (!alive()) return;
          sizesByPart.set(partId, bytes);
          updateRow(partId);
        }
        refreshStorageInfo();
      } catch { /* sizes are cosmetic — the file counts above are already rendered */ }
    };

    const rescan = async (): Promise<void> => {
      const reciter = offlineReciter;
      if (!reciter) return;
      isScanning = true;
      scan = null;
      reciterTotalBytes = null;
      sizesByPart.clear();
      updateAllRows();
      updateActiveHint();
      updateLibraryHeader();
      const result = await scanOfflineAudioForReciter(reciter, this.app, daily.skippedSurahs);
      if (myGen !== this.displayGeneration || offlineReciter?.id !== reciter.id) return;
      isScanning = false;
      scan = result;
      updateAllRows();
      updateActiveHint();
      updateLibraryHeader();
      // A download adopted from an earlier render has no progress callback left here.
      if (activeDownloadPart !== null) showRowProgress(activeDownloadPart, "Download in progress…");
      void fillSizes(result, reciter.id);
    };
    // Daily-portion edits call this on every keystroke/drag, so debounce the rescan.
    let rescanTimer: number | null = null;
    const refreshOfflineStatus = () => {
      if (rescanTimer !== null) window.clearTimeout(rescanTimer);
      rescanTimer = window.setTimeout(() => { rescanTimer = null; void rescan(); }, 400);
    };
    refreshers.offline = refreshOfflineStatus;

    const startDownload = async (partId: QuranPart): Promise<void> => {
      const reciter = offlineReciter;
      if (!reciter) { new Notice("No reciter available for offline download"); return; }
      if (offlineDownloadInFlight !== null) { new Notice("A download is already running"); return; }
      if (eligibleSurahCount(partId) === 0) { new Notice(`Every surah in ${partLabel(partId)} is unselected in Daily Portion — nothing to download`); return; }
      activeDownloadPart = partId;
      abortController = new AbortController();
      offlineDownloadInFlight = partId;
      offlineDownloadAbort = abortController;
      updateAllRows();
      showRowProgress(partId, "Preparing download…");
      try {
        const result = await downloadPartAudio(reciter, partId, this.app, {
          concurrency: 3,
          delayMs: 250,
          signal: abortController.signal,
          skippedSurahIds: daily.skippedSurahs,
          onProgress: (p) => showRowProgress(partId, "Downloading…", p),
        });
        new Notice(`${partLabel(partId)} — ${reciter.name}: ${result.downloadedFiles} new files (${formatBytes(result.totalBytes)} on disk)`);
      } catch (e) {
        const msg = errorText(e);
        if (msg.includes("cancel") || msg.includes("abort")) new Notice("Download cancelled");
        else new Notice(`Download failed: ${msg}`);
      } finally {
        const settle = offlineDownloadSettled;
        offlineDownloadSettled = null;
        offlineDownloadInFlight = null;
        offlineDownloadAbort = null;
        if (settle) settle();
        else { activeDownloadPart = null; abortController = null; await rescan(); }
      }
    };

    const deleteRowPart = async (partId: QuranPart): Promise<void> => {
      const reciter = offlineReciter;
      if (!reciter || activeDownloadPart !== null) { if (activeDownloadPart !== null) new Notice("Cannot delete while a download is running"); return; }
      const p = partScan(partId);
      if (!p || p.existingFiles === 0) return;
      const confirmed = await confirmAction(this.app, `Delete ${p.existingFiles} offline files for ${reciter.name} — ${partLabel(partId)}? Files are removed permanently (no trash), to free storage.`, "Delete", true);
      if (!confirmed) return;
      try {
        const res = await deletePartAudio(reciter.id, partId, this.app);
        new Notice(`Deleted ${res.deletedFiles} files • freed ${formatBytes(res.freedBytes)}`);
        sizesByPart.delete(partId);
        await rescan();
      } catch (e) { new Notice(`Delete failed: ${errorText(e)}`); }
    };

    const deleteReciterAll = async (): Promise<void> => {
      const reciter = offlineReciter;
      if (!reciter) return;
      if (activeDownloadPart !== null) { new Notice("Cannot delete while a download is running"); return; }
      const count = scan?.fileCount ?? 0;
      if (count === 0) { new Notice(`No offline files for ${reciter.name}`); return; }
      const confirmed = await confirmAction(this.app, `Delete ALL ${count} offline files for ${reciter.name}? Files are removed permanently (no trash), to free storage.`, "Delete all", true);
      if (!confirmed) return;
      try {
        const res = await deleteAllOfflineAudioForReciter(reciter.id, this.app);
        new Notice(`Deleted ${res.deletedFiles} files • freed ${formatBytes(res.freedBytes)}`);
        sizesByPart.clear();
        reciterTotalBytes = null;
        await rescan();
      } catch (e) { new Notice(`Delete failed: ${errorText(e)}`); }
    };

    // Deferred offline bootstrap: only runs once a row is actually on screen, so
    // building the definitions for search indexing never kicks off vault scans.
    let offlineInitScheduled = false;
    const scheduleOfflineInit = () => {
      if (offlineInitScheduled) return;
      offlineInitScheduled = true;
      window.setTimeout(() => {
        if (myGen !== this.displayGeneration) return;
        updateAllRows();
        updateLibraryHeader();
        updateActiveHint();
        refreshStorageInfo();
        void rescan();
      }, 0);
    };

    const offlineItems: SettingDefinition[] = [
      block("Offline audio details", (el) => {
        const desc = el.createEl("p", { cls: "setting-item-description quran-life-desc-spaced quran-life-nowrap-safe" });
        desc.setText("Downloaded audio plays without a connection. Files stay inside the plugin folder, so one synced folder (Resilio) covers every device — the player prefers a downloaded file and only streams as a fallback.");
      }),
      row("Storage used", `Scanning ${offlineRoot}…`, (setting) => {
        storageSetting = setting;
        setting.addButton((btn) => btn.setButtonText("Refresh").onClick(() => refreshStorageInfo()));
        scheduleOfflineInit();
      }),
      row("Reciter", "The voice these downloads use.", (setting) => {
        setting.addDropdown((drop) => {
          for (const r of offlineReciters) drop.addOption(r.id, r.name);
          if (offlineReciter) drop.setValue(offlineReciter.id);
          drop.onChange((v) => {
            void (async () => {
              const found = offlineReciters.find(r => r.id === v);
              if (!found || found.id === offlineReciter?.id) return;
              offlineReciter = found;
              writeStored(DOWNLOAD_RECITER_STORAGE_KEY, found.id);
              updateReciterHint();
              if (activeDownloadPart !== null) { new Notice("Switching reciter after the running download finishes"); return; }
              await rescan();
            })();
          });
        });
        setting.addButton((btn) => btn
          .setButtonText("Use in player")
          .setTooltip("Make the Daily Portion player use this reciter")
          .onClick(() => {
            const selected = offlineReciter;
            if (!selected) return;
            playerReciterId = selected.id;
            writeStored(PLAYER_RECITER_STORAGE_KEY, selected.id);
            window.dispatchEvent(new CustomEvent(PLAYER_RECITER_EVENT, { detail: { id: selected.id } }));
            updateReciterHint();
            new Notice(`Player reciter set to ${selected.name}`);
          }));
      }),
      block("Playback note", (el) => {
        reciterHintEl = el.createEl("p", { cls: "setting-item-description quran-life-offline-hint" });
        updateReciterHint();
      }),
      row("Daily Portion part", "Checking…", (setting) => {
        // One-click shortcut when the part the Daily Portion plays isn't downloaded yet.
        activeHintSetting = setting;
        setting.settingEl.addClass("quran-life-offline-active-hint");
        setting.settingEl.addClass("quran-life-hidden");
        setting.addButton((btn) => btn
          .setButtonText("Download now")
          .setCta()
          .onClick(() => { void startDownload(daily.activePart); }));
      }),
      row("Library", "Scanning downloaded files…", (setting) => {
        libraryHeader = setting;
        setting.settingEl.addClass("quran-life-offline-library");
        setting.addButton((btn) => {
          btn.setButtonText("Delete all (reciter)")
            .onClick(() => { void deleteReciterAll(); });
          btn.buttonEl.addClass("mod-warning");
        });
      }),
      ...ACTIVE_PART_OPTIONS.map((option): SettingDefinition => {
        const partId = option.id;
        return row(partLabel(partId), "Scanning…", (setting) => {
          setting.settingEl.addClass("quran-life-offline-row");

          const progressWrap = setting.infoEl.createDiv({ cls: "quran-life-offline-progress quran-life-hidden" });
          const barOuter = progressWrap.createDiv({ cls: "quran-life-offline-bar" });
          const progressFill = barOuter.createDiv({ cls: "quran-life-offline-bar-inner" });
          const progressText = progressWrap.createDiv({ cls: "quran-life-offline-progress-text" });
          progressText.setText("");

          let downloadBtn: ButtonComponent | null = null;
          let cancelBtn: ButtonComponent | null = null;
          let deleteBtn: ButtonComponent | null = null;
          setting.addButton((btn) => { downloadBtn = btn; btn.setButtonText("Download").onClick(() => { void startDownload(partId); }); });
          setting.addButton((btn) => { deleteBtn = btn; btn.setButtonText("Delete").onClick(() => { void deleteRowPart(partId); }); });
          setting.addButton((btn) => {
            cancelBtn = btn;
            btn.setButtonText("Cancel").onClick(() => { (abortController ?? offlineDownloadAbort)?.abort(); new Notice("Cancelling…"); });
            btn.buttonEl.addClass("mod-warning");
          });

          if (downloadBtn && cancelBtn && deleteBtn) {
            rows.set(partId, {
              settingEl: setting.settingEl,
              descEl: setting.descEl,
              progressWrap,
              progressFill,
              progressText,
              downloadBtn,
              cancelBtn,
              deleteBtn,
            });
            updateRow(partId);
          }
        });
      }),
      block("Offline audio notes", (el) => {
        const info = el.createDiv({ cls: "quran-life-offline-footer" });
        info.setText(`Downloads are throttled (3 at a time, 250 ms apart) to stay under the host's rate limits. Files live in ${offlineRoot}/<reciter>/ — one synced folder covers every device.`);
      }),
    ];

    const offlineGroup: SettingDefinitionItem = {
      type: "group",
      heading: "Offline audio",
      items: offlineItems,
    };

    return [storageGroup, dailyGroup, surahsGroup, resetGroup, ankiGroup, offlineGroup];
  }

  /** Candidate locations of a part's progress file, from the current and legacy data roots. */
  private progressPathsForPart(partId: number): string[] {
    const fileName = `daily/progress/part-${partId}.json`;
    return [
      `${this.plugin.vaultStore.root}/${fileName}`,
      `${LEGACY_DATA_ROOT}/${fileName}`,
    ];
  }

  /** Delete a file or directory if it exists, whatever its location. */
  private async deleteVaultPath(path: string): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file) {
        await this.app.fileManager.trashFile(file);
        return;
      }
      if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
    } catch { /* nothing to delete */ }
  }

  /** Re-render the tab after async state (daily settings, Anki prefs) changed. */
  private rerender(): void {
    const updateFn = (this as unknown as { update?: () => void }).update;
    if (typeof updateFn === "function") {
      try { updateFn.call(this); return; } catch { /* tab not registered yet */ }
    }
    try { this.display(); } catch { /* tab not open */ }
  }

  /**
   * Load the async settings the declarative definitions need synchronously, then
   * re-render once they are in. Runs at most once per outstanding request.
   */
  private requestCaches(myGen: number): void {
    if ((this.dailyCache && this.ankiPrefsCache && this.recitersCache) || this.cachesRequested) return;
    this.cachesRequested = true;
    void (async () => {
      try {
        const [dailyRaw, prefsRaw, reciters] = await Promise.all([
          this.plugin.vaultStore.loadSettings<unknown>(null).catch(() => null),
          this.plugin.vaultStore.loadAnkiExportPrefs().catch(() => null),
          getAudioPlayerReciters().catch(() => ALLOWED_RECITERS),
        ]);
        if (myGen !== this.displayGeneration) { this.cachesRequested = false; return; }
        this.dailyCache = parseDaily(dailyRaw);
        this.ankiPrefsCache = normalizeAnkiExportPrefs(prefsRaw ?? DEFAULT_ANKI_EXPORT_PREFS);
        this.recitersCache = reciters.length ? reciters : ALLOWED_RECITERS;
        this.cachesRequested = false;
        this.rerender();
      } catch {
        this.cachesRequested = false;
      }
    })();
  }

  /**
   * Imperative renderer for Obsidian < 1.13: renders the same definitions so the
   * legacy tab and the declarative tab can never drift apart.
   */
  private renderDefinitionItems(container: HTMLElement, items: SettingDefinitionItem[]): void {
    const groupStub = { listEl: container } as unknown as SettingGroup;
    for (const item of items) {
      if ("type" in item) {
        if (item.type === "group" || item.type === "list") {
          if (item.heading) new Setting(container).setName(item.heading).setHeading();
          if (item.items?.length) this.renderDefinitionItems(container, item.items);
        }
        // Pages (and any future typed item) are only rendered by Obsidian 1.13+.
        continue;
      }
      const setting = new Setting(container);
      setting.setName(item.name);
      if (typeof item.desc === "string") setting.setDesc(item.desc);
      if ("render" in item && typeof item.render === "function") {
        item.render(setting, groupStub);
        continue;
      }
      if ("action" in item && typeof item.action === "function") {
        setting.addButton((btn) => btn
          .setButtonText(item.name)
          .onClick(() => { item.action(setting.settingEl, 0); }));
      }
      // `control` definitions are rendered natively by Obsidian 1.13+; nothing to do here.
    }
  }
}
