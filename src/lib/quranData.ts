// ========================================
// Qur'an Data with Traditional Part Classifications
// ========================================

import { Surah, Verse, QuranPart } from './types';

// Helper to determine part based on surah ID
function getPart(surahId: number): QuranPart {
    if (surahId >= 1 && surahId <= 9) return 1;   // As-Sab'ut-Tiwal
    if (surahId >= 10 && surahId <= 32) return 2;  // Al-Mi'un
    if (surahId >= 33 && surahId <= 49) return 3;  // Al-Mathani
    return 4; // Al-Mufassal (50-114)
}

// Complete Surah metadata (114 surahs)
export const SURAHS: Surah[] = [
    { id: 1, name: 'Al-Fatiha', arabicName: 'الفاتحة', verseCount: 7, part: getPart(1) },
    { id: 2, name: 'Al-Baqarah', arabicName: 'البقرة', verseCount: 286, part: getPart(2) },
    { id: 3, name: 'Aal-Imran', arabicName: 'آل عمران', verseCount: 200, part: getPart(3) },
    { id: 4, name: 'An-Nisa', arabicName: 'النساء', verseCount: 176, part: getPart(4) },
    { id: 5, name: 'Al-Maidah', arabicName: 'المائدة', verseCount: 120, part: getPart(5) },
    { id: 6, name: 'Al-Anam', arabicName: 'الأنعام', verseCount: 165, part: getPart(6) },
    { id: 7, name: 'Al-Araf', arabicName: 'الأعراف', verseCount: 206, part: getPart(7) },
    { id: 8, name: 'Al-Anfal', arabicName: 'الأنفال', verseCount: 75, part: getPart(8) },
    { id: 9, name: 'At-Tawbah', arabicName: 'التوبة', verseCount: 129, part: getPart(9) },
    { id: 10, name: 'Yunus', arabicName: 'يونس', verseCount: 109, part: getPart(10) },
    { id: 11, name: 'Hud', arabicName: 'هود', verseCount: 123, part: getPart(11) },
    { id: 12, name: 'Yusuf', arabicName: 'يوسف', verseCount: 111, part: getPart(12) },
    { id: 13, name: 'Ar-Rad', arabicName: 'الرعد', verseCount: 43, part: getPart(13) },
    { id: 14, name: 'Ibrahim', arabicName: 'إبراهيم', verseCount: 52, part: getPart(14) },
    { id: 15, name: 'Al-Hijr', arabicName: 'الحجر', verseCount: 99, part: getPart(15) },
    { id: 16, name: 'An-Nahl', arabicName: 'النحل', verseCount: 128, part: getPart(16) },
    { id: 17, name: 'Al-Isra', arabicName: 'الإسراء', verseCount: 111, part: getPart(17) },
    { id: 18, name: 'Al-Kahf', arabicName: 'الكهف', verseCount: 110, part: getPart(18) },
    { id: 19, name: 'Maryam', arabicName: 'مريم', verseCount: 98, part: getPart(19) },
    { id: 20, name: 'Ta-Ha', arabicName: 'طه', verseCount: 135, part: getPart(20) },
    { id: 21, name: 'Al-Anbiya', arabicName: 'الأنبياء', verseCount: 112, part: getPart(21) },
    { id: 22, name: 'Al-Hajj', arabicName: 'الحج', verseCount: 78, part: getPart(22) },
    { id: 23, name: 'Al-Muminun', arabicName: 'المؤمنون', verseCount: 118, part: getPart(23) },
    { id: 24, name: 'An-Nur', arabicName: 'النور', verseCount: 64, part: getPart(24) },
    { id: 25, name: 'Al-Furqan', arabicName: 'الفرقان', verseCount: 77, part: getPart(25) },
    { id: 26, name: 'Ash-Shuara', arabicName: 'الشعراء', verseCount: 227, part: getPart(26) },
    { id: 27, name: 'An-Naml', arabicName: 'النمل', verseCount: 93, part: getPart(27) },
    { id: 28, name: 'Al-Qasas', arabicName: 'القصص', verseCount: 88, part: getPart(28) },
    { id: 29, name: 'Al-Ankabut', arabicName: 'العنكبوت', verseCount: 69, part: getPart(29) },
    { id: 30, name: 'Ar-Rum', arabicName: 'الروم', verseCount: 60, part: getPart(30) },
    { id: 31, name: 'Luqman', arabicName: 'لقمان', verseCount: 34, part: getPart(31) },
    { id: 32, name: 'As-Sajdah', arabicName: 'السجدة', verseCount: 30, part: getPart(32) },
    { id: 33, name: 'Al-Ahzab', arabicName: 'الأحزاب', verseCount: 73, part: getPart(33) },
    { id: 34, name: 'Saba', arabicName: 'سبأ', verseCount: 54, part: getPart(34) },
    { id: 35, name: 'Fatir', arabicName: 'فاطر', verseCount: 45, part: getPart(35) },
    { id: 36, name: 'Ya-Sin', arabicName: 'يس', verseCount: 83, part: getPart(36) },
    { id: 37, name: 'As-Saffat', arabicName: 'الصافات', verseCount: 182, part: getPart(37) },
    { id: 38, name: 'Sad', arabicName: 'ص', verseCount: 88, part: getPart(38) },
    { id: 39, name: 'Az-Zumar', arabicName: 'الزمر', verseCount: 75, part: getPart(39) },
    { id: 40, name: 'Ghafir', arabicName: 'غافر', verseCount: 85, part: getPart(40) },
    { id: 41, name: 'Fussilat', arabicName: 'فصلت', verseCount: 54, part: getPart(41) },
    { id: 42, name: 'Ash-Shura', arabicName: 'الشورى', verseCount: 53, part: getPart(42) },
    { id: 43, name: 'Az-Zukhruf', arabicName: 'الزخرف', verseCount: 89, part: getPart(43) },
    { id: 44, name: 'Ad-Dukhan', arabicName: 'الدخان', verseCount: 59, part: getPart(44) },
    { id: 45, name: 'Al-Jathiyah', arabicName: 'الجاثية', verseCount: 37, part: getPart(45) },
    { id: 46, name: 'Al-Ahqaf', arabicName: 'الأحقاف', verseCount: 35, part: getPart(46) },
    { id: 47, name: 'Muhammad', arabicName: 'محمد', verseCount: 38, part: getPart(47) },
    { id: 48, name: 'Al-Fath', arabicName: 'الفتح', verseCount: 29, part: getPart(48) },
    { id: 49, name: 'Al-Hujurat', arabicName: 'الحجرات', verseCount: 18, part: getPart(49) },
    { id: 50, name: 'Qaf', arabicName: 'ق', verseCount: 45, part: getPart(50) },
    { id: 51, name: 'Adh-Dhariyat', arabicName: 'الذاريات', verseCount: 60, part: getPart(51) },
    { id: 52, name: 'At-Tur', arabicName: 'الطور', verseCount: 49, part: getPart(52) },
    { id: 53, name: 'An-Najm', arabicName: 'النجم', verseCount: 62, part: getPart(53) },
    { id: 54, name: 'Al-Qamar', arabicName: 'القمر', verseCount: 55, part: getPart(54) },
    { id: 55, name: 'Ar-Rahman', arabicName: 'الرحمن', verseCount: 78, part: getPart(55) },
    { id: 56, name: 'Al-Waqiah', arabicName: 'الواقعة', verseCount: 96, part: getPart(56) },
    { id: 57, name: 'Al-Hadid', arabicName: 'الحديد', verseCount: 29, part: getPart(57) },
    { id: 58, name: 'Al-Mujadila', arabicName: 'المجادلة', verseCount: 22, part: getPart(58) },
    { id: 59, name: 'Al-Hashr', arabicName: 'الحشر', verseCount: 24, part: getPart(59) },
    { id: 60, name: 'Al-Mumtahina', arabicName: 'الممتحنة', verseCount: 13, part: getPart(60) },
    { id: 61, name: 'As-Saff', arabicName: 'الصف', verseCount: 14, part: getPart(61) },
    { id: 62, name: 'Al-Jumuah', arabicName: 'الجمعة', verseCount: 11, part: getPart(62) },
    { id: 63, name: 'Al-Munafiqun', arabicName: 'المنافقون', verseCount: 11, part: getPart(63) },
    { id: 64, name: 'At-Taghabun', arabicName: 'التغابن', verseCount: 18, part: getPart(64) },
    { id: 65, name: 'At-Talaq', arabicName: 'الطلاق', verseCount: 12, part: getPart(65) },
    { id: 66, name: 'At-Tahrim', arabicName: 'التحريم', verseCount: 12, part: getPart(66) },
    { id: 67, name: 'Al-Mulk', arabicName: 'الملك', verseCount: 30, part: getPart(67) },
    { id: 68, name: 'Al-Qalam', arabicName: 'القلم', verseCount: 52, part: getPart(68) },
    { id: 69, name: 'Al-Haqqah', arabicName: 'الحاقة', verseCount: 52, part: getPart(69) },
    { id: 70, name: 'Al-Maarij', arabicName: 'المعارج', verseCount: 44, part: getPart(70) },
    { id: 71, name: 'Nuh', arabicName: 'نوح', verseCount: 28, part: getPart(71) },
    { id: 72, name: 'Al-Jinn', arabicName: 'الجن', verseCount: 28, part: getPart(72) },
    { id: 73, name: 'Al-Muzzammil', arabicName: 'المزمل', verseCount: 20, part: getPart(73) },
    { id: 74, name: 'Al-Muddathir', arabicName: 'المدثر', verseCount: 56, part: getPart(74) },
    { id: 75, name: 'Al-Qiyamah', arabicName: 'القيامة', verseCount: 40, part: getPart(75) },
    { id: 76, name: 'Al-Insan', arabicName: 'الإنسان', verseCount: 31, part: getPart(76) },
    { id: 77, name: 'Al-Mursalat', arabicName: 'المرسلات', verseCount: 50, part: getPart(77) },
    { id: 78, name: 'An-Naba', arabicName: 'النبأ', verseCount: 40, part: getPart(78) },
    { id: 79, name: 'An-Naziat', arabicName: 'النازعات', verseCount: 46, part: getPart(79) },
    { id: 80, name: 'Abasa', arabicName: 'عبس', verseCount: 42, part: getPart(80) },
    { id: 81, name: 'At-Takwir', arabicName: 'التكوير', verseCount: 29, part: getPart(81) },
    { id: 82, name: 'Al-Infitar', arabicName: 'الانفطار', verseCount: 19, part: getPart(82) },
    { id: 83, name: 'Al-Mutaffifin', arabicName: 'المطففين', verseCount: 36, part: getPart(83) },
    { id: 84, name: 'Al-Inshiqaq', arabicName: 'الانشقاق', verseCount: 25, part: getPart(84) },
    { id: 85, name: 'Al-Buruj', arabicName: 'البروج', verseCount: 22, part: getPart(85) },
    { id: 86, name: 'At-Tariq', arabicName: 'الطارق', verseCount: 17, part: getPart(86) },
    { id: 87, name: 'Al-Ala', arabicName: 'الأعلى', verseCount: 19, part: getPart(87) },
    { id: 88, name: 'Al-Ghashiyah', arabicName: 'الغاشية', verseCount: 26, part: getPart(88) },
    { id: 89, name: 'Al-Fajr', arabicName: 'الفجر', verseCount: 30, part: getPart(89) },
    { id: 90, name: 'Al-Balad', arabicName: 'البلد', verseCount: 20, part: getPart(90) },
    { id: 91, name: 'Ash-Shams', arabicName: 'الشمس', verseCount: 15, part: getPart(91) },
    { id: 92, name: 'Al-Layl', arabicName: 'الليل', verseCount: 21, part: getPart(92) },
    { id: 93, name: 'Ad-Duha', arabicName: 'الضحى', verseCount: 11, part: getPart(93) },
    { id: 94, name: 'Ash-Sharh', arabicName: 'الشرح', verseCount: 8, part: getPart(94) },
    { id: 95, name: 'At-Tin', arabicName: 'التين', verseCount: 8, part: getPart(95) },
    { id: 96, name: 'Al-Alaq', arabicName: 'العلق', verseCount: 19, part: getPart(96) },
    { id: 97, name: 'Al-Qadr', arabicName: 'القدر', verseCount: 5, part: getPart(97) },
    { id: 98, name: 'Al-Bayyinah', arabicName: 'البينة', verseCount: 8, part: getPart(98) },
    { id: 99, name: 'Az-Zalzalah', arabicName: 'الزلزلة', verseCount: 8, part: getPart(99) },
    { id: 100, name: 'Al-Adiyat', arabicName: 'العاديات', verseCount: 11, part: getPart(100) },
    { id: 101, name: 'Al-Qariah', arabicName: 'القارعة', verseCount: 11, part: getPart(101) },
    { id: 102, name: 'At-Takathur', arabicName: 'التكاثر', verseCount: 8, part: getPart(102) },
    { id: 103, name: 'Al-Asr', arabicName: 'العصر', verseCount: 3, part: getPart(103) },
    { id: 104, name: 'Al-Humazah', arabicName: 'الهمزة', verseCount: 9, part: getPart(104) },
    { id: 105, name: 'Al-Fil', arabicName: 'الفيل', verseCount: 5, part: getPart(105) },
    { id: 106, name: 'Quraysh', arabicName: 'قريش', verseCount: 4, part: getPart(106) },
    { id: 107, name: 'Al-Maun', arabicName: 'الماعون', verseCount: 7, part: getPart(107) },
    { id: 108, name: 'Al-Kawthar', arabicName: 'الكوثر', verseCount: 3, part: getPart(108) },
    { id: 109, name: 'Al-Kafirun', arabicName: 'الكافرون', verseCount: 6, part: getPart(109) },
    { id: 110, name: 'An-Nasr', arabicName: 'النصر', verseCount: 3, part: getPart(110) },
    { id: 111, name: 'Al-Masad', arabicName: 'المسد', verseCount: 5, part: getPart(111) },
    { id: 112, name: 'Al-Ikhlas', arabicName: 'الإخلاص', verseCount: 4, part: getPart(112) },
    { id: 113, name: 'Al-Falaq', arabicName: 'الفلق', verseCount: 5, part: getPart(113) },
    { id: 114, name: 'An-Nas', arabicName: 'الناس', verseCount: 6, part: getPart(114) },
];

/**
 * Parse the Qur'an JSON file (word-by-word)
 * Format: { "surah:ayah:word": { text, ... } }
 */
export function parseQuranJson(data: Record<string, any>): Verse[] {
    const versesMap: Record<string, string[]> = {};
    const verseKeysOrder: string[] = [];

    // Sort keys to ensure words are in correct order (surah:ayah:word)
    const keys = Object.keys(data).sort((a, b) => {
        const [s1, ay1, w1] = a.split(':').map(Number);
        const [s2, ay2, w2] = b.split(':').map(Number);
        if (s1 !== s2) return s1 - s2;
        if (ay1 !== ay2) return ay1 - ay2;
        return w1 - w2;
    });

    for (const key of keys) {
        const item = data[key];
        const surahId = parseInt(item.surah, 10);
        const ayahId = parseInt(item.ayah, 10);
        const verseKey = `${surahId}:${ayahId}`;

        if (!versesMap[verseKey]) {
            versesMap[verseKey] = [];
            verseKeysOrder.push(verseKey);
        }

        // Check if the word is a verse marker (Arabic digits)
        // Usually these are at the end of the ayah in this dataset
        const isMarker = /^[\u0660-\u0669]+$/.test(item.text);
        if (!isMarker) {
            versesMap[verseKey].push(item.text);
        }
    }

    return verseKeysOrder.map(verseKey => {
        const [surahId, ayahId] = verseKey.split(':').map(Number);
        return {
            surahId,
            ayahId,
            text: versesMap[verseKey].join(' '),
        };
    });
}

/**
 * Get surah by ID
 */
export function getSurah(surahId: number): Surah | undefined {
    return SURAHS.find(s => s.id === surahId);
}

/**
 * Get surahs by part
 */
export function getSurahsByPart(part: QuranPart): Surah[] {
    return SURAHS.filter(s => s.part === part);
}

/**
 * Get verses for a surah from the full verses array
 */
export function getVersesForSurah(verses: Verse[], surahId: number): Verse[] {
    return verses.filter(v => v.surahId === surahId);
}

/**
 * Get verses for a segment
 */
export function getVersesForSegment(
    verses: Verse[],
    surahId: number,
    startVerse: number,
    endVerse: number
): Verse[] {
    return verses.filter(
        v => v.surahId === surahId && v.ayahId >= startVerse && v.ayahId <= endVerse
    );
}
