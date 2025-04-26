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
		console.log(`[AUDIENCES] Получение списка аудиторий для аккаунта: ${accountId}`);
		
		// Используем последнюю версию API
		const apiVersion = 'v22.0';
		const fields = 'id,name,subtype,description'; // Поле approximate_count больше не поддерживается
		
		// Формируем параметры запроса
		const params = new URLSearchParams({
			fields,
			access_token: accessToken
		});
		
		const url = `https://graph.facebook.com/${apiVersion}/${accountId}/customaudiences?${params.toString()}`;
		
		console.log(`[AUDIENCES] Запрос: ${url.replace(accessToken, '[REDACTED]')}`);
		
		const response = await fetch(url);
		
		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[AUDIENCES] ERROR: Facebook API Error Response (${response.status} ${response.statusText}): ${errorText}`);
			console.error(`[AUDIENCES] ERROR: Headers: ${JSON.stringify([...response.headers.entries()])}`);
			throw new Error(`Facebook API request failed: ${response.status} ${response.statusText}`);
		}
		
		const data = await response.json() as CustomAudiencesListResponse;
		console.log(`[AUDIENCES] SUCCESS: Получено ${data.data?.length || 0} аудиторий`);
		
		// Выводим список полученных аудиторий для отладки
		if (data.data && data.data.length > 0) {
			console.log(`[AUDIENCES] Список аудиторий:`);
			data.data.forEach((audience, index) => {
				console.log(`  ${index + 1}. ID: ${audience.id}, Name: ${audience.name}, Type: ${audience.subtype || 'Unknown'}, Count: ${audience.approximate_count || 'N/A'}`);
			});
		}
		
		return data;
	} catch (error) {
		console.error('[AUDIENCES] ERROR: Ошибка при получении аудиторий:', error);
		throw error;
	}
}

/**
 * Находит существующую или создает новую аудиторию по имени
 * @param accessToken Токен Facebook
 * @param adAccountId ID рекламного аккаунта
 * @param audienceName Имя аудитории для поиска/создания
 * @param description Описание (используется если аудитория создается)
 * @returns ID найденной или созданной аудитории
 */
export async function findOrCreateCustomAudience(
	accessToken: string,
	adAccountId: string,
	audienceName: string,
	description?: string
): Promise<string> {
	console.log(`[AUDIENCES] Поиск или создание аудитории: "${audienceName}"`);
	try {
		// Нормализуем ID аккаунта
		const accountId = normalizeAdAccountId(adAccountId);
		
		// Получаем список существующих аудиторий
		const existingAudiences = await getCustomAudiences(accessToken, accountId);
		
		// Ищем аудиторию с указанным именем
		const foundAudience = existingAudiences.data.find(audience => 
			audience.name.toLowerCase() === audienceName.toLowerCase()
		);
		
		// Если аудитория найдена, возвращаем ее ID
		if (foundAudience) {
			console.log(`[AUDIENCES] Найдена существующая аудитория "${audienceName}" с ID: ${foundAudience.id}`);
			return foundAudience.id;
		}
		
		// Если аудитория не найдена, создаем новую
		console.log(`[AUDIENCES] Аудитория "${audienceName}" не найдена. Создаем новую...`);
		
		const apiVersion = 'v22.0';
		const url = `https://graph.facebook.com/${apiVersion}/${accountId}/customaudiences`;
		
		const payload = {
			name: audienceName,
			description: description || `Custom audience: ${audienceName}`,
			subtype: 'CUSTOM',
			customer_file_source: 'USER_PROVIDED_ONLY',
			access_token: accessToken // Добавляем токен в тело запроса
		};
		
		console.log(`[AUDIENCES] Создание новой аудитории: ${JSON.stringify(payload, null, 2)}`);
		
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[AUDIENCES] ERROR: Ошибка создания аудитории: ${errorText}`);
			throw new Error(`Failed to create Custom Audience: ${response.status} ${response.statusText}`);
		}
		
		const data = await response.json() as CreateAudienceResponse;
		console.log(`[AUDIENCES] SUCCESS: Создана новая аудитория с ID: ${data.id}`);
		
		return data.id;
	} catch (error) {
		console.error('[AUDIENCES] ERROR: Ошибка при поиске/создании аудитории:', error);
		throw error;
	}
}

/**
 * Создает новую Custom Audience напрямую
 * @param name Название аудитории
 * @param description Описание аудитории
 * @param accessToken Токен доступа Facebook
 * @param adAccountId ID рекламного аккаунта
 * @param env Окружение Worker'а
 * @returns ID созданной аудитории
 */
export async function createCustomAudience(
	name: string,
	description: string,
	accessToken: string,
	adAccountId: string,
	env: Env
): Promise<string> {
	try {
		// Нормализуем ID аккаунта
		const accountId = normalizeAdAccountId(adAccountId);
		
		console.log(`[AUDIENCES] Создание новой аудитории: "${name}"`);
		
		const apiVersion = 'v22.0';
		const url = `https://graph.facebook.com/${apiVersion}/${accountId}/customaudiences`;
		
		// Формируем параметры запроса с минимальным набором необходимых полей
		const payload = {
			name,
			description,
			subtype: 'CUSTOM',
			customer_file_source: 'USER_PROVIDED_ONLY',
			access_token: accessToken
		};
		
		console.log(`[AUDIENCES] Запрос на создание аудитории: ${url}`);
		console.log(`[AUDIENCES] Параметры запроса: ${JSON.stringify(payload, (key, value) => key === 'access_token' ? '[REDACTED]' : value, 2)}`);
		
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[AUDIENCES] ERROR: Ошибка при создании аудитории (${response.status} ${response.statusText}): ${errorText}`);
			console.error(`[AUDIENCES] ERROR: Headers: ${JSON.stringify([...response.headers.entries()])}`);
			throw new Error(`Facebook API request failed: ${response.status} ${response.statusText}`);
		}
		
		const result = await response.json() as CreateAudienceResponse;
		console.log(`[AUDIENCES] SUCCESS: Аудитория успешно создана с ID: ${result.id}`);
		
		// Сохраняем ID аудитории в KV хранилище для быстрого доступа в будущем
		const audienceIdKey = `audience:${name}`;
		await env.AUDIENCE_CACHE.put(audienceIdKey, result.id);
		
		return result.id;
		
	} catch (error) {
		console.error(`[AUDIENCES] ERROR: Ошибка при создании аудитории:`, error);
		throw error;
	}
}
