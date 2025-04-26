/**
 * Модуль для управления аудиториями Facebook.
 * Содержит логику создания/обновления Custom Audiences и Lookalike Audiences.
 */

import { findOrCreateCustomAudience, updateCustomAudience, Env } from './facebookApi';
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
