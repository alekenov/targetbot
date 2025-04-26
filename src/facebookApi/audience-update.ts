/**
 * Модуль для обновления аудиторий телефонными номерами
 */

import { Env, UpdateAudienceResponse } from './types';

/**
 * Обновляет Custom Audience хешированными телефонными номерами
 * @param audienceId ID аудитории
 * @param hashedPhones Массив хешированных телефонов
 * @param accessToken Токен доступа Facebook
 * @returns Результат обновления аудитории
 */
export async function updateCustomAudience(
	audienceId: string,
	hashedPhones: string[],
	accessToken: string
): Promise<UpdateAudienceResponse> {
	try {
		console.log(`[AUDIENCE UPDATE] Обновление аудитории ID: ${audienceId}`);
		console.log(`[AUDIENCE UPDATE] Количество телефонов для добавления: ${hashedPhones.length}`);
		
		// Ограничение размера пакета для Facebook API
		const MAX_BATCH_SIZE = 10000;
		const apiVersion = 'v22.0';
		
		// Если количество телефонов превышает лимит, разбиваем на несколько запросов
		if (hashedPhones.length > MAX_BATCH_SIZE) {
			console.log(`[AUDIENCE UPDATE] Телефоны будут добавлены батчами по ${MAX_BATCH_SIZE} шт.`);
			const batches = [];
			for (let i = 0; i < hashedPhones.length; i += MAX_BATCH_SIZE) {
				batches.push(hashedPhones.slice(i, i + MAX_BATCH_SIZE));
			}
			
			console.log(`[AUDIENCE UPDATE] Разбито на ${batches.length} батчей`);
			
			// Результаты обновления для каждого батча
			const results = [];
			
			// Обновляем аудиторию последовательно для каждого батча
			for (let i = 0; i < batches.length; i++) {
				const batch = batches[i];
				console.log(`[AUDIENCE UPDATE] Обработка батча ${i + 1}/${batches.length}, размер: ${batch.length}`);
				
				const result = await sendAudienceUpdateRequest(apiVersion, audienceId, batch, accessToken);
				results.push(result);
				
				console.log(`[AUDIENCE UPDATE] Батч ${i + 1} обработан успешно: получено ${result.num_received || 0} телефонов`);
			}
			
			// Объединяем результаты
			const totalReceived = results.reduce((sum, result) => sum + (result.num_received || 0), 0);
			const totalInvalid = results.reduce((sum, result) => sum + (result.num_invalid_entries || 0), 0);
			
			console.log(`[AUDIENCE UPDATE] Все батчи обработаны`);
			console.log(`[AUDIENCE UPDATE] Общий результат: получено ${totalReceived}, отклонено ${totalInvalid}`);
			
			return {
				audience_id: audienceId,
				num_received: totalReceived,
				num_invalid_entries: totalInvalid
			};
		} else {
			// Если телефонов немного, отправляем одним запросом
			console.log(`[AUDIENCE UPDATE] Отправка всех телефонов одним запросом`);
			return await sendAudienceUpdateRequest(apiVersion, audienceId, hashedPhones, accessToken);
		}
	} catch (error) {
		console.error('[AUDIENCE UPDATE] ERROR: Ошибка при обновлении аудитории:', error);
		throw error;
	}
}

/**
 * Вспомогательная функция для отправки запроса на обновление аудитории
 */
async function sendAudienceUpdateRequest(
	apiVersion: string,
	audienceId: string,
	hashedPhones: string[],
	accessToken: string
): Promise<UpdateAudienceResponse> {
	const url = `https://graph.facebook.com/${apiVersion}/${audienceId}/users`;
	
	console.log(`[AUDIENCE UPDATE] Запрос на URL: ${url}`);
	
	const payload = {
		schema: ['PHONE_SHA256'],
		data: hashedPhones.map(phone => [phone]),
		access_token: accessToken // Передаем токен в теле запроса
	};
	
	console.log(`[AUDIENCE UPDATE] Размер данных в запросе: ${JSON.stringify(payload).length} байт`);
	
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});
	
	if (!response.ok) {
		const errorText = await response.text();
		console.error(`[AUDIENCE UPDATE] ERROR: Facebook API Error Response: ${errorText}`);
		throw new Error(`Error updating audience: ${response.status} ${response.statusText}`);
	}
	
	const result = await response.json() as UpdateAudienceResponse;
	console.log(`[AUDIENCE UPDATE] SUCCESS: Аудитория успешно обновлена. Получено: ${result.num_received}, недействительных: ${result.num_invalid_entries || 0}`);
	
	return result;
}
