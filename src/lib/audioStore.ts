import { observable } from '@legendapp/state';
import { persistObservable } from '@legendapp/state/persist';
import { ObservablePersistLocalStorage } from '@legendapp/state/persist-plugins/local-storage';

export interface AudioSettings {
    selectedReciterId: string;
    playbackState?: {
        reciterId?: string;
        surahId: number;
        ayahId: number; // For ayah-based resumption
        timestamp: number; // Optional, for precise resumption
    };
    updatedAt: string;
}

export const audioSettings$ = observable<AudioSettings | undefined>(undefined);

if (typeof window !== 'undefined') {
    persistObservable(audioSettings$, {
        local: 'quran-app-audio-settings', 
        pluginLocal: ObservablePersistLocalStorage,
    });
}
