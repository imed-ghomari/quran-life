import { App, ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinition, SettingDefinitionItem, SettingGroup } from "obsidian";
import QuranLifePlugin from "./main";
import { ACTIVE_PART_OPTIONS, ALL_QURAN_PART, QuranPart } from "@/lib/types";
import type { PlaybackSpeed } from "@/lib/types";
import { getSurahsByPart } from "@/lib/quranData";
import { clampDailyTargetMinutes, DEFAULT_DAILY_TARGET_MINUTES, estimateEligibleCycleDays, estimateSurahDurationMinutes, getEligibleVerseCount } from "@/lib/dailyPortionUtils";
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

// Playback speed shared with the audio player (see AudioPlayerLocal). The player
// stores its speed in vault-scoped local storage and divides measured durations
// by it (totalDurationSec = sum / speed). Settings mirrors that here so the
// daily-target estimate follows the same speed.
const SPEED_STORAGE_KEY = "audio_playback_speed";
const PLAYBACK_SPEED_EVENT = "quran-life:playback-speed-changed";
const SPEED_OPTIONS: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1;

function isValidPlaybackSpeed(v: unknown): v is PlaybackSpeed {
  return typeof v === "number" && (SPEED_OPTIONS as number[]).includes(v);
}

function normalizePlaybackSpeed(v: unknown): PlaybackSpeed {
  const n = Number(v);
  if (isValidPlaybackSpeed(n)) return n;
  // Existing users may already have a speed picked in the player.
  try {
    const stored = Number(readStored(SPEED_STORAGE_KEY));
    if (isValidPlaybackSpeed(stored)) return stored;
  } catch { /* storage unavailable — fall through to default */ }
  return DEFAULT_PLAYBACK_SPEED;
}

function persistPlaybackSpeed(speed: PlaybackSpeed): void {
  try { writeStored(SPEED_STORAGE_KEY, String(speed)); } catch { /* best-effort */ }
  try { window.dispatchEvent(new CustomEvent(PLAYBACK_SPEED_EVENT, { detail: { speed } })); } catch { /* no listeners */ }
}

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

/**
 * Trigger a browser download so the user gets a native save picker instead of
 * a silent write. No-op where downloads don't exist (Obsidian mobile) — the
 * vault copy saved alongside is the fallback there.
 */
function downloadTextFile(fileName: string, text: string): void {
  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      try { URL.revokeObjectURL(url); a.remove(); } catch { /* already cleaned up */ }
    }, 1000);
  } catch { /* vault copy already saved — download is best-effort */ }
}

type DailyPortionMode = 'audio' | 'reading';
type DailyReadingStyle = 'line_by_line' | 'paragraph';
interface DailySettings {
  activePart: QuranPart;
  dailyTargetMinutes: number;
  dailyPortionMode: DailyPortionMode;
  dailyReadingStyle: DailyReadingStyle;
  dailyPlaybackSpeed: PlaybackSpeed;
  skippedSurahs: number[];
}

const DEFAULT_DAILY: DailySettings = {
  activePart: ALL_QURAN_PART,
  dailyTargetMinutes: DEFAULT_DAILY_TARGET_MINUTES,
  dailyPortionMode: 'audio',
  dailyReadingStyle: 'paragraph',
  dailyPlaybackSpeed: DEFAULT_PLAYBACK_SPEED,
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
  if (!record) return { ...DEFAULT_DAILY, dailyPlaybackSpeed: normalizePlaybackSpeed(undefined) };
  return {
    activePart: isValidQuranPart(record.activePart) ? record.activePart : DEFAULT_DAILY.activePart,
    dailyTargetMinutes: Number.isFinite(Number(record.dailyTargetMinutes)) ? clampDailyTargetMinutes(Number(record.dailyTargetMinutes)) : DEFAULT_DAILY.dailyTargetMinutes,
    dailyPortionMode: record.dailyPortionMode === 'reading' ? 'reading' : 'audio',
    dailyReadingStyle: record.dailyReadingStyle === 'line_by_line' ? 'line_by_line' : 'paragraph',
    dailyPlaybackSpeed: normalizePlaybackSpeed(record.dailyPlaybackSpeed),
    skippedSurahs: normalizeSkipped(record.skippedSurahs),
  };
}

/**
 * Daily-target estimate that follows the recitation speed exactly like the
 * audio player does (totalDurationSec = sum / speed). Reading mode ignores speed.
 */
function describeDailyTarget(
  activePart: QuranPart,
  skippedSurahs: number[],
  targetMinutes: number,
  mode: DailyPortionMode,
  speed: PlaybackSpeed,
): string {
  const eligible = getSurahsByPart(activePart).filter(s => !skippedSurahs.includes(s.id));
  if (eligible.length === 0) {
    return `${targetMinutes} min • no surahs selected`;
  }
  const totalVerses = getEligibleVerseCount(eligible);
  const totalMinutesAt1x = eligible.reduce((total, surah) => (
    total + estimateSurahDurationMinutes(surah.id, mode)
  ), 0);
  // Keep in sync with estimateEligibleCycleDays fallback (no timing metadata in settings).
  const fallbackDays = estimateEligibleCycleDays(eligible, targetMinutes, mode);
  let days: number;
  if (mode === 'audio' && speed !== 1 && totalMinutesAt1x > 0) {
    const effectiveTotal = totalMinutesAt1x / speed;
    days = Math.max(1, Math.ceil(effectiveTotal / targetMinutes));
  } else {
    days = fallbackDays;
  }
  const versesPerDay = totalVerses && days ? Math.ceil(totalVerses / days) : 0;
  const modeLabel = mode === 'audio' ? 'Listening' : 'Reading';
  if (mode === 'audio') {
    return `${targetMinutes} min • ~${versesPerDay} verses/day • ~${days} days • ${totalVerses} verses in scope • ${modeLabel} @${speed}x`;
  }
  return `${targetMinutes} min • ~${versesPerDay} verses/day • ~${days} days • ${totalVerses} verses in scope • ${modeLabel}`;
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
    const offlineReciters: Reciter[] = this.recitersCache ?? ALLOWED_RECITERS;
    const ankiPrefs: AnkiExportPrefs = this.ankiPrefsCache ?? { ...DEFAULT_ANKI_EXPORT_PREFS };
    let daily: DailySettings = this.dailyCache
      ? { ...this.dailyCache, dailyPlaybackSpeed: normalizePlaybackSpeed(this.dailyCache.dailyPlaybackSpeed) }
      : { ...DEFAULT_DAILY, dailyPlaybackSpeed: normalizePlaybackSpeed(undefined) };

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
      if (patch.dailyPlaybackSpeed !== undefined) daily.dailyPlaybackSpeed = normalizePlaybackSpeed(patch.dailyPlaybackSpeed);
      if (patch.activePart !== undefined && !isValidQuranPart(patch.activePart)) {
        daily.activePart = parseDaily(await this.plugin.vaultStore.loadSettings<unknown>(null)).activePart;
      }
      this.dailyCache = { ...daily };
      if (patch.dailyPlaybackSpeed !== undefined) persistPlaybackSpeed(daily.dailyPlaybackSpeed);
      const payload = { ...daily, updatedAt: new Date().toISOString() };
      await this.plugin.vaultStore.saveSettings(payload);
      try { window.dispatchEvent(new CustomEvent('quran-life:daily-settings-changed')); } catch { /* no listeners */ }
      try { refreshers.surahList?.(); } catch { /* list not rendered yet */ }
      try { refreshers.surahCount?.(); } catch { /* heading not rendered yet */ }
      try { refreshers.minutesDesc?.(); } catch { /* slider not rendered yet */ }
      try { refreshers.offline?.(); } catch { /* offline section not rendered yet */ }
    };

    // ---------- Backup & restore (top-right, no section) ----------
    // Saves are automatic — every change is written to the vault straight away.
    // These two buttons are the only manual controls, so they sit at the top
    // right of the tab instead of in their own section.
    const backupActions: SettingDefinitionItem = block("Backup and restore", (el) => {
      el.addClass("quran-life-backup-actions");
      el.setCssStyles({ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "4px 0 8px" });
      const backupBtn = el.createEl("button", { text: "Backup now", cls: "mod-cta" });
      const restoreBtn = el.createEl("button", { text: "Restore backup" });
      const fileInput = el.createEl("input", { type: "file" });
      fileInput.accept = "application/json,.json";
      fileInput.addClass("quran-life-hidden");
      fileInput.setCssStyles({ display: "none" });
      backupBtn.addEventListener("click", () => {
        void (async () => {
          backupBtn.disabled = true;
          try {
            const { path, fileName, text } = await this.plugin.createBackup();
            // Native save picker on desktop; the vault copy is the mobile fallback.
            downloadTextFile(fileName, text);
            new Notice(`Backup downloaded + saved: ${path}`);
          } catch (e) {
            new Notice(`Backup failed: ${errorText(e)}`);
          } finally {
            backupBtn.disabled = false;
          }
        })();
      });
      restoreBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        void (async () => {
          restoreBtn.disabled = true;
          try {
            const text = await file.text();
            const json: unknown = JSON.parse(text);
            const res = await this.plugin.restoreBackup(json);
            this.dailyCache = null;
            this.ankiPrefsCache = null;
            this.cachesRequested = false;
            this.rerender();
            new Notice(`Restored ${res.splits} splits, ${res.mindmaps} mindmaps, ${res.docs} docs`);
          } catch (e) {
            new Notice(`Restore failed: ${errorText(e)}`);
          } finally {
            restoreBtn.disabled = false;
            fileInput.value = "";
          }
        })();
      });
    });

    // ---------- Daily portion (part + target + mode + surahs + reset) ----------
    let updateMinutesDesc: () => void = () => {};
    let renderSurahList: () => void = () => {};
    let updateSurahCount: () => void = () => {};

    /** Subheading inside the Daily portion group (groups can't nest, so a block draws the heading). */
    const subheading = (name: string, desc?: string): SettingDefinition =>
      block(name, (el) => {
        const h = el.createEl("h6", { text: name });
        h.setCssStyles({ margin: "10px 0 0", fontSize: "1em", fontWeight: "700" });
        if (desc) el.createEl("p", { text: desc, cls: "setting-item-description" });
      });
    let readingStyleEl: HTMLElement | null = null;
    let recitationSpeedEl: HTMLElement | null = null;
    const syncReadingStyleVisibility = (mode: DailyPortionMode): void => {
      readingStyleEl?.toggleClass("quran-life-hidden", mode !== 'reading');
    };
    const syncRecitationSpeedVisibility = (mode: DailyPortionMode): void => {
      recitationSpeedEl?.toggleClass("quran-life-hidden", mode !== 'audio');
    };
    const syncModeDependentRows = (mode: DailyPortionMode): void => {
      syncReadingStyleVisibility(mode);
      syncRecitationSpeedVisibility(mode);
    };

    const minutesRow: SettingDefinitionItem = row("Daily target", `${daily.dailyTargetMinutes} min`, (setting) => {
      updateMinutesDesc = () => {
        setting.setDesc(describeDailyTarget(
          daily.activePart,
          daily.skippedSurahs,
          daily.dailyTargetMinutes,
          daily.dailyPortionMode,
          daily.dailyPlaybackSpeed,
        ));
      };
      refreshers.minutesDesc = updateMinutesDesc;
      updateMinutesDesc();
      setting.addSlider((slider) => {
        slider.setLimits(5, 180, 5);
        slider.setValue(daily.dailyTargetMinutes);
        slider.setDynamicTooltip();
        slider.onChange(async (v) => {
          daily.dailyTargetMinutes = clampDailyTargetMinutes(v);
          updateMinutesDesc();
          await saveDaily({ dailyTargetMinutes: v });
          updateMinutesDesc();
        });
      });
    });

    // Surah selection lives inside Daily portion (it scopes the portion).
    const surahItems: SettingDefinition[] = [
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
    ];

    // Progress reset lives inside Daily portion (it resets the portion progress).
    const resetItems: SettingDefinition[] = [
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
    ];

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
        row("Mode", "Listening follows the recitation speed below; Reading uses a fixed pace.", (setting) => {
          setting.addDropdown((drop) => {
            drop.addOption("audio", "Listening");
            drop.addOption("reading", "Reading");
            drop.setValue(daily.dailyPortionMode);
            drop.onChange(async (v) => {
              const mode: DailyPortionMode = v === 'reading' ? 'reading' : 'audio';
              syncModeDependentRows(mode);
              await saveDaily({ dailyPortionMode: mode });
              updateMinutesDesc();
            });
          });
          syncModeDependentRows(daily.dailyPortionMode);
        }),
        row("Recitation speed", "Default listening speed. The daily target estimate follows it like the player does (faster = more verses per day).", (setting) => {
          recitationSpeedEl = setting.settingEl;
          setting.addDropdown((drop) => {
            for (const s of SPEED_OPTIONS) drop.addOption(String(s), `${s}x`);
            drop.setValue(String(daily.dailyPlaybackSpeed));
            drop.onChange(async (v) => {
              const speed = normalizePlaybackSpeed(Number(v));
              daily.dailyPlaybackSpeed = speed;
              updateMinutesDesc();
              await saveDaily({ dailyPlaybackSpeed: speed });
              updateMinutesDesc();
              // Keep the dropdown in sync when the stored player speed wins normalization.
              try { drop.setValue(String(daily.dailyPlaybackSpeed)); } catch { /* already set */ }
            });
          });
          syncModeDependentRows(daily.dailyPortionMode);
        }),
        row("Reading style", undefined, (setting) => {
          readingStyleEl = setting.settingEl;
          setting.addDropdown((drop) => {
            drop.addOption("paragraph", "Paragraph");
            drop.addOption("line_by_line", "Line by line");
            drop.setValue(daily.dailyReadingStyle);
            drop.onChange(async (v) => { await saveDaily({ dailyReadingStyle: v === 'line_by_line' ? 'line_by_line' : 'paragraph' }); });
          });
          syncModeDependentRows(daily.dailyPortionMode);
        }),
        subheading("Surahs", "Which surahs of this part are in scope for the daily portion."),
        ...surahItems,
        subheading("Reset", "Clear listening progress for this part or for all parts."),
        ...resetItems,
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
        desc.setText("Downloaded audio plays without a connection. Files stay inside the plugin folder, so your synced vault covers every device — the player prefers a downloaded file and only streams as a fallback.");
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
        info.setText(`Downloads are throttled (3 at a time, 250 ms apart) to stay under the host's rate limits. Files live in ${offlineRoot}/<reciter>/ — your synced vault covers every device.`);
      }),
    ];

    const offlineGroup: SettingDefinitionItem = {
      type: "group",
      heading: "Offline audio",
      items: offlineItems,
    };

    return [backupActions, ankiGroup, dailyGroup, offlineGroup];
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
