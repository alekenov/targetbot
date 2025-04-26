/**
 * Модуль для работы с Facebook Ads API.
 * Реэкспортирует все функции из подмодулей.
 */

// Реэкспорт всех типов
export * from './types';

// Реэкспорт функций для работы с кампаниями
export { getCampaigns } from './campaigns';

// Реэкспорт функций для работы с аудиториями
export { 
    getCustomAudiences,
    findOrCreateCustomAudience
} from './audiences';

// Реэкспорт функций для работы с Lookalike аудиториями
export { createLookalikeAudience } from './lookalike';

// Реэкспорт функций для обновления аудиторий
export { updateCustomAudience } from './audience-update';
