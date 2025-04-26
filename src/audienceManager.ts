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
export async function syncPhoneAudience(env: Env): Promise<{ success: boolean; message: string }> {
	try {
		console.log('Starting phone audience synchronization...');
		
		// ===============================================================
		// В полной реализации здесь будет получение телефонов из MySQL
		// Пока используем тестовые данные
		const phoneNumbers = [
			'+7 (999) 123-45-67',
			'+7(999)765-43-21',
			'89991112233',
			'8 (999) 444-55-66',
			'+79997778899'
		];
		console.log(`Using ${phoneNumbers.length} test phone numbers (replace with MySQL integration later)`);
		// ===============================================================
		
		// Хешируем телефоны в формат, который требует Facebook API
		console.log('Hashing phone numbers...');
		const hashedPhones = await hashPhoneArrayForFacebook(phoneNumbers);
		console.log(`Successfully hashed ${hashedPhones.length} phone numbers`);
		
		// Название и описание аудитории
		const audienceName = 'Phone Audience';
		const audienceDescription = 'Custom audience from phone numbers';
		
		// Находим или создаем аудиторию
		console.log(`Finding or creating audience "${audienceName}"...`);
		const audienceId = await findOrCreateCustomAudience(
			audienceName,
			audienceDescription,
			env.FB_ACCESS_TOKEN,
			env.FB_AD_ACCOUNT_ID,
			env
		);
		
		console.log(`Using audience ID: ${audienceId}`);
		
		// Обновляем аудиторию хешированными телефонами
		console.log('Updating audience with hashed phones...');
		const updateResult = await updateCustomAudience(
			audienceId,
			hashedPhones,
			env.FB_ACCESS_TOKEN,
			env
		);
		
		console.log(`Audience update result: ${updateResult.success ? 'SUCCESS' : 'FAILURE'} - ${updateResult.message}`);
		
		return {
			success: true,
			message: `Phone audience sync completed. Processed ${phoneNumbers.length} numbers. ${updateResult.message}`
		};
	} catch (error) {
		console.error('Error in syncPhoneAudience:', error);
		
		return {
			success: false,
			message: error instanceof Error ? error.message : 'Unknown error during audience sync'
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
		console.log(`Starting Lookalike audience creation based on "${sourceAudienceName}"...`);
		
		// Получаем ID исходной аудитории из KV (используя имя как ключ)
		const sourceAudienceIdKey = `audience:${sourceAudienceName}`;
		const sourceAudienceId = await env.AUDIENCE_CACHE.get(sourceAudienceIdKey);
		
		if (!sourceAudienceId) {
			return {
				success: false,
				message: `Source audience "${sourceAudienceName}" not found in cache. Please sync phone audience first.`
			};
		}
		
		console.log(`Found source audience ID: ${sourceAudienceId}`);
		
		// Параметры для Lookalike аудитории
		// Здесь используем фиксированные значения, но в реальном сценарии они могут быть переданы как параметры
		const lookalikeConfig = {
			name: `${sourceAudienceName} - Lookalike 1%`,
			countrySpec: 'US',  // Страна для Lookalike: US, RU и т.д.
			ratio: 0.01         // 1% от населения указанной страны
		};
		
		// Создаем Lookalike аудиторию
		console.log(`Creating Lookalike audience "${lookalikeConfig.name}" for country ${lookalikeConfig.countrySpec}...`);
		const lookalikeId = await createLookalikeAudience(
			sourceAudienceId,
			lookalikeConfig.name,
			lookalikeConfig.countrySpec,
			lookalikeConfig.ratio,
			env.FB_ACCESS_TOKEN,
			env.FB_AD_ACCOUNT_ID,
			env
		);
		
		console.log(`Successfully created Lookalike audience with ID: ${lookalikeId}`);
		
		return {
			success: true,
			message: `Created Lookalike audience "${lookalikeConfig.name}" based on "${sourceAudienceName}"`,
			audienceId: lookalikeId
		};
	} catch (error) {
		console.error('Error in createPhoneLookalikeAudience:', error);
		
		return {
			success: false,
			message: error instanceof Error ? error.message : 'Unknown error during Lookalike audience creation'
		};
	}
}
