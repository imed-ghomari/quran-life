import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import QuranLifePlugin from "./main";
import { ACTIVE_PART_OPTIONS, ALL_QURAN_PART, QuranPart } from "@/lib/types";
import { SURAHS, getSurahsByPart } from "@/lib/quranData";
import { clampDailyTargetMinutes, DEFAULT_DAILY_TARGET_MINUTES, estimateEligibleCycleDays, getEligibleVerseCount } from "@/lib/dailyPortionUtils";

export interface QuranLifePluginSettings {
  dataRoot: string;
  autoSyncDebounceMs: number;
}

export const DEFAULT_SETTINGS: QuranLifePluginSettings = {
  dataRoot: ".obsidian/plugins/quran-life/data",
  autoSyncDebounceMs: 700,
};

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
  constructor(app: App, plugin: QuranLifePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Storage & Sync" });

    new Setting(containerEl)
      .setName("Data folder")
      .setDesc("Resilio-synced folder. Default: .obsidian/plugins/quran-life/data")
      .addText((text) =>
        text
          .setPlaceholder(".obsidian/plugins/quran-life/data")
          .setValue(this.plugin.settings.dataRoot)
          .onChange(async (value) => {
            const normalized = value.trim().replace(/^\/+|\/+$/g, "") || ".obsidian/plugins/quran-life/data";
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

    // Daily Portion
    containerEl.createEl("h2", { text: "Daily Portion" });

    let daily: DailySettings = { ...DEFAULT_DAILY };
    try {
      const raw = await this.plugin.vaultStore.loadSettings<any>(null as any);
      daily = parseDaily(raw);
    } catch { }
    let updateMinutesDesc: () => void = () => {};
    let renderSurahList: () => void = () => {};
    let updateExtraDesc: () => void = () => {};

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
        if (!confirm(`Reset part ${daily.activePart}?`)) return;
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
        if (!confirm("Reset all progress?")) return;
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
  }
}
