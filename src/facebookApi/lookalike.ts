/**
 * Модуль для работы с Lookalike аудиториями Facebook Ads API
 */

import { CreateAudienceResponse, Env, normalizeAdAccountId } from './types';

/**
 * Создает Lookalike аудиторию на основе существующей Custom Audience.
 * @param sourceAudienceId ID исходной Custom Audience
 * @param name Название новой Lookalike аудитории
 * @param countrySpec Код страны (например, 'US', 'RU')
 * @param ratio Размер Lookalike (от 0.01 до 0.20, что соответствует 1-20% населения)
 * @param accessToken Токен доступа Facebook
 * @param adAccountId ID рекламного аккаунта
 * @param env Окружение Worker'а
 * @returns ID созданной Lookalike аудитории
 */
export async function createLookalikeAudience(
	sourceAudienceId: string,
	name: string,
	countrySpec: string,
	ratio: number,
	accessToken: string,
	adAccountId: string,
	env: Env
): Promise<string> {
	try {
		// Проверяем, что значение ratio находится в допустимом диапазоне
		if (ratio < 0.01 || ratio > 0.20) {
			throw new Error('Ratio must be between 0.01 and 0.20 (1% to 20% of population)');
		}
		
		// Нормализуем ID аккаунта
		const accountId = normalizeAdAccountId(adAccountId);
		
		// Сначала проверяем KV, есть ли уже ID для этой Lookalike аудитории
		const lookalikeIdKeyInKV = `lookalike:${name}:${countrySpec}:${ratio}`;
		const cachedLookalikeId = await env.AUDIENCE_CACHE.get(lookalikeIdKeyInKV);
		
		if (cachedLookalikeId) {
			console.log(`Found cached Lookalike audience ID for "${name}": ${cachedLookalikeId}`);
			return cachedLookalikeId;
		}
		
		const apiVersion = 'v22.0';
		
		// Создаем Lookalike аудиторию
		console.log(`Creating new Lookalike audience "${name}" from source audience ${sourceAudienceId}...`);
		
		const createUrl = `https://graph.facebook.com/${apiVersion}/${accountId}/customaudiences`;
		const createPayload = {
			name,
			subtype: 'LOOKALIKE',
			origin_audience_id: sourceAudienceId,
			lookalike_spec: JSON.stringify({
				country: countrySpec,
				ratio: ratio,
				type: 'custom_audience',
			}),
			access_token: accessToken
		};
		
		const createResponse = await fetch(createUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(createPayload)
		});
		
		if (!createResponse.ok) {
			const errorText = await createResponse.text();
			console.error(`Facebook API Error Response (create Lookalike): ${errorText}`);
			throw new Error(`Error creating Lookalike audience: ${createResponse.status} ${createResponse.statusText}`);
		}
		
		const createResult = await createResponse.json() as CreateAudienceResponse;
		const newLookalikeId = createResult.id;
		
		if (!newLookalikeId) {
			throw new Error('Failed to create Lookalike Audience: no ID returned');
		}
		
		console.log(`Successfully created new Lookalike audience "${name}" with ID: ${newLookalikeId}`);
		
		// Сохраняем ID в KV для будущих запросов
		await env.AUDIENCE_CACHE.put(lookalikeIdKeyInKV, newLookalikeId);
		
		return newLookalikeId;
	} catch (error) {
		console.error('Error in createLookalikeAudience:', error);
		throw error;
	}
}
