import { App, PluginSettingTab, Setting, Notice, Platform } from "obsidian";
import QuranLifePlugin from "./main";
import { ACTIVE_PART_OPTIONS, ALL_QURAN_PART, QuranPart } from "@/lib/types";
import { SURAHS, getSurahsByPart } from "@/lib/quranData";
import { clampDailyTargetMinutes, DEFAULT_DAILY_TARGET_MINUTES, estimateEligibleCycleDays, getEligibleVerseCount } from "@/lib/dailyPortionUtils";
import { ALLOWED_RECITERS, getAudioPlayerReciters, Reciter } from "@/lib/audio";
import {
  getOfflinePartStatus,
  getTotalOfflineStorageUsage,
  downloadPartAudio,
  deletePartAudio,
  deleteAllOfflineAudioForReciter,
  formatBytes,
  OFFLINE_AUDIO_ROOT,
} from "./offlineAudio";

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
    listContainer.style.gridTemplateColumns = "repeat(auto-fill, minmax(220px, 1fr))";
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
    ankiPrefsInfo.setText("Loading Anki preferences…");
    const ankiRowsWrap = ankiSection.createDiv();
    ankiRowsWrap.style.display = "grid";
    ankiRowsWrap.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
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

    // ---------- Offline Audio — download selected part audio for offline use ----------
    containerEl.createEl("h2", { text: "Offline Audio" });
    const offlineDesc = containerEl.createEl("p", { cls: "setting-item-description" });
    offlineDesc.setText("Download Quran part audio for offline use. Stored in plugin folder (.obsidian/plugins/quran-life/offline-audio) — works on mobile. Player auto-uses offline files when available, fallback to online.");
    offlineDesc.style.marginBottom = "12px";

    // Storage overview
    const storageInfoEl = containerEl.createDiv();
    storageInfoEl.style.fontSize = "0.85em";
    storageInfoEl.style.color = "var(--text-muted)";
    storageInfoEl.style.marginBottom = "8px";
    storageInfoEl.setText("Calculating storage...");
    let totalStorageRefresh: () => Promise<void> = async () => {};
    const refreshTotalStorage = async () => {
      try {
        const usage = await getTotalOfflineStorageUsage(this.app);
        if (usage.fileCount === 0) storageInfoEl.setText(`Offline storage: 0 files • 0 B • ${OFFLINE_AUDIO_ROOT}`);
        else storageInfoEl.setText(`Offline storage: ${usage.fileCount} files • ${formatBytes(usage.totalBytes)} total`);
        // also per-reciter breakdown if multiple
        // keep simple
      } catch { storageInfoEl.setText(`Offline storage: ${OFFLINE_AUDIO_ROOT}`); }
    };
    totalStorageRefresh = refreshTotalStorage;
    void refreshTotalStorage();

    // Reciter + Part selectors
    let offlineReciter: Reciter | null = null;
    let offlinePart: QuranPart = daily.activePart;
    let offlineReciters: Reciter[] = [];
    try {
      const recs = await getAudioPlayerReciters();
      offlineReciters = recs.length ? recs : ALLOWED_RECITERS;
    } catch { offlineReciters = ALLOWED_RECITERS; }
    if (offlineReciters.length && !offlineReciter) offlineReciter = offlineReciters[0];

    // Try to restore last selected reciter from localStorage (web) or default to first
    try {
      const savedReciterId = typeof window !== 'undefined' ? localStorage.getItem("selected_reciter_id") || "" : "";
      const found = offlineReciters.find(r => r.id === savedReciterId);
      if (found) offlineReciter = found;
    } catch {}

    const offlineReciterSetting = new Setting(containerEl)
      .setName("Reciter")
      .setDesc("Voice for offline download");
    let offlinePartSetting: Setting;
    let offlineStatusEl: HTMLElement;
    let offlineProgressWrap: HTMLElement;
    let offlineProgressFill: HTMLElement;
    let offlineProgressText: HTMLElement;
    let offlineCurrentFileEl: HTMLElement;
    let offlineStoragePartEl: HTMLElement;
    let abortController: AbortController | null = null;
    let isDownloading = false;

    const updateOfflineStatus = async () => {
      if (!offlineReciter) return;
      try {
        const status = await getOfflinePartStatus(offlineReciter, offlinePart, this.app, daily.skippedSurahs);
        const total = status.totalFiles;
        const existing = status.existingFiles;
        const pct = total > 0 ? Math.round((existing / total) * 100) : 0;
        const sizeStr = formatBytes(status.totalBytes);
        const skippedHint = status.skippedFiles ? ` • skips ${status.skippedFiles} unselected` : "";
        if (offlineStatusEl) {
          if (total === 0 && (status.skippedFiles ?? 0) > 0) offlineStatusEl.setText(`All surahs in Part ${offlinePart} are unselected in Daily Portion — nothing to download`);
          else if (status.isComplete) offlineStatusEl.setText(`Downloaded: ${existing}/${total} files • ${sizeStr} • ${pct}% — Complete${skippedHint}`);
          else if (status.isPartial) offlineStatusEl.setText(`Downloaded: ${existing}/${total} files • ${sizeStr} • ${pct}% — Partial${skippedHint}`);
          else offlineStatusEl.setText(`Not downloaded: 0/${total} files • 0 B${skippedHint}`);
        }
        if (offlineStoragePartEl) offlineStoragePartEl.setText(`Part ${offlinePart}: ${offlineReciter.name} — ${existing}/${total} files${skippedHint}`);
      } catch (e) {
        if (offlineStatusEl) offlineStatusEl.setText("Status unavailable");
      }
      void refreshTotalStorage();
    };
    refreshOfflineStatus = () => { void updateOfflineStatus(); };

    offlineReciterSetting.addDropdown(drop => {
      offlineReciters.forEach(r => drop.addOption(r.id, r.name));
      if (offlineReciter) drop.setValue(offlineReciter.id);
      drop.onChange(async v => {
        const found = offlineReciters.find(r => r.id === v);
        if (found) { offlineReciter = found; await updateOfflineStatus(); }
      });
    });

    offlinePartSetting = new Setting(containerEl)
      .setName("Quran part")
      .setDesc("Which part to download");
    offlinePartSetting.addDropdown(drop => {
      ACTIVE_PART_OPTIONS.forEach(opt => drop.addOption(String(opt.id), `${opt.name}`));
      drop.setValue(String(offlinePart));
      drop.onChange(async v => { offlinePart = Number(v) as QuranPart; await updateOfflineStatus(); });
    });

    // Status line
    offlineStatusEl = containerEl.createDiv();
    offlineStatusEl.style.fontSize = "0.82em";
    offlineStatusEl.style.color = "var(--text-muted)";
    offlineStatusEl.style.margin = "6px 0 8px 0";
    offlineStatusEl.style.padding = "6px 10px";
    offlineStatusEl.style.border = "1px solid var(--background-modifier-border)";
    offlineStatusEl.style.borderRadius = "6px";
    offlineStatusEl.style.background = "var(--background-secondary)";
    offlineStatusEl.setText("Checking...");
    offlineStoragePartEl = containerEl.createDiv();
    offlineStoragePartEl.style.fontSize = "0.78em";
    offlineStoragePartEl.style.color = "var(--text-faint)";
    offlineStoragePartEl.style.marginBottom = "8px";

    void updateOfflineStatus();

    // Progress bar (Anki deck export style: .importer-progress-bar + inner)
    offlineProgressWrap = containerEl.createDiv();
    offlineProgressWrap.style.display = "none";
    offlineProgressWrap.style.margin = "10px 0";
    offlineProgressWrap.style.padding = "10px 12px";
    offlineProgressWrap.style.border = "1px solid var(--background-modifier-border)";
    offlineProgressWrap.style.borderRadius = "8px";
    offlineProgressWrap.style.background = "var(--background-secondary)";
    const progressLabelEl = offlineProgressWrap.createDiv({ text: "Downloading..." });
    progressLabelEl.style.fontSize = "0.8em";
    progressLabelEl.style.fontWeight = "600";
    progressLabelEl.style.marginBottom = "6px";
    progressLabelEl.style.color = "var(--text-normal)";
    const barOuter = offlineProgressWrap.createDiv();
    barOuter.style.width = "100%";
    barOuter.style.height = "8px";
    barOuter.style.background = "var(--background-modifier-border)";
    barOuter.style.borderRadius = "999px";
    barOuter.style.overflow = "hidden";
    barOuter.style.boxShadow = "inset 0 0 0 1px var(--background-modifier-border)";
    offlineProgressFill = barOuter.createDiv();
    offlineProgressFill.style.width = "0%";
    offlineProgressFill.style.height = "100%";
    offlineProgressFill.style.background = "var(--interactive-accent)";
    offlineProgressFill.style.transition = "width 0.25s ease";
    offlineProgressFill.style.borderRadius = "999px";
    offlineCurrentFileEl = offlineProgressWrap.createDiv();
    offlineCurrentFileEl.style.fontSize = "0.75em";
    offlineCurrentFileEl.style.color = "var(--text-muted)";
    offlineCurrentFileEl.style.marginTop = "6px";
    offlineCurrentFileEl.style.whiteSpace = "nowrap";
    offlineCurrentFileEl.style.overflow = "hidden";
    offlineCurrentFileEl.style.textOverflow = "ellipsis";
    offlineProgressText = offlineProgressWrap.createDiv();
    offlineProgressText.style.fontSize = "0.75em";
    offlineProgressText.style.color = "var(--text-muted)";
    offlineProgressText.style.marginTop = "4px";
    offlineProgressText.setText("0% • 0/0 files • 0 B");

    // Action buttons row
    const offlineActionsSetting = new Setting(containerEl)
      .setName("Offline audio actions")
      .setDesc("Download uses moderated concurrency (3 at a time, 250ms stagger) to avoid rate limits. Delete removes files permanently (no trash) to free storage.");

    let downloadBtn: any = null;
    let cancelBtn: any = null;
    let deleteBtn: any = null;
    let deleteAllBtn: any = null;

    offlineActionsSetting.addButton(btn => {
      downloadBtn = btn;
      btn.setButtonText("Download").setCta().onClick(async () => {
        if (!offlineReciter) { new Notice("Select a reciter first"); return; }
        if (isDownloading) { new Notice("Already downloading"); return; }
        const eligibleCount = getSurahsByPart(offlinePart).filter(s => !daily.skippedSurahs.includes(s.id)).length;
        if (eligibleCount === 0) { new Notice(`All surahs in Part ${offlinePart} are unselected in Daily Portion — nothing to download`); return; }
        isDownloading = true;
        abortController = new AbortController();
        downloadBtn.setDisabled(true);
        if (cancelBtn) cancelBtn.setDisabled(false);
        if (deleteBtn) deleteBtn.setDisabled(true);
        offlineProgressWrap.style.display = "block";
        offlineProgressFill.style.width = "0%";
        offlineProgressText.setText("Starting...");
        offlineCurrentFileEl.setText("");
        try {
          const result = await downloadPartAudio(offlineReciter!, offlinePart, this.app, {
            concurrency: 3,
            delayMs: 250,
            signal: abortController.signal,
            skippedSurahIds: daily.skippedSurahs,
            onProgress: (p) => {
              const pct = Math.max(0, Math.min(100, p.percent));
              offlineProgressFill.style.width = `${pct}%`;
              const downloadedStr = formatBytes(p.downloadedBytes);
              // total bytes unknown; show downloaded + files
              offlineProgressText.setText(`${pct}% • ${p.completedFiles}/${p.totalFiles} files • ${downloadedStr}${p.failedFiles ? ` • ${p.failedFiles} failed` : ""}`);
              if (p.currentFile) offlineCurrentFileEl.setText(`Current: ${p.currentFile}`);
            },
          });
          new Notice(`Downloaded ${result.downloadedFiles} new files • ${formatBytes(result.totalBytes)} total`);
        } catch (e: any) {
          if (String(e?.message || "").includes("cancelled") || String(e?.message || "").includes("aborted")) {
            new Notice("Download cancelled");
          } else {
            new Notice(`Download failed: ${e?.message || e}`);
          }
        } finally {
          isDownloading = false;
          abortController = null;
          downloadBtn.setDisabled(false);
          if (cancelBtn) cancelBtn.setDisabled(true);
          if (deleteBtn) deleteBtn.setDisabled(false);
          // keep progress visible for a moment then hide if complete?
          setTimeout(() => { /* keep visible */ }, 300);
          await updateOfflineStatus();
        }
      });
      return btn;
    });

    offlineActionsSetting.addButton(btn => {
      cancelBtn = btn;
      btn.setButtonText("Cancel").onClick(async () => {
        if (abortController && isDownloading) {
          abortController.abort();
          new Notice("Cancelling...");
        }
      });
      btn.setDisabled(true);
      return btn;
    });

    offlineActionsSetting.addButton(btn => {
      deleteBtn = btn;
      btn.setButtonText("Delete part").onClick(async () => {
        if (!offlineReciter) return;
        if (isDownloading) { new Notice("Cannot delete while downloading"); return; }
        try { if (typeof confirm === 'function' && !confirm(`Delete offline audio for ${offlineReciter.name} — Part ${offlinePart}? This permanently removes files (no trash).`)) return; } catch {}
        btn.setDisabled(true);
        try {
          const res = await deletePartAudio(offlineReciter!.id, offlinePart, this.app);
          new Notice(`Deleted ${res.deletedFiles} files • freed ${formatBytes(res.freedBytes)}`);
          offlineProgressFill.style.width = "0%";
          offlineProgressText.setText("0% • 0/0 files • 0 B");
          offlineProgressWrap.style.display = "none";
        } catch (e:any) { new Notice(`Delete failed: ${e?.message||e}`); }
        btn.setDisabled(false);
        await updateOfflineStatus();
      });
      return btn;
    });

    offlineActionsSetting.addButton(btn => {
      deleteAllBtn = btn;
      btn.setButtonText("Delete all (reciter)").setWarning().onClick(async () => {
        if (!offlineReciter) return;
        if (isDownloading) { new Notice("Cannot delete while downloading"); return; }
        try { if (typeof confirm === 'function' && !confirm(`Delete ALL offline audio for ${offlineReciter.name}? This permanently removes all files for this reciter (no trash).`)) return; } catch {}
        btn.setDisabled(true);
        try {
          const res = await deleteAllOfflineAudioForReciter(offlineReciter!.id, this.app);
          new Notice(`Deleted ${res.deletedFiles} files • freed ${formatBytes(res.freedBytes)}`);
          offlineProgressFill.style.width = "0%";
          offlineProgressWrap.style.display = "none";
        } catch (e:any) { new Notice(`Delete failed: ${e?.message||e}`); }
        btn.setDisabled(false);
        await updateOfflineStatus();
      });
      return btn;
    });

    // Info footer
    const offlineInfo = containerEl.createDiv();
    offlineInfo.style.fontSize = "0.75em";
    offlineInfo.style.color = "var(--text-faint)";
    offlineInfo.style.marginTop = "8px";
    offlineInfo.style.lineHeight = "1.4";
    offlineInfo.setText("Tip: Player auto-uses offline files when available. Check Daily Portion → Player reciter matches download reciter. Downloads are throttled (3 concurrent) to avoid blacklist.");
  }
}
