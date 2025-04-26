/**
 * Модуль для обновления аудиторий телефонными номерами
 */

import { Env, UpdateAudienceResponse } from './types';

/**
 * Обновляет Custom Audience хешированными телефонными номерами.
 * 
 * @param audienceId ID Custom Audience для обновления
 * @param hashedPhones Массив хешированных телефонных номеров (SHA-256)
 * @param accessToken Токен доступа Facebook
 * @param env Окружение Worker'а
 * @returns Результат обновления
 */
export async function updateCustomAudience(
	audienceId: string,
	hashedPhones: string[],
	accessToken: string,
	env: Env
): Promise<{ success: boolean; message: string }> {
	try {
		if (!hashedPhones.length) {
			return { success: false, message: 'No phone numbers provided' };
		}
		
		const apiVersion = 'v19.0';
		const url = `https://graph.facebook.com/${apiVersion}/${audienceId}/users`;
		
		// Максимальное количество номеров в одном запросе (лимит Facebook API)
		const BATCH_SIZE = 10000;
		let successfulBatches = 0;
		
		// Разбиваем на батчи, если телефонов больше максимального лимита
		for (let i = 0; i < hashedPhones.length; i += BATCH_SIZE) {
			const batch = hashedPhones.slice(i, i + BATCH_SIZE);
			
			// Формируем данные для запроса в формате, требуемом Facebook API
			// Каждый хешированный телефон оборачивается в массив
			const data = batch.map(phone => [phone]);
			
			const payload = {
				schema: ['PHONE_SHA256'],
				data,
				access_token: accessToken
			};
			
			console.log(`Uploading batch ${i / BATCH_SIZE + 1} of ${Math.ceil(hashedPhones.length / BATCH_SIZE)}...`);
			
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			});
			
			if (!response.ok) {
				const errorText = await response.text();
				console.error(`Facebook API Error Response (batch ${i / BATCH_SIZE + 1}): ${errorText}`);
				throw new Error(`Error updating audience (batch ${i / BATCH_SIZE + 1}): ${response.status} ${response.statusText}`);
			}
			
			const result = await response.json() as UpdateAudienceResponse;
			
			if (!result.audience_id) {
				console.warn(`Unexpected response format (batch ${i / BATCH_SIZE + 1}):`, result);
			} else {
				successfulBatches++;
				console.log(`Successfully uploaded batch ${i / BATCH_SIZE + 1} to audience ID: ${result.audience_id}`);
			}
			
			// Добавляем небольшую задержку между батчами, чтобы не превысить rate limits
			if (i + BATCH_SIZE < hashedPhones.length) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
		
		return {
			success: true,
			message: `Updated Custom Audience with ${hashedPhones.length} phone numbers (${successfulBatches} batches)`
		};
	} catch (error) {
		console.error('Error in updateCustomAudience:', error);
		
		return {
			success: false,
			message: error instanceof Error ? error.message : 'Unknown error during audience update'
		};
	}
}
