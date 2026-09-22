import { App, PluginSettingTab, Setting, Notice, Platform } from "obsidian";
import QuranLifePlugin from "./main";
import { ACTIVE_PART_OPTIONS, ALL_QURAN_PART, QuranPart } from "@/lib/types";
import { SURAHS, getSurahsByPart } from "@/lib/quranData";
import { clampDailyTargetMinutes, DEFAULT_DAILY_TARGET_MINUTES, estimateEligibleCycleDays, getEligibleVerseCount } from "@/lib/dailyPortionUtils";
import { ALLOWED_RECITERS, getAudioPlayerReciters, Reciter } from "@/lib/audio";
import {
  getTotalOfflineStorageUsage,
  downloadPartAudio,
  deletePartAudio,
  deleteAllOfflineAudioForReciter,
  scanOfflineAudioForReciter,
  sumOfflineSizes,
  formatBytes,
  OFFLINE_AUDIO_ROOT,
} from "./offlineAudio";
import type { OfflineDownloadProgress, OfflinePartScan, OfflineReciterScan } from "./offlineAudio";

// Keys shared with the player (see AudioPlayerLocal) so the settings tab can tell
// the user which reciter playback actually uses, and switch it in one click.
const PLAYER_RECITER_STORAGE_KEY = "selected_reciter_id";
const DOWNLOAD_RECITER_STORAGE_KEY = "offline_download_reciter_id";
const PLAYER_RECITER_EVENT = "quran-life:player-reciter-changed";

// One offline download at a time, tracked at module scope: `display()` re-runs
// whenever any related setting changes, and the re-rendered tabs must still see the
// running download (to show its state, block a second one and offer Cancel).
let offlineDownloadInFlight: QuranPart | null = null;
let offlineDownloadAbort: AbortController | null = null;
let offlineDownloadSettled: (() => void) | null = null;

export interface QuranLifePluginSettings {
  dataRoot: string;
  autoSyncDebounceMs: number;
}

export const DEFAULT_SETTINGS: QuranLifePluginSettings = {
  dataRoot: ".obsidian/plugins/quran-life/data",
  autoSyncDebounceMs: 700,
};
function getDefaultDataRootForPlatform(): string {
  try { if ((Platform as any)?.isMobile) return "QuranLife"; } catch {}
  return ".obsidian/plugins/quran-life/data";
}

// ---------- settings UI styles (mobile-first, overflow-proof) ----------
// Obsidian settings rows are `display:flex` with the control pushed right; on a
// phone the control block (4 offline-audio buttons, long storage paths, dropdowns)
// runs past the screen edge. These rules wrap controls, stack rows on narrow
// screens and let long unbroken paths (folder names) wrap.
const SETTINGS_STYLE_ID = 'quran-life-settings-mobile-styles';
let settingsStylesInjected = false;
function injectSettingsMobileStyles(): void {
  try {
    if (typeof document === 'undefined') return;
    if (document.getElementById(SETTINGS_STYLE_ID)) { settingsStylesInjected = true; return; }
    const style = document.createElement('style');
    style.id = SETTINGS_STYLE_ID;
    style.textContent = `
/* Desktop-neutral safety: never let a long unbroken path (folder names) push the
   settings pane sideways. Layout rules live in the mobile query below so the
   desktop settings layout is left exactly as Obsidian renders it. */
.quran-life-settings .setting-item-info { min-width: 0; overflow-wrap: anywhere; }
.quran-life-settings .quran-life-settings-anki div { min-width: 0; }
.quran-life-settings .quran-life-daily-surah-list { grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)) !important; }
.quran-life-settings .quran-life-nowrap-safe { overflow-wrap: anywhere; word-break: break-word; }

/* Offline audio library: one row per Quran part, each with its own state + actions. */
.quran-life-settings .quran-life-offline-rows { display: flex; flex-direction: column; margin-top: 4px; }
.quran-life-settings .quran-life-offline-row { border-top: 1px solid var(--background-modifier-border); padding: 8px 4px; }
.quran-life-settings .quran-life-offline-row .setting-item-name { overflow-wrap: anywhere; }
.quran-life-settings .quran-life-offline-row-active { background: var(--background-secondary); border-radius: 6px; }
.quran-life-settings .quran-life-offline-row-complete .setting-item-name::after { content: " ✓"; color: var(--text-success, var(--interactive-accent)); }
.quran-life-settings .quran-life-offline-bar { width: 100%; height: 8px; margin-top: 6px; background: var(--background-modifier-border); border-radius: 999px; overflow: hidden; }
.quran-life-settings .quran-life-offline-bar-inner { height: 100%; background: var(--interactive-accent); border-radius: 999px; transition: width 0.25s ease; }
.quran-life-settings .quran-life-offline-progress-text,
.quran-life-settings .quran-life-offline-hint { font-size: 0.78em; color: var(--text-muted); overflow-wrap: anywhere; }
.quran-life-settings .quran-life-offline-footer { font-size: 0.75em; color: var(--text-faint); margin-top: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.quran-life-settings .quran-life-offline-active-hint { border: 1px solid var(--interactive-accent); border-radius: 8px; padding: 4px 10px; margin: 8px 0; }
@media (max-width: 700px) {
  .quran-life-settings, .quran-life-settings * { box-sizing: border-box; }
  .quran-life-settings .setting-item { flex-wrap: wrap; row-gap: 6px; flex-direction: column; align-items: stretch; }
  .quran-life-settings .setting-item-control { flex-wrap: wrap; gap: 6px; max-width: 100%; justify-content: flex-start; }
  .quran-life-settings .setting-item-control > * { flex: 1 1 auto; }
  .quran-life-settings .setting-item-control button { width: 100%; min-height: 32px; }
  .quran-life-settings .quran-life-offline-row { padding: 10px 4px; }
  .quran-life-settings .quran-life-offline-row .setting-item-name { font-weight: 600; }
  .quran-life-settings .quran-life-offline-row .setting-item-control > button,
  .quran-life-settings .quran-life-offline-library .setting-item-control > button,
  .quran-life-settings .quran-life-offline-active-hint .setting-item-control > button { width: 100%; }
  .quran-life-settings .quran-life-daily-surah-list { grid-template-columns: 1fr !important; max-height: 340px !important; }
  .quran-life-settings .importer-progress-bar { height: 10px; }
}
`;
    document.head.appendChild(style);
    settingsStylesInjected = true;
  } catch { /* styles are cosmetic; never block settings rendering */ }
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
  v.forEach(x => {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 1 && n <= 114) s.add(n);
  });
  return Array.from(s).sort((a,b)=>a-b);
}
function parseDaily(raw: any): DailySettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DAILY };
  return {
    activePart: isValidQuranPart(raw.activePart) ? raw.activePart as QuranPart : DEFAULT_DAILY.activePart,
    dailyTargetMinutes: Number.isFinite(Number(raw.dailyTargetMinutes)) ? clampDailyTargetMinutes(Number(raw.dailyTargetMinutes)) : DEFAULT_DAILY.dailyTargetMinutes,
    dailyPortionMode: raw.dailyPortionMode === 'reading' ? 'reading' : 'audio',
    dailyReadingStyle: raw.dailyReadingStyle === 'line_by_line' ? 'line_by_line' : 'paragraph',
    skippedSurahs: normalizeSkipped(raw.skippedSurahs),
  };
}

export class QuranLifeSettingTab extends PluginSettingTab {
  plugin: QuranLifePlugin;
  private displayGeneration = 0;
  constructor(app: App, plugin: QuranLifePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const myGen = ++this.displayGeneration;
    const { containerEl } = this;
    containerEl.empty();
    if (!settingsStylesInjected) injectSettingsMobileStyles();
    containerEl.addClass("quran-life-settings");

    containerEl.createEl("h2", { text: "Storage & Sync" });

    const platformDefault = getDefaultDataRootForPlatform();
    const isMobile = (()=>{ try{ return !!(Platform as any)?.isMobile; }catch{return false;}})();
    new Setting(containerEl)
      .setName("Data folder")
      .setDesc(isMobile ? "Resilio-synced folder. On mobile defaults to QuranLife (visible); desktop uses .obsidian/plugins/quran-life/data (one folder sync)" : "Resilio-synced folder. Default: .obsidian/plugins/quran-life/data")
      .addText((text) =>
        text
          .setPlaceholder(platformDefault)
          .setValue(this.plugin.settings.dataRoot)
          .onChange(async (value) => {
            const normalized = value.trim().replace(/^\/+|\/+$/g, "") || platformDefault;
            this.plugin.settings.dataRoot = normalized;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Autobackup")
      .setDesc("Keep on for instant saves.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSyncDebounceMs > 0)
          .onChange(async (value) => {
            this.plugin.settings.autoSyncDebounceMs = value ? 700 : 0;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Migrate legacy backup")
      .setDesc("Import legacy JSON backup.")
      .addButton((btn) =>
        btn.setButtonText("Migrate").onClick(async () => {
          const cmd = (this.app as any).commands?.commands?.["quran-life:migrate-legacy-backup"];
          if (cmd) {
            await (this as any).app.commands.executeCommandById("quran-life:migrate-legacy-backup");
          }
        })
      );

    // Daily Portion — guard against async race that appends duplicate UI on rapid re-display (mobile/settings navigation)
    let daily: DailySettings = { ...DEFAULT_DAILY };
    try {
      const raw = await this.plugin.vaultStore.loadSettings<any>(null as any);
      // If a newer display() started while we were awaiting, abort — the newer one will render alone
      if (myGen !== this.displayGeneration) return;
      daily = parseDaily(raw);
    } catch {
      if (myGen !== this.displayGeneration) return;
    }
    if (myGen !== this.displayGeneration) return;
    // Create header only after validated generation — ensures it appears once
    containerEl.createEl("h2", { text: "Daily Portion" });
    let updateMinutesDesc: () => void = () => {};
    let renderSurahList: () => void = () => {};
    let updateExtraDesc: () => void = () => {};
    let refreshOfflineStatus: () => void = () => {};

    const saveDaily = async (patch: Partial<DailySettings>) => {
      daily = { ...daily, ...patch } as DailySettings;
      if (patch.skippedSurahs !== undefined) daily.skippedSurahs = normalizeSkipped(patch.skippedSurahs);
      if (patch.dailyTargetMinutes !== undefined) daily.dailyTargetMinutes = clampDailyTargetMinutes(Number(patch.dailyTargetMinutes));
      if (patch.activePart !== undefined && !isValidQuranPart(patch.activePart)) daily.activePart = parseDaily(await this.plugin.vaultStore.loadSettings<any>(null as any)).activePart;
      const payload: any = { ...daily, updatedAt: new Date().toISOString() };
      await this.plugin.vaultStore.saveSettings(payload);
      try { window.dispatchEvent(new CustomEvent('quran-life:daily-settings-changed')); } catch {}
      try { renderSurahList(); } catch {}
      try { updateExtraDesc(); } catch {}
      try { updateMinutesDesc(); } catch {}
      try { refreshOfflineStatus(); } catch {}
    };

    new Setting(containerEl)
      .setName("Part")
      .setDesc("Qur'an part")
      .addDropdown(drop => {
        ACTIVE_PART_OPTIONS.forEach(opt => drop.addOption(String(opt.id), `${opt.name}`));
        drop.setValue(String(daily.activePart));
        drop.onChange(async v => { await saveDaily({ activePart: Number(v) as QuranPart }); updateMinutesDesc(); });
      });

    const minutesSetting = new Setting(containerEl)
      .setName("Daily target");
    updateMinutesDesc = () => {
      const eligible = getSurahsByPart(daily.activePart).filter(s => !daily.skippedSurahs.includes(s.id));
      const totalVerses = getEligibleVerseCount(eligible);
      const days = estimateEligibleCycleDays(eligible, daily.dailyTargetMinutes, daily.dailyPortionMode);
      const versesPerDay = totalVerses && days ? Math.ceil(totalVerses / days) : 0;
      if (eligible.length === 0) {
        minutesSetting.setDesc(`${daily.dailyTargetMinutes} min • no surahs selected`);
      } else {
        minutesSetting.setDesc(`${daily.dailyTargetMinutes} min • ~${versesPerDay} verses/day • ~${days} days • ${totalVerses} verses in scope • ${daily.dailyPortionMode === 'audio' ? 'Listening' : 'Reading'}`);
      }
    };
    updateMinutesDesc();
    minutesSetting.addSlider(slider => {
      slider.setLimits(5, 180, 5);
      slider.setValue(daily.dailyTargetMinutes);
      slider.setDynamicTooltip();
      slider.onChange(async v => {
        daily.dailyTargetMinutes = clampDailyTargetMinutes(v);
        updateMinutesDesc();
        await saveDaily({ dailyTargetMinutes: v });
        updateMinutesDesc();
      });
    });

    const modeSetting = new Setting(containerEl)
      .setName("Mode")
      .addDropdown(drop => {
        drop.addOption("audio", "Listening");
        drop.addOption("reading", "Reading");
        drop.setValue(daily.dailyPortionMode);
        drop.onChange(async v => {
          await saveDaily({ dailyPortionMode: v as DailyPortionMode });
          if (readingStyleSetting) {
            (readingStyleSetting as any).settingEl.style.display = v === 'reading' ? '' : 'none';
          }
        });
      });
    let readingStyleSetting: Setting | null = null;
    readingStyleSetting = new Setting(containerEl)
      .setName("Reading style")
      .addDropdown(drop => {
        drop.addOption("paragraph", "Paragraph");
        drop.addOption("line_by_line", "Line by line");
        drop.setValue(daily.dailyReadingStyle);
        drop.onChange(async v => { await saveDaily({ dailyReadingStyle: v as DailyReadingStyle }); });
      });
    (readingStyleSetting as any).settingEl.style.display = daily.dailyPortionMode === 'reading' ? '' : 'none';

    containerEl.createEl("h3", { text: "Surahs" });
    const skippedDesc = containerEl.createEl("p", { cls: "setting-item-description" });
    updateExtraDesc = () => {
      const eligible = getSurahsByPart(daily.activePart).filter(s => !daily.skippedSurahs.includes(s.id));
      skippedDesc.setText(`${eligible.length}/${getSurahsByPart(daily.activePart).length} selected`);
    };
    updateExtraDesc();

    const surahListHeader = new Setting(containerEl)
      .setName("Filter")
      .addButton(btn => btn.setButtonText("All").onClick(async () => { await saveDaily({ skippedSurahs: [] }); }))
      .addButton(btn => btn.setButtonText("None").onClick(async () => {
      await saveDaily({ skippedSurahs: getSurahsByPart(daily.activePart).map(s => s.id) });
    }));

    const listContainer = containerEl.createDiv({ cls: "quran-life-daily-surah-list" });
    listContainer.style.maxHeight = "280px";
    listContainer.style.overflowY = "auto";
    listContainer.style.border = "1px solid var(--background-modifier-border)";
    listContainer.style.borderRadius = "8px";
    listContainer.style.padding = "8px";
    listContainer.style.display = "grid";
    listContainer.style.gridTemplateColumns = "repeat(auto-fill, minmax(min(220px, 100%), 1fr))";
    listContainer.style.gap = "4px";
    listContainer.style.background = "var(--background-primary)";

    renderSurahList = () => {
      listContainer.empty();
      const surahs = getSurahsByPart(daily.activePart);
      for (const surah of surahs) {
        const isSkipped = daily.skippedSurahs.includes(surah.id);
        const isSelected = !isSkipped;
        const row = listContainer.createDiv({ cls: "setting-item" });
        row.style.padding = "6px 8px";
        row.style.border = "1px solid var(--background-modifier-border)";
        row.style.borderRadius = "6px";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.background = isSelected ? "var(--background-secondary)" : "var(--background-primary)";
        row.style.opacity = isSelected ? "1" : "0.65";
        const cb = row.createEl("input", { type: "checkbox" });
        cb.checked = isSelected;
        cb.style.accentColor = "var(--interactive-accent)";
        cb.addEventListener("change", async () => {
          const set = new Set(daily.skippedSurahs);
          if (cb.checked) set.delete(surah.id);
          else set.add(surah.id);
          await saveDaily({ skippedSurahs: Array.from(set) });
        });
        const label = row.createDiv();
        label.style.flex = "1";
        label.style.minWidth = "0";
        label.style.cursor = "pointer";
        label.addEventListener("click", () => cb.click());
        const title = label.createSpan({ text: `${surah.id}. ${surah.arabicName}` });
        title.style.fontWeight = "600";
        title.style.fontSize = "0.85em";
        const sub = label.createSpan({ text: ` (${surah.name})` });
        sub.style.fontSize = "0.75em";
        sub.style.color = "var(--text-muted)";
        sub.style.marginLeft = "4px";
        if (isSelected) {
          const check = row.createSpan({ text: "✓" });
          check.style.color = "var(--interactive-accent)";
          check.style.fontWeight = "700";
        }
      }
    };
    renderSurahList();

    containerEl.createEl("h3", { text: "Reset" });
    new Setting(containerEl)
      .setName("Current part")
      .addButton(btn => btn.setButtonText("Reset").onClick(async () => {
        try { if (typeof confirm === 'function' && !confirm(`Reset part ${daily.activePart}?`)) return; } catch { /* mobile WebView may not support confirm — allow */ }
        try {
          const paths = [
            `.obsidian/plugins/quran-life/data/daily/progress/part-${daily.activePart}.json`,
            `QuranLife/daily/progress/part-${daily.activePart}.json`,
            `${this.plugin.vaultStore.root}/daily/progress/part-${daily.activePart}.json`,
          ];
          for (const p of paths) {
            try {
              const file = this.app.vault.getAbstractFileByPath(p);
              if (file) await this.app.vault.delete(file as any);
            } catch{}
            try {
              const adapter: any = this.app.vault.adapter;
              if (adapter?.exists && await adapter.exists(p)) await adapter.remove(p);
            } catch{}
          }
          new Notice(`Reset part ${daily.activePart}`);
        } catch (e:any) { new Notice(`Reset failed: ${e?.message||e}`); }
      }));
    new Setting(containerEl)
      .setName("All parts")
      .addButton(btn => btn.setButtonText("Reset all").setWarning().onClick(async () => {
        try { if (typeof confirm === 'function' && !confirm("Reset all progress?")) return; } catch {}
        for (let pid=1; pid<=8; pid++) {
          const paths = [
            `.obsidian/plugins/quran-life/data/daily/progress/part-${pid}.json`,
            `QuranLife/daily/progress/part-${pid}.json`,
            `${this.plugin.vaultStore.root}/daily/progress/part-${pid}.json`,
          ];
          for (const p of paths) {
            try { const file = this.app.vault.getAbstractFileByPath(p); if (file) await this.app.vault.delete(file as any); } catch{}
            try { const adapter: any = this.app.vault.adapter; if (adapter?.exists && await adapter.exists(p)) await adapter.remove(p); } catch{}
          }
        }
        new Notice("All reset");
      }));

    // ---------- Anki Export — part order + surah-within-part order ----------
    // Wrap in a dedicated section so async-added rows (including Reset) stay under this heading and not under Offline Audio
    const ankiSection = containerEl.createDiv({ cls: "quran-life-settings-anki" });
    ankiSection.createEl("h2", { text: "Anki Export" });
    const ankiExportDesc = ankiSection.createEl("p", { cls: "setting-item-description" });
    ankiExportDesc.setText("New-card `due` order: Meta mindmap first, then parts, then per part: part mindmap (always first) → surah mindmaps → each surah's verse groups chronological (startVerse asc). Only part order and surah-within-part order are configurable. Applies to next Export → .apkg.");
    ankiExportDesc.style.marginBottom = "10px";
    const ankiPrefsInfo = ankiSection.createEl("p", { cls: "setting-item-description" });
    ankiPrefsInfo.style.fontSize = "0.78em";
    ankiPrefsInfo.style.color = "var(--text-faint)";
    ankiPrefsInfo.style.overflowWrap = "anywhere";
    ankiPrefsInfo.setText("Loading Anki preferences…");
    const ankiRowsWrap = ankiSection.createDiv();
    ankiRowsWrap.style.display = "grid";
    ankiRowsWrap.style.gridTemplateColumns = "repeat(auto-fill, minmax(min(280px, 100%), 1fr))";
    ankiRowsWrap.style.gap = "8px";
    ankiRowsWrap.style.marginBottom = "10px";
    // Placeholder for Reset row inside the same section — created synchronously so it stays before Offline Audio even while prefs load async
    const ankiResetWrap = ankiSection.createDiv();
    void (async () => {
      try {
        const { normalizeAnkiExportPrefs, DEFAULT_ANKI_EXPORT_PREFS } = await import('@/lib/anki/ankiExportPrefs');
        let prefs: any = null;
        try { prefs = await this.plugin.vaultStore.loadAnkiExportPrefs(); } catch { prefs = null; }
        if (myGen !== this.displayGeneration) return;
        const norm = normalizeAnkiExportPrefs(prefs ?? DEFAULT_ANKI_EXPORT_PREFS);
        const updateInfo = () => {
          ankiPrefsInfo.setText(`partOrder=${norm.partOrder} (${norm.partOrder==='asc'?'1→7':'7→1'}) • surahOrder=${norm.surahOrder} (${norm.surahOrder==='asc'?'first→last':'last→first'}) • file: ${this.plugin.vaultStore.root}/meta/anki-export.json`);
        };
        updateInfo();
        const saveAnkiPrefs = async () => {
          await this.plugin.vaultStore.saveAnkiExportPrefs(norm as any);
          updateInfo();
        };
        ankiRowsWrap.empty();
        const partRow = new Setting(ankiRowsWrap)
          .setName("Part order")
          .setDesc("1→7 vs 7→1 — which Quran part appears first after Meta")
          .addDropdown(drop => {
            drop.addOption("asc", "asc — Part 1 → Part 7");
            drop.addOption("desc", "desc — Part 7 → Part 1 (default)");
            drop.setValue(norm.partOrder);
            drop.onChange(async (v) => {
              norm.partOrder = v === 'asc' ? 'asc' : 'desc';
              await saveAnkiPrefs();
              new Notice(`Anki export: Part order → ${norm.partOrder}`);
            });
          });
        (partRow as any).settingEl.style.border = "1px solid var(--background-modifier-border)";
        (partRow as any).settingEl.style.borderRadius = "8px";
        (partRow as any).settingEl.style.padding = "8px 10px";
        (partRow as any).settingEl.style.background = "var(--background-secondary)";
        const surahRow = new Setting(ankiRowsWrap)
          .setName("Surah within part order")
          .setDesc("first→last vs last→first — controls surah mindmaps order inside each part")
          .addDropdown(drop => {
            drop.addOption("asc", "asc — first surah → last (default)");
            drop.addOption("desc", "desc — last surah → first");
            drop.setValue(norm.surahOrder);
            drop.onChange(async (v) => {
              norm.surahOrder = v === 'asc' ? 'asc' : 'desc';
              await saveAnkiPrefs();
              new Notice(`Anki export: Surah within part → ${norm.surahOrder}`);
            });
          });
        (surahRow as any).settingEl.style.border = "1px solid var(--background-modifier-border)";
        (surahRow as any).settingEl.style.borderRadius = "8px";
        (surahRow as any).settingEl.style.padding = "8px 10px";
        (surahRow as any).settingEl.style.background = "var(--background-secondary)";
        ankiResetWrap.empty();
        const resetRow = new Setting(ankiResetWrap)
          .setName("Reset Anki export order")
          .setDesc("Default: parts desc (7→1), surahs asc (first→last)")
          .addButton(btn => btn.setButtonText("Reset to default").onClick(async () => {
            norm.partOrder = DEFAULT_ANKI_EXPORT_PREFS.partOrder;
            norm.surahOrder = DEFAULT_ANKI_EXPORT_PREFS.surahOrder;
            await saveAnkiPrefs();
            void this.display().catch(()=>{});
            new Notice("Anki export order reset to default");
          }));
        (resetRow as any).settingEl.style.marginBottom = "8px";
      } catch (e:any) {
        if (myGen !== this.displayGeneration) return;
        ankiPrefsInfo.setText(`Could not load Anki prefs: ${String(e?.message||e).slice(0,120)}`);
      }
    })();

    // ---------- Offline Audio — library manager (one row per Quran part) ----------
    // The old flow was: pick a reciter → pick a part → wait for an async probe → then
    // press a button and hope it acted on that exact pair. The whole library is now laid
    // out as rows (state and actions together), so what a button will do is always visible.
    const offlineSection = containerEl.createDiv({ cls: "quran-life-offline" });
    offlineSection.createEl("h2", { text: "Offline Audio" });
    const offlineDesc = offlineSection.createEl("p", { cls: "setting-item-description" });
    offlineDesc.setText("Downloaded audio plays without a connection. Files stay inside the plugin folder, so one synced folder (Resilio) covers every device — the player prefers a downloaded file and only streams as a fallback.");
    offlineDesc.style.marginBottom = "10px";
    (offlineDesc as any).addClass?.("quran-life-nowrap-safe");

    // Storage summary across all reciters — sizes are measured lazily and cached.
    const storageSetting = new Setting(offlineSection).setName("Storage used");
    storageSetting.setDesc(`Scanning ${OFFLINE_AUDIO_ROOT}…`);
    let refreshStorageInfo: () => void = () => {};
    storageSetting.addButton(btn => btn.setButtonText("Refresh").onClick(() => refreshStorageInfo()));

    type OfflineRowRefs = {
      settingEl: HTMLElement;
      descEl: HTMLElement;
      progressWrap: HTMLElement;
      progressFill: HTMLElement;
      progressText: HTMLElement;
      downloadBtn: any;
      cancelBtn: any;
      deleteBtn: any;
    };

    let offlineReciters: Reciter[] = ALLOWED_RECITERS;
    try {
      const recs = await getAudioPlayerReciters();
      if (recs.length) offlineReciters = recs;
    } catch { /* keep the static list */ }

    let offlineReciter: Reciter | null = offlineReciters[0] ?? null;
    let playerReciterId = "";
    try { playerReciterId = localStorage.getItem(PLAYER_RECITER_STORAGE_KEY) || ""; } catch {}
    try {
      // Prefer the reciter last used for downloads, then the one playback uses.
      const savedDownload = localStorage.getItem(DOWNLOAD_RECITER_STORAGE_KEY) || "";
      const preferred = offlineReciters.find(r => r.id === savedDownload)
        || offlineReciters.find(r => r.id === playerReciterId);
      if (preferred) offlineReciter = preferred;
    } catch {}

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
      const row = rows.get(partId);
      if (!row) return;
      const p = partScan(partId);
      const downloadingHere = activeDownloadPart === partId;
      if (!downloadingHere) {
        row.progressWrap.style.display = "none";
        row.descEl.setText(describePart(partId));
      }
      const canDownload = !!offlineReciter && eligibleSurahCount(partId) > 0 && !downloadingHere
        && !busyElsewhere(partId) && !isScanning && !(p?.isComplete ?? false);
      row.downloadBtn.setDisabled(!canDownload);
      if (downloadingHere) row.downloadBtn.setButtonText("Downloading…");
      else if (!p || p.existingFiles === 0) row.downloadBtn.setButtonText("Download");
      else if (p.isComplete) row.downloadBtn.setButtonText("Downloaded ✓");
      else row.downloadBtn.setButtonText(`Download ${p.totalFiles - p.existingFiles} missing`);
      row.deleteBtn.setDisabled(!(p && p.existingFiles > 0) || downloadingHere || busyElsewhere(partId));
      row.cancelBtn.buttonEl.style.display = downloadingHere ? "" : "none";
      row.cancelBtn.setDisabled(!downloadingHere);
      row.settingEl.toggleClass("quran-life-offline-row-active", downloadingHere);
      row.settingEl.toggleClass("quran-life-offline-row-complete", !!p?.isComplete);
    };
    const updateAllRows = () => { rows.forEach((_row, partId) => updateRow(partId as QuranPart)); };

    const showRowProgress = (partId: QuranPart, text: string, progress: OfflineDownloadProgress | null = null) => {
      const row = rows.get(partId);
      if (!row) return;
      row.progressWrap.style.display = "block";
      const pct = progress ? Math.max(0, Math.min(100, progress.percent)) : 0;
      row.progressFill.style.width = progress ? `${pct}%` : "0%";
      const detail = progress
        ? `${pct}% • ${progress.completedFiles}/${progress.totalFiles} files • ${formatBytes(progress.downloadedBytes)}${progress.failedFiles ? ` • ${progress.failedFiles} failed` : ""}`
        : text;
      row.progressText.setText(detail);
      row.descEl.setText(detail);
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
      activeHintSetting.settingEl.style.display = show ? "" : "none";
      if (!show) return;
      activeHintSetting.setName(`Daily Portion plays ${partLabel(partId)} — not fully offline yet`);
      activeHintSetting.setDesc(`${missing} of ${p.totalFiles} files missing${p.existingFiles > 0 ? ` • ${formatBytes(sizesByPart.get(partId) || 0)} already downloaded` : ""}. Download it so today's listening works without a connection.`);
    };

    refreshStorageInfo = () => {
      storageSetting.setDesc(`Scanning ${OFFLINE_AUDIO_ROOT}…`);
      void (async () => {
        try {
          const usage = await getTotalOfflineStorageUsage(this.app);
          if (usage.fileCount === 0) storageSetting.setDesc(`No downloads yet • files go to ${OFFLINE_AUDIO_ROOT}`);
          else storageSetting.setDesc(`${usage.fileCount} files • ${formatBytes(usage.totalBytes)} across all reciters • stored in ${OFFLINE_AUDIO_ROOT}`);
        } catch { storageSetting.setDesc(`Could not read storage usage • files live in ${OFFLINE_AUDIO_ROOT}`); }
      })();
    };

    const fillSizes = async (result: OfflineReciterScan, reciterId: string) => {
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
          const partId = option.id as QuranPart;
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

    const rescan = async () => {
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
    let rescanTimer: ReturnType<typeof setTimeout> | null = null;
    refreshOfflineStatus = () => {
      if (rescanTimer !== null) clearTimeout(rescanTimer);
      rescanTimer = setTimeout(() => { rescanTimer = null; void rescan(); }, 400);
    };

    const startDownload = async (partId: QuranPart) => {
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
      } catch (e: any) {
        const msg = String(e?.message || e);
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

    const deleteRowPart = async (partId: QuranPart) => {
      const reciter = offlineReciter;
      if (!reciter || activeDownloadPart !== null) { if (activeDownloadPart !== null) new Notice("Cannot delete while a download is running"); return; }
      const p = partScan(partId);
      if (!p || p.existingFiles === 0) return;
      try { if (typeof confirm === "function" && !confirm(`Delete ${p.existingFiles} offline files for ${reciter.name} — ${partLabel(partId)}? Files are removed permanently (no trash), to free storage.`)) return; } catch {}
      try {
        const res = await deletePartAudio(reciter.id, partId, this.app);
        new Notice(`Deleted ${res.deletedFiles} files • freed ${formatBytes(res.freedBytes)}`);
        sizesByPart.delete(partId);
        await rescan();
      } catch (e: any) { new Notice(`Delete failed: ${e?.message || e}`); }
    };

    const deleteReciterAll = async () => {
      const reciter = offlineReciter;
      if (!reciter) return;
      if (activeDownloadPart !== null) { new Notice("Cannot delete while a download is running"); return; }
      const count = scan?.fileCount ?? 0;
      if (count === 0) { new Notice(`No offline files for ${reciter.name}`); return; }
      try { if (typeof confirm === "function" && !confirm(`Delete ALL ${count} offline files for ${reciter.name}? Files are removed permanently (no trash), to free storage.`)) return; } catch {}
      try {
        const res = await deleteAllOfflineAudioForReciter(reciter.id, this.app);
        new Notice(`Deleted ${res.deletedFiles} files • freed ${formatBytes(res.freedBytes)}`);
        sizesByPart.clear();
        reciterTotalBytes = null;
        await rescan();
      } catch (e: any) { new Notice(`Delete failed: ${e?.message || e}`); }
    };

    // ---- reciter + active-part shortcut + per-part library ----
    const reciterSetting = new Setting(offlineSection)
      .setName("Reciter")
      .setDesc("The voice these downloads use.");
    reciterSetting.addDropdown(drop => {
      offlineReciters.forEach(r => drop.addOption(r.id, r.name));
      if (offlineReciter) drop.setValue(offlineReciter.id);
      drop.onChange(async v => {
        const found = offlineReciters.find(r => r.id === v);
        if (!found || found.id === offlineReciter?.id) return;
        offlineReciter = found;
        try { localStorage.setItem(DOWNLOAD_RECITER_STORAGE_KEY, found.id); } catch {}
        updateReciterHint();
        if (activeDownloadPart !== null) { new Notice("Switching reciter after the running download finishes"); return; }
        await rescan();
      });
    });
    reciterSetting.addButton(btn => btn
      .setButtonText("Use in player")
      .setTooltip("Make the Daily Portion player use this reciter")
      .onClick(() => {
        const selected = offlineReciter;
        if (!selected) return;
        playerReciterId = selected.id;
        try { localStorage.setItem(PLAYER_RECITER_STORAGE_KEY, selected.id); } catch {}
        try { window.dispatchEvent(new CustomEvent(PLAYER_RECITER_EVENT, { detail: { id: selected.id } })); } catch {}
        updateReciterHint();
        new Notice(`Player reciter set to ${selected.name}`);
      }));

    reciterHintEl = offlineSection.createEl("p", { cls: "setting-item-description quran-life-offline-hint" });
    updateReciterHint();

    // One-click shortcut when the part the Daily Portion plays isn't downloaded yet.
    activeHintSetting = new Setting(offlineSection)
      .setName("Daily Portion part")
      .setDesc("Checking…");
    activeHintSetting.settingEl.addClass("quran-life-offline-active-hint");
    activeHintSetting.settingEl.style.display = "none";
    activeHintSetting.addButton(btn => btn
      .setButtonText("Download now")
      .setCta()
      .onClick(() => { void startDownload(daily.activePart); }));

    libraryHeader = new Setting(offlineSection)
      .setName("Library")
      .setDesc("Scanning downloaded files…");
    libraryHeader.settingEl.addClass("quran-life-offline-library");
    libraryHeader.addButton(btn => btn
      .setButtonText("Delete all (reciter)")
      .setWarning()
      .onClick(() => { void deleteReciterAll(); }));

    const rowsContainer = offlineSection.createDiv({ cls: "quran-life-offline-rows" });
    for (const option of ACTIVE_PART_OPTIONS) {
      const partId = option.id as QuranPart;
      const rowSetting = new Setting(rowsContainer).setName(partLabel(partId)).setDesc("Scanning…");
      rowSetting.settingEl.addClass("quran-life-offline-row");

      const progressWrap = rowSetting.infoEl.createDiv({ cls: "quran-life-offline-progress" });
      progressWrap.style.display = "none";
      const barOuter = progressWrap.createDiv({ cls: "quran-life-offline-bar" });
      const progressFill = barOuter.createDiv({ cls: "quran-life-offline-bar-inner" });
      progressFill.style.width = "0%";
      const progressText = progressWrap.createDiv({ cls: "quran-life-offline-progress-text" });
      progressText.setText("");

      let downloadBtn: any = null;
      let cancelBtn: any = null;
      let deleteBtn: any = null;
      rowSetting.addButton(btn => { downloadBtn = btn; btn.setButtonText("Download").onClick(() => { void startDownload(partId); }); });
      rowSetting.addButton(btn => { deleteBtn = btn; btn.setButtonText("Delete").onClick(() => { void deleteRowPart(partId); }); });
      rowSetting.addButton(btn => { cancelBtn = btn; btn.setButtonText("Cancel").setWarning().onClick(() => { (abortController ?? offlineDownloadAbort)?.abort(); new Notice("Cancelling…"); }); });

      rows.set(partId, {
        settingEl: rowSetting.settingEl,
        descEl: rowSetting.descEl,
        progressWrap,
        progressFill,
        progressText,
        downloadBtn,
        cancelBtn,
        deleteBtn,
      });
    }

    updateAllRows();
    updateLibraryHeader();
    refreshStorageInfo();
    void rescan();

    // Info footer
    const offlineInfo = offlineSection.createDiv({ cls: "quran-life-offline-footer" });
    offlineInfo.setText(`Downloads are throttled (3 at a time, 250 ms apart) to stay under the host's rate limits. Files live in ${OFFLINE_AUDIO_ROOT}/<reciter>/ — one synced folder covers every device.`);
  }
}
