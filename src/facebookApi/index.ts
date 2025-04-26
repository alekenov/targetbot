/**
 * Реэкспорт функций для Facebook API
 * Этот файл обеспечивает обратную совместимость при рефакторинге
 */

// Экспорт функций для работы с кампаниями
export { getCampaigns } from './campaigns';

// Экспорт функций для работы с аудиториями
export { 
    getCustomAudiences,
    findOrCreateCustomAudience,
    createCustomAudience
} from './audiences';

// Экспорт функций для работы с Lookalike аудиториями
export { createLookalikeAudience } from './lookalike';

// Экспорт функций для обновления аудиторий
export { updateCustomAudience } from './audience-update';

// Экспорт функций для работы с метриками (insights)
export { getAdInsights, processInsightsData } from './insights';

// Экспорт типов для обеспечения совместимости
export * from './types';
