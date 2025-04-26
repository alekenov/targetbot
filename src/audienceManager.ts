/**
 * Модуль для управления аудиториями Facebook.
 * Содержит логику создания/обновления Custom Audiences и Lookalike Audiences.
 */

import { findOrCreateCustomAudience, updateCustomAudience, createLookalikeAudience, Env } from './facebookApi';
import { hashPhoneArrayForFacebook } from './utils/hash';

/**
 * Синхронизирует Custom Audience с телефонными номерами.
 * 
 * Примечание: В текущей реализации используются фиктивные данные вместо реальных телефонов из MySQL.
 * В полной реализации здесь будет вызов mysqlClient.getPhoneNumbers(env).
 * 
 * @param env Окружение Worker'а
 * @returns Результат синхронизации
 */
export async function syncPhoneAudience(env: Env): Promise<{ success: boolean; message: string; audienceId?: string }> {
	try {
		console.log('[AUDIENCE MANAGER] Начало синхронизации аудитории телефонов...');
		
		// ===============================================================
		// В полной реализации здесь будет получение телефонов из MySQL
		// Пока используем тестовые данные
		const phoneNumbers = [
			'+7 (999) 123-45-67',
			'+7(999)765-43-21',
			'89991112233',
			'8 (999) 444-55-66',
			'+79997778899',
			// Добавим больше тестовых номеров для демонстрации
			'+7 (999) 111-22-33',
			'+7 (999) 222-33-44',
			'+7 (999) 333-44-55',
			'+7 (999) 444-55-66',
			'+7 (999) 555-66-77'
		];
		console.log(`[AUDIENCE MANAGER] Используем ${phoneNumbers.length} тестовых телефонных номеров`);
		
		// Выводим несколько примеров для отладки
		console.log('[AUDIENCE MANAGER] Примеры телефонов:');
		phoneNumbers.slice(0, 3).forEach((phone, index) => {
			console.log(`  ${index + 1}. ${phone}`);
		});
		console.log('  ...');
		// ===============================================================
		
		// Хешируем телефоны в формат, который требует Facebook API
		console.log('[AUDIENCE MANAGER] Хеширование телефонных номеров...');
		const hashedPhones = await hashPhoneArrayForFacebook(phoneNumbers);
		console.log(`[AUDIENCE MANAGER] Успешно хешировано ${hashedPhones.length} телефонных номеров`);
		
		// Выводим несколько примеров хешированных телефонов для отладки
		console.log('[AUDIENCE MANAGER] Примеры хешированных телефонов:');
		hashedPhones.slice(0, 3).forEach((hash, index) => {
			console.log(`  ${index + 1}. ${hash}`);
		});
		console.log('  ...');
		
		// Название и описание аудитории
		const audienceName = 'Phone Audience';
		const audienceDescription = 'Custom audience from phone numbers';
		
		// Находим или создаем аудиторию
		console.log(`[AUDIENCE MANAGER] Поиск или создание аудитории "${audienceName}"...`);
		const audienceId = await findOrCreateCustomAudience(
			audienceName,
			audienceDescription,
			env.FB_ACCESS_TOKEN,
			env.FB_AD_ACCOUNT_ID,
			env
		);
		
		console.log(`[AUDIENCE MANAGER] Используем аудиторию с ID: ${audienceId}`);
		
		// Сохраняем ID аудитории в KV хранилище для будущего использования
		const audienceIdKey = `audience:${audienceName}`;
		await env.AUDIENCE_CACHE.put(audienceIdKey, audienceId);
		console.log(`[AUDIENCE MANAGER] ID аудитории сохранен в кэше с ключом: ${audienceIdKey}`);
		
		// Обновляем аудиторию хешированными телефонами
		console.log('[AUDIENCE MANAGER] Обновление аудитории хешированными телефонами...');
		const updateResult = await updateCustomAudience(
			audienceId,
			hashedPhones,
			env.FB_ACCESS_TOKEN,
			env
		);
		
		console.log(`[AUDIENCE MANAGER] Результат обновления аудитории: успешно добавлены телефонные номера`);
		
		return {
			success: true,
			message: `Синхронизация телефонной аудитории завершена. Обработано ${phoneNumbers.length} номеров.`,
			audienceId
		};
	} catch (error) {
		console.error('[AUDIENCE MANAGER] ERROR: Ошибка в syncPhoneAudience:', error);
		
		return {
			success: false,
			message: error instanceof Error ? error.message : 'Неизвестная ошибка при синхронизации аудитории'
		};
	}
}

/**
 * Создает Lookalike аудиторию на основе основной Custom Audience с телефонами
 * 
 * @param env Окружение Worker'а
 * @param sourceAudienceName Название исходной Custom Audience (по умолчанию "Phone Audience")
 * @returns Результат создания Lookalike аудитории
 */
export async function createPhoneLookalikeAudience(
	env: Env,
	sourceAudienceName: string = 'Phone Audience'
): Promise<{ success: boolean; message: string; audienceId?: string }> {
	try {
		console.log(`[AUDIENCE MANAGER] Начало создания Lookalike аудитории на основе "${sourceAudienceName}"...`);
		
		// Получаем ID исходной аудитории из KV (используя имя как ключ)
		const sourceAudienceIdKey = `audience:${sourceAudienceName}`;
		const sourceAudienceId = await env.AUDIENCE_CACHE.get(sourceAudienceIdKey);
		
		if (!sourceAudienceId) {
			console.warn(`[AUDIENCE MANAGER] WARNING: Исходная аудитория "${sourceAudienceName}" не найдена в кэше.`);
			
			// Попробуем найти аудиторию по имени через Facebook API
			console.log(`[AUDIENCE MANAGER] Попытка найти аудиторию "${sourceAudienceName}" через Facebook API...`);
			
			try {
				const audienceId = await findOrCreateCustomAudience(
					sourceAudienceName,
					"", // пустое описание, так как мы только ищем, а не создаем
					env.FB_ACCESS_TOKEN,
					env.FB_AD_ACCOUNT_ID,
					env
				);
				
				if (audienceId) {
					console.log(`[AUDIENCE MANAGER] Найдена существующая аудитория с ID: ${audienceId}`);
					
					// Сохраняем ID в KV для будущих запросов
					await env.AUDIENCE_CACHE.put(sourceAudienceIdKey, audienceId);
					
					// Используем найденный ID
					return await createLookalikeAudienceInternal(env, audienceId, sourceAudienceName);
				}
			} catch (findError) {
				console.error('[AUDIENCE MANAGER] ERROR: Не удалось найти аудиторию через API:', findError);
			}
			
			return {
				success: false,
				message: `Исходная аудитория "${sourceAudienceName}" не найдена. Сначала синхронизируйте телефонную аудиторию.`
			};
		}
		
		console.log(`[AUDIENCE MANAGER] Найден ID исходной аудитории: ${sourceAudienceId}`);
		
		// Создаем Lookalike аудиторию на основе исходной
		return await createLookalikeAudienceInternal(env, sourceAudienceId, sourceAudienceName);
		
	} catch (error) {
		console.error('[AUDIENCE MANAGER] ERROR: Ошибка в createPhoneLookalikeAudience:', error);
		
		return {
			success: false,
			message: error instanceof Error ? error.message : 'Неизвестная ошибка при создании Lookalike аудитории'
		};
	}
}

/**
 * Внутренняя функция для создания Lookalike аудитории
 */
async function createLookalikeAudienceInternal(
	env: Env,
	sourceAudienceId: string,
	sourceAudienceName: string
): Promise<{ success: boolean; message: string; audienceId?: string }> {
	// Параметры для Lookalike аудитории
	// Здесь используем фиксированные значения, но в реальном сценарии они могут быть переданы как параметры
	const lookalikeConfig = {
		name: `${sourceAudienceName} - Lookalike 1%`,
		countrySpec: 'RU',  // Страна для Lookalike: US, RU и т.д.
		ratio: 0.01         // 1% от населения указанной страны
	};
	
	// Создаем Lookalike аудиторию
	console.log(`[AUDIENCE MANAGER] Создание Lookalike аудитории "${lookalikeConfig.name}" для страны ${lookalikeConfig.countrySpec}...`);
	try {
		const lookalikeId = await createLookalikeAudience(
			sourceAudienceId,
			lookalikeConfig.name,
			lookalikeConfig.countrySpec,
			lookalikeConfig.ratio,
			env.FB_ACCESS_TOKEN,
			env.FB_AD_ACCOUNT_ID,
			env
		);
		
		console.log(`[AUDIENCE MANAGER] Успешно создана Lookalike аудитория с ID: ${lookalikeId}`);
		
		return {
			success: true,
			message: `Создана Lookalike аудитория "${lookalikeConfig.name}" на основе "${sourceAudienceName}"`,
			audienceId: lookalikeId
		};
	} catch (error) {
		console.error('[AUDIENCE MANAGER] ERROR: Ошибка при создании Lookalike аудитории:', error);
		throw error;
	}
}
