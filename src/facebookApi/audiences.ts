/**
 * Модуль для работы с аудиториями Facebook Ads API
 */

import { 
	CreateAudienceResponse, 
	CustomAudiencesListResponse, 
	Env, 
	UpdateAudienceResponse,
	normalizeAdAccountId
} from './types';

/**
 * Получает список всех Custom Audiences для рекламного аккаунта
 * @param accessToken Токен доступа Facebook
 * @param adAccountId ID рекламного аккаунта
 * @returns Список аудиторий с их данными
 */
export async function getCustomAudiences(
	accessToken: string,
	adAccountId: string
): Promise<CustomAudiencesListResponse> {
	try {
		// Нормализуем ID аккаунта
		const accountId = normalizeAdAccountId(adAccountId);
		console.log(`Using normalized Ad Account ID: ${accountId}`);
		
		// Очень простой запрос, который точно работал на предыдущем шаге
		const apiVersion = 'v19.0';
		const fields = 'id,name';
		const url = `https://graph.facebook.com/${apiVersion}/${accountId}/customaudiences?fields=${fields}&access_token=${accessToken}`;
		
		console.log(`Requesting URL: ${url.replace(accessToken, '[REDACTED]')}`);
		
		const response = await fetch(url);
		
		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Facebook API Error Response: ${errorText}`);
			throw new Error(`Facebook API request failed: ${response.status} ${response.statusText}`);
		}
		
		const data = await response.json() as CustomAudiencesListResponse;
		console.log(`Successfully fetched ${data.data?.length || 0} audiences.`);
		
		return data;
	} catch (error) {
		console.error('Error fetching audiences:', error);
		throw error;
	}
}

/**
 * Находит или создает Custom Audience для телефонных номеров.
 * @param name Название аудитории
 * @param description Описание аудитории
 * @param accessToken Токен доступа Facebook
 * @param adAccountId ID рекламного аккаунта
 * @param env Окружение Worker'а
 * @returns ID созданной/найденной аудитории
 */
export async function findOrCreateCustomAudience(
	name: string,
	description: string,
	accessToken: string,
	adAccountId: string,
	env: Env
): Promise<string> {
	try {
		// Нормализуем ID аккаунта
		const accountId = normalizeAdAccountId(adAccountId);
		
		// Сначала проверяем KV, есть ли уже ID аудитории с таким именем
		// (использовать имя как ключ - это надежный способ идентификации аудитории)
		const audienceIdKeyInKV = `audience:${name}`;
		const cachedAudienceId = await env.AUDIENCE_CACHE.get(audienceIdKeyInKV);
		
		if (cachedAudienceId) {
			console.log(`Found cached audience ID for "${name}": ${cachedAudienceId}`);
			return cachedAudienceId;
		}
		
		const apiVersion = 'v19.0';
		
		// Если не нашли в KV, ищем по имени через API
		// Получаем список всех Custom Audiences для этого аккаунта
		const url = `https://graph.facebook.com/${apiVersion}/${accountId}/customaudiences?fields=id,name&access_token=${accessToken}`;
		
		console.log(`Searching for existing audience with name "${name}"...`);
		const response = await fetch(url);
		
		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Facebook API Error Response: ${errorText}`);
			throw new Error(`Error searching audiences: ${response.status} ${response.statusText}`);
		}
		
		const audiencesList: CustomAudiencesListResponse = await response.json();
		const existingAudience = audiencesList.data.find(audience => audience.name === name);
		
		if (existingAudience) {
			console.log(`Found existing audience with name "${name}", ID: ${existingAudience.id}`);
			
			// Сохраняем ID в KV для будущих запросов
			await env.AUDIENCE_CACHE.put(audienceIdKeyInKV, existingAudience.id);
			
			return existingAudience.id;
		}
		
		// Если аудитория не найдена, создаем новую
		console.log(`Creating new audience with name "${name}"...`);
		
		const createUrl = `https://graph.facebook.com/${apiVersion}/${accountId}/customaudiences`;
		const createPayload = {
			name,
			description,
			subtype: 'CUSTOM',
			customer_file_source: 'USER_PROVIDED_ONLY'
		};
		
		const createResponse = await fetch(createUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				...createPayload,
				access_token: accessToken
			})
		});
		
		if (!createResponse.ok) {
			const errorText = await createResponse.text();
			console.error(`Facebook API Error Response (create audience): ${errorText}`);
			throw new Error(`Error creating audience: ${createResponse.status} ${createResponse.statusText}`);
		}
		
		const createResult = await createResponse.json() as CreateAudienceResponse;
		const newAudienceId = createResult.id;
		
		if (!newAudienceId) {
			throw new Error('Failed to create Custom Audience: no ID returned');
		}
		
		console.log(`Successfully created new audience "${name}" with ID: ${newAudienceId}`);
		
		// Сохраняем ID в KV для будущих запросов
		await env.AUDIENCE_CACHE.put(audienceIdKeyInKV, newAudienceId);
		
		return newAudienceId;
	} catch (error) {
		console.error('Error in findOrCreateCustomAudience:', error);
		throw error;
	}
}
