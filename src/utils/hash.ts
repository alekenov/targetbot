/**
 * Утилиты для хеширования данных
 * 
 * Facebook API требует, чтобы все личные идентификаторы (телефоны, email и т.д.)
 * были захешированы перед передачей для создания Custom Audience.
 */

/**
 * Нормализует номер телефона (удаляет все не-цифровые символы)
 * @param phoneNumber Номер телефона
 * @returns Нормализованный номер телефона
 */
export function normalizePhone(phoneNumber: string): string {
    return phoneNumber.replace(/\D/g, '');
}

/**
 * Хеширует строку с использованием SHA-256
 * @param data Строка для хеширования
 * @returns Хеш строки в hex-формате (в нижнем регистре как требует Facebook)
 */
export async function hashSHA256(data: string): Promise<string> {
    // Преобразуем строку в массив байтов
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // Создаем хеш
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    
    // Преобразуем ArrayBuffer в hex строку
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
}

/**
 * Хеширует номер телефона для Facebook API
 * 1. Нормализует номер (удаляет все, кроме цифр)
 * 2. Хеширует с использованием SHA-256
 * 
 * @param phoneNumber Номер телефона
 * @returns Хеш номера телефона
 */
export async function hashPhoneForFacebook(phoneNumber: string): Promise<string> {
    const normalized = normalizePhone(phoneNumber);
    return await hashSHA256(normalized);
}

/**
 * Хеширует массив телефонных номеров для Facebook API
 * @param phoneNumbers Массив телефонных номеров
 * @returns Массив хешей
 */
export async function hashPhoneArrayForFacebook(phoneNumbers: string[]): Promise<string[]> {
    const hashPromises = phoneNumbers.map(phone => hashPhoneForFacebook(phone));
    return Promise.all(hashPromises);
}
