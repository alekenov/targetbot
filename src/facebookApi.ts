// src/facebookApi.ts

// Интерфейс для описания структуры ответа API
interface Campaign {
	id: string;
	name: string;
	status: string;
}

interface CampaignsResponse {
	data: Campaign[];
	paging?: {
		cursors: {
			before: string;
			after: string;
		};
		next?: string;
	};
}

/**
 * Получает список кампаний из Facebook Ads API.
 * @param accessToken - Токен доступа пользователя Facebook.
 * @param adAccountId - ID рекламного аккаунта (в формате act_...).
 * @returns Промис, который разрешается объектом с данными кампаний.
 */
export async function getCampaigns(accessToken: string, adAccountId: string): Promise<CampaignsResponse> {
	const apiVersion = 'v19.0'; // Используем актуальную версию API
	const fields = 'name,status'; // Запрашиваемые поля
	// Normalize adAccountId in case it contains an accidental 'FB_ACCOUNT_ID=' prefix
	const accountId = adAccountId.includes('=') ? adAccountId.split('=')[1] : adAccountId;
	const url = `https://graph.facebook.com/${apiVersion}/${accountId}/campaigns?fields=${fields}&access_token=${accessToken}`;

	console.log(`Requesting URL: ${url.replace(accessToken, '[REDACTED]')}`); // Логируем URL без токена

	try {
		const response = await fetch(url);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Facebook API Error Response: ${errorText}`);
			throw new Error(`Facebook API request failed: ${response.status} ${response.statusText}`);
		}

		const data: CampaignsResponse = await response.json();
		console.log(`Successfully fetched ${data.data?.length || 0} campaigns.`);
		return data;

	} catch (error) {
		console.error('Error fetching campaigns:', error);
		// Перебрасываем ошибку для обработки выше
		throw error;
	}
}

// Интерфейсы для работы с аудиториями
interface CustomAudienceResponse {
	id: string;
	name: string;
	subtype: string;
	description?: string;
	approximate_count?: number;
	time_created?: string;
	time_updated?: string;
}

interface CustomAudiencesListResponse {
	data: CustomAudienceResponse[];
	paging?: {
		cursors: {
			before: string;
			after: string;
		};
		next?: string;
	};
}

// Интерфейсы для ответов API при создании/обновлении аудиторий
interface CreateAudienceResponse {
	id: string;
	[key: string]: any;
}

interface UpdateAudienceResponse {
	audience_id: string;
	num_received?: number;
	num_invalid_entries?: number;
	[key: string]: any;
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
		// Нормализуем ID аккаунта (на случай, если содержит префикс)
		const accountId = adAccountId.includes('=') ? adAccountId.split('=')[1] : adAccountId;
		
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

/**
 * Интерфейс для окружения Worker'а
 * Определяем здесь, чтобы функции имели доступ к KV.
 */
export interface Env {
	// Секреты для Facebook API
	FB_ACCESS_TOKEN: string;
	FB_AD_ACCOUNT_ID: string;
	
	// KV namespace для кэширования ID аудиторий
	AUDIENCE_CACHE: KVNamespace;
	
	// Binding for Assets, added by wrangler init
	ASSETS: Fetcher;
}
